package com.chandrabindu.home.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.sse.EventSource
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * All state and actions, shared by every surface (app, Device Controls, Quick
 * Settings tiles, widget). Mirrors the macOS app's AppState.
 *
 * Live data is reference counted: a surface that is on screen calls [acquire]
 * and the repository keeps the SSE stream (or the 20s polling fallback) running
 * until the last one calls [release]. Surfaces that only need a one-off read
 * (widget, a tile tap) call [ensureFresh].
 *
 * Internal bookkeeping runs on the main thread; public suspend functions hop
 * there themselves, so they're safe to call from any coroutine.
 */
class HomeRepository(context: Context) {
    val prefs = Prefs(context)
    private val secure = SecureStore(context)
    val cookieJar = PersistentCookieJar(secure)
    val client = HubClient(prefs.server, cookieJar)

    private val _state = MutableStateFlow(HomeState(serverAddress = client.base))
    val state: StateFlow<HomeState> = _state.asStateFlow()
    val current: HomeState get() = _state.value

    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val watchers = mutableSetOf<String>()
    private var eventSource: EventSource? = null
    private var noLiveStream = false
    private var pollJob: Job? = null
    private var retryJob: Job? = null
    private var stopJob: Job? = null
    private var reconnectJob: Job? = null
    private var checkJob: Deferred<Unit>? = null
    private var lastLoad = 0L
    private val toastIds = AtomicLong()

    /** Last non-zero fan level per control, so a Device Controls tap restores it. */
    val lastLevel = mutableMapOf<String, String>()

    init {
        StoredSession.fromJson(secure.get("session"))?.let { saved ->
            if (HubClient.normalize(saved.server) == client.base) {
                client.token = saved.token
                _state.update { it.copy(session = saved) }
            } else {
                secure.put("session", null) // signed in to a different hub address
            }
        }
        if (current.session != null) restoreCache()
    }

    /** Names and layout from the last successful load (values stay unknown until read). */
    private fun restoreCache() {
        try {
            val rooms = prefs.cachedRooms?.let { Parse.rooms(JSONObject(it)) } ?: return
            val favs = prefs.cachedFavourites?.let { Parse.favourites(JSONObject(it)) } ?: emptyList()
            _state.update {
                it.copy(
                    rooms = rooms.rooms, houseName = rooms.houseName?.takeIf { n -> n.isNotBlank() } ?: it.houseName,
                    favourites = favs, setupIncomplete = !rooms.setupConfigured,
                )
            }
        } catch (_: Exception) {
        }
    }

    private suspend fun <T> main(block: suspend () -> T): T = withContext(Dispatchers.Main.immediate) { block() }

    // region Lifecycle

    val isWatched: Boolean get() = watchers.isNotEmpty()

    /** A surface became visible: keep data live while it is. */
    fun acquire(tag: String) {
        val wasEmpty = watchers.isEmpty()
        watchers += tag
        stopJob?.cancel()
        stopJob = null
        val s = current
        when (s.phase) {
            Phase.READY -> {
                if (eventSource == null && !noLiveStream) startEvents()
                startPolling()
                if (wasEmpty && System.currentTimeMillis() - lastLoad > 20_000) scope.launch { reloadQuietly() }
            }
            Phase.NEEDS_LOGIN -> Unit
            else -> reconnect()
        }
        if (s.isAway) scheduleRetry()
    }

    fun release(tag: String) {
        watchers -= tag
        if (watchers.isNotEmpty()) return
        stopJob?.cancel()
        stopJob = scope.launch {
            delay(15_000)
            if (watchers.isEmpty()) {
                stopEvents()
                pollJob?.cancel()
                retryJob?.cancel()
                retryJob = null
            }
        }
    }

    fun reconnect() {
        scope.launch { checkAndLoad() }
    }

    /** Called when the network changes (Wi-Fi joined). */
    fun onNetworkAvailable() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(1_500) // let DHCP settle
            val s = current
            when {
                s.phase != Phase.READY || (isWatched && !s.live && !noLiveStream) -> checkAndLoad()
                // Nothing on screen: a cheap knock tells the widget and tiles whether we just left home.
                !isWatched && client.ping() != Reachability.OK -> goUnreachable(notHub = false)
            }
        }
    }

    /** For one-shot surfaces: make sure state is loaded and reasonably fresh. */
    suspend fun ensureFresh(maxAgeMs: Long = 30_000) = main {
        val s = current
        val fresh = s.phase == Phase.READY &&
            (s.live || (s.statusLoadedAt?.let { System.currentTimeMillis() - it < maxAgeMs } ?: false))
        if (!fresh && s.phase != Phase.NEEDS_LOGIN) checkAndLoad()
    }

    /** Ping, load, and start live updates. Concurrent callers share one run. */
    suspend fun checkAndLoad() = main {
        checkJob?.takeIf { it.isActive }?.let { return@main it.await() }
        val job = scope.async { doCheckAndLoad() }
        checkJob = job
        job.await()
    }

    private suspend fun doCheckAndLoad() {
        // While away, keep saying so until a knock actually succeeds (no "Connecting…" flicker).
        if (current.phase != Phase.READY && !current.isAway) _state.update { it.copy(phase = Phase.CHECKING) }
        var reach = client.ping()
        if (reach == Reachability.UNREACHABLE && !current.isAway) {
            // A freshly started process (or a just-joined network) can fail its first
            // connection; knock once more before telling the user they're away.
            delay(1_500)
            reach = client.ping()
        }
        when (reach) {
            Reachability.UNREACHABLE -> return goUnreachable(notHub = false)
            Reachability.NOT_HUB -> return goUnreachable(notHub = true)
            Reachability.OK -> Unit
        }
        retryJob?.cancel()
        retryJob = null

        if (current.session == null) {
            _state.update { it.copy(phase = Phase.NEEDS_LOGIN) }
            return
        }
        try {
            loadAll()
            _state.update { it.copy(phase = Phase.READY) }
            if (isWatched) {
                if (eventSource == null) {
                    noLiveStream = false
                    startEvents()
                }
                // No live stream after a moment (hub without the gateway)? Read states directly.
                delay(1_500)
                if (!current.live) refreshStatuses()
                startPolling()
            } else if (!current.live) {
                refreshStatuses()
            }
        } catch (e: HubException.Unauthorized) {
            expireSession()
        } catch (e: HubException) {
            goUnreachable(notHub = false)
        }
    }

    private fun goUnreachable(notHub: Boolean) {
        _state.update { it.copy(phase = if (notHub) Phase.NOT_HUB else Phase.UNREACHABLE, live = false) }
        stopEvents()
        pollJob?.cancel()
        scheduleRetry()
    }

    /** Keep knocking quietly every 20s while away and something is on screen. */
    private fun scheduleRetry() {
        if (retryJob?.isActive == true || !isWatched) return
        retryJob = scope.launch {
            while (isActive) {
                delay(20_000)
                if (!current.isAway || !isWatched) break
                if (client.ping() == Reachability.OK) {
                    retryJob = null
                    checkAndLoad()
                    return@launch
                }
            }
            retryJob = null
        }
    }

    // endregion

    // region Loading

    private suspend fun loadAll() {
        val roomsJson = client.get("/api/rooms")
        val rooms = Parse.rooms(roomsJson)
        prefs.cachedRooms = roomsJson.toString()
        val favs = scope.async {
            runCatching {
                val o = client.get("/api/favourites")
                prefs.cachedFavourites = o.toString()
                Parse.favourites(o)
            }.getOrNull()
        }
        val routines = scope.async { runCatching { Parse.routines(client.get("/api/routines")) }.getOrNull() }
        val autos = scope.async { runCatching { Parse.automations(client.get("/api/automations")) }.getOrNull() }
        val f = favs.await()
        val r = routines.await()
        val a = autos.await()
        _state.update { s ->
            s.copy(
                rooms = rooms.rooms,
                houseName = rooms.houseName?.takeIf { it.isNotBlank() } ?: s.houseName,
                appLocked = rooms.locked,
                lockReason = rooms.lockReason,
                setupIncomplete = !rooms.setupConfigured,
                aiAvailable = rooms.aiAvailable,
                favourites = f ?: s.favourites,
                routines = r ?: s.routines,
                automations = a ?: s.automations,
            )
        }
        lastLoad = System.currentTimeMillis()
    }

    suspend fun reloadQuietly() = main {
        try {
            loadAll()
        } catch (e: Exception) {
            handle(e)
        }
    }

    /** Direct status reads (used when the hub has no live event stream). */
    suspend fun refreshStatuses(only: List<String>? = null) = main {
        val targets = only ?: current.rooms.flatMap { it.devices }.filter { !it.bluetooth && !roomBlocked(it.id) }.map { it.id }
        // A few at a time: without the gateway each read is a LAN round trip on the hub.
        for (chunk in targets.chunked(4)) {
            val results = chunk.map { id ->
                scope.async {
                    id to runCatching { Parse.status(client.get("/api/devices/$id/status", timeoutSec = 20)) }
                }
            }.awaitAll()
            if (results.any { (it.second.exceptionOrNull() as? HubException.Unauthorized) != null }) {
                expireSession()
                return@main
            }
            _state.update { s ->
                val values = s.values.toMutableMap()
                val offline = s.offline.toMutableSet()
                for ((id, r) in results) {
                    val map = r.getOrNull()
                    if (map != null) {
                        values[id] = map
                        offline -= id
                    } else if ((r.exceptionOrNull() as? HubException.Server)?.code != 423) {
                        offline += id
                    }
                }
                s.copy(values = values, offline = offline)
            }
        }
        _state.update { it.copy(statusLoadedAt = System.currentTimeMillis()) }
    }

    private fun roomBlocked(deviceId: String) =
        current.rooms.firstOrNull { r -> r.devices.any { it.id == deviceId } }?.isBlocked == true

    /** Make sure one device's state is known (before a widget/tile toggles it). */
    suspend fun ensureDeviceStatus(deviceId: String) = main {
        if (current.live && current.values.containsKey(deviceId)) return@main
        refreshStatuses(listOf(deviceId))
    }

    private fun startPolling() {
        pollJob?.cancel()
        if (current.live || current.phase != Phase.READY || !isWatched) return
        pollJob = scope.launch {
            while (isActive) {
                delay(20_000)
                if (!isWatched || current.live || current.phase != Phase.READY) return@launch
                refreshStatuses()
            }
        }
    }

    // endregion

    // region Live events

    private fun startEvents() {
        if (eventSource != null || current.session == null) return
        var source: EventSource? = null
        source = client.openEvents(object : HubClient.StreamHandler {
            override fun onOpen() = Unit
            override fun onEvent(name: String, data: String) {
                scope.launch { if (eventSource === source) handleEvent(name, data) }
            }

            override fun onClosed(code: Int?) {
                // Ignore streams we already replaced or stopped on purpose.
                scope.launch { if (eventSource === source) streamClosed(code) }
            }
        })
        eventSource = source
    }

    private fun stopEvents() {
        eventSource?.cancel()
        eventSource = null
        _state.update { it.copy(live = false) }
    }

    private suspend fun streamClosed(code: Int?) {
        eventSource = null
        _state.update { it.copy(live = false) }
        when (code) {
            204 -> { // no device gateway: polling fallback
                noLiveStream = true
                startPolling()
                return
            }
            401 -> return expireSession()
        }
        if (!isWatched || current.phase != Phase.READY) return
        startPolling()
        delay(5_000)
        if (!isWatched || eventSource != null || current.phase != Phase.READY) return
        // A dropped stream usually means the network changed.
        if (client.ping() != Reachability.OK) goUnreachable(notHub = false) else startEvents()
    }

    private fun handleEvent(name: String, data: String) {
        val o = try {
            JSONObject(data)
        } catch (_: Exception) {
            JSONObject()
        }
        when (name) {
            "snapshot" -> {
                val devices = o.optJSONArray("devices") ?: JSONArray()
                _state.update { s ->
                    val values = s.values.toMutableMap()
                    val offline = s.offline.toMutableSet()
                    for (i in 0 until devices.length()) {
                        val d = devices.optJSONObject(i) ?: continue
                        val id = d.optString("id")
                        d.optJSONObject("status")?.let { values[id] = Parse.statusMap(it) }
                        if (d.optBoolean("connected", false)) offline -= id else offline += id
                    }
                    s.copy(values = values, offline = offline, live = true, statusLoadedAt = System.currentTimeMillis())
                }
                pollJob?.cancel()
            }
            "change" -> {
                val deviceId = o.optString("deviceId")
                val code = o.optString("code")
                if (deviceId.isEmpty() || code.isEmpty()) return
                val v = JsonValue.of(o.opt("value"))
                _state.update { s -> s.copy(values = s.values.with(deviceId, code, v), offline = s.offline - deviceId) }
            }
            "state" -> {
                val deviceId = o.optString("deviceId")
                val connected = o.optBoolean("connected", false)
                _state.update { s -> s.copy(offline = if (connected) s.offline - deviceId else s.offline + deviceId) }
            }
            "lock" -> _state.update { it.copy(appLocked = true, lockReason = o.optString("reason").ifEmpty { null }) }
            "unlock" -> _state.update { it.copy(appLocked = false, lockReason = null) }
        }
    }

    // endregion

    // region Account

    suspend fun signIn(username: String, password: String) = main {
        _state.update { it.copy(signingIn = true, loginError = null) }
        try {
            val r = client.send("/api/auth/login", body = JSONObject().put("username", username).put("password", password))
            val token = r.optString("token")
            if (token.isEmpty()) throw HubException.BadResponse()
            val session = StoredSession(token, r.optString("username", username), r.optString("role", "user"), client.base)
            secure.put("session", session.toJson())
            client.token = token
            _state.update { it.copy(session = session, signingIn = false) }
            checkAndLoad()
        } catch (e: HubException.Unauthorized) {
            _state.update { it.copy(signingIn = false, loginError = "Wrong username or password.") }
        } catch (e: HubException.Server) {
            _state.update { it.copy(signingIn = false, loginError = e.message) }
        } catch (e: Exception) {
            _state.update { it.copy(signingIn = false, loginError = "Can't reach your home hub.") }
        }
    }

    fun signOut() {
        val token = client.token
        if (token != null) scope.launch { runCatching { client.send("/api/auth/logout") } }
        clearSession()
        _state.update { it.copy(phase = Phase.NEEDS_LOGIN, loginError = null) }
    }

    /** For screens calling the hub directly: a 401 there means the session is gone. */
    fun sessionExpired() = expireSession()

    private fun expireSession() {
        clearSession()
        _state.update { it.copy(phase = Phase.NEEDS_LOGIN, loginError = "Your session ended. Please sign in again.") }
    }

    private fun clearSession() {
        stopEvents()
        pollJob?.cancel()
        noLiveStream = false
        secure.put("session", null)
        client.token = null
        cookieJar.clear()
        prefs.clearCache()
        _state.update {
            it.copy(
                session = null, rooms = emptyList(), values = emptyMap(), offline = emptySet(),
                favourites = emptyList(), routines = emptyList(), automations = emptyList(),
                statusLoadedAt = null, live = false, pending = emptySet(),
            )
        }
    }

    fun changeServer(address: String) {
        val normalized = HubClient.normalize(address)
        prefs.server = normalized
        if (normalized != client.base) {
            clearSession()
            client.setBase(normalized)
        }
        _state.update { it.copy(serverAddress = normalized, phase = Phase.CHECKING) }
        reconnect()
    }

    // endregion

    // region Actions

    /** The one-tap value: toggle a switch, step a fan, flip a dimmer off/full. */
    fun primaryValue(ref: ControlRef): JsonValue? {
        val current = current.value(ref.device.id, ref.fn.code)
        return when (ref.fn.type) {
            "Boolean" -> JsonValue.Bool(current?.bool != true)
            "Enum" -> {
                val options = ref.fn.range
                if (options.isEmpty()) return null
                val i = options.indexOf(current?.string ?: "")
                JsonValue.Str(options[(i + 1) % options.size])
            }
            "Integer" -> {
                val low = ref.fn.min ?: 0.0
                val high = ref.fn.max ?: 100.0
                JsonValue.Num(if (Controls.isOn(ref.fn, current)) low else high)
            }
            else -> null
        }
    }

    fun primaryAction(ref: ControlRef) {
        val v = primaryValue(ref) ?: return
        setValue(ref, v)
    }

    fun setValue(ref: ControlRef, value: JsonValue) {
        scope.launch { setValueNow(ref, value) }
    }

    /** Sends one command (optimistically). Returns true when the hub accepted it. */
    suspend fun setValueNow(ref: ControlRef, value: JsonValue): Boolean = main {
        if (current.block(ref) != Block.NONE) return@main false
        val deviceId = ref.device.id
        val code = ref.fn.code
        val previous = current.value(deviceId, code)
        if (ref.fn.type == "Enum" && Controls.isOn(ref.fn, value)) lastLevel[ref.id] = value.string
        _state.update { it.copy(values = it.values.with(deviceId, code, value), pending = it.pending + ref.id) }
        try {
            val cmd = JSONObject().put("code", code).put("value", value.json)
            client.send("/api/devices/$deviceId/commands", body = JSONObject().put("commands", JSONArray().put(cmd)))
            if (!current.live) {
                delay(700)
                refreshStatuses(listOf(deviceId))
            }
            true
        } catch (e: Exception) {
            _state.update { s ->
                s.copy(values = if (previous != null) s.values.with(deviceId, code, previous) else s.values)
            }
            handle(e)
            false
        } finally {
            _state.update { it.copy(pending = it.pending - ref.id) }
        }
    }

    /** Turn off every plain switch that is on in a room (never protected ones or locks). */
    fun turnOffRoom(room: Room) {
        val s = current
        if (s.appLocked || s.setupIncomplete || room.isBlocked) return
        for (device in room.devices) {
            if (device.bluetooth || device.id in s.offline) continue
            val fns = device.functions.filter {
                it.type == "Boolean" && !it.protected && !it.superProtected &&
                    !Controls.isChildLock(it) && s.value(device.id, it.code)?.bool == true
            }
            if (fns.isEmpty()) continue
            val id = device.id
            _state.update { st -> st.copy(values = fns.fold(st.values) { v, f -> v.with(id, f.code, JsonValue.Bool(false)) }) }
            scope.launch {
                try {
                    val cmds = JSONArray()
                    fns.forEach { cmds.put(JSONObject().put("code", it.code).put("value", false)) }
                    client.send("/api/devices/$id/commands", body = JSONObject().put("commands", cmds))
                } catch (e: Exception) {
                    _state.update { st -> st.copy(values = fns.fold(st.values) { v, f -> v.with(id, f.code, JsonValue.Bool(true)) }) }
                    handle(e)
                }
                if (!current.live) refreshStatuses(listOf(id))
            }
        }
    }

    fun master(on: Boolean) {
        scope.launch { masterNow(on) }
    }

    suspend fun masterNow(on: Boolean): Counts? = main {
        _state.update { it.copy(pending = it.pending + "master") }
        try {
            val r = Parse.counts(client.send("/api/master", body = JSONObject().put("on", on), timeoutSec = 180))
            var message = "All ${if (on) "on" else "off"}: ${r.ok} switched"
            if (r.failed > 0) message += ", ${r.failed} failed"
            show(message, error = r.failed > 0)
            if (!current.live) refreshStatuses()
            r
        } catch (e: Exception) {
            handle(e)
            null
        } finally {
            _state.update { it.copy(pending = it.pending - "master") }
        }
    }

    fun run(routine: Routine) {
        val s = current
        if (s.appLocked || s.setupIncomplete) return
        val key = "routine:${routine.id}"
        _state.update { it.copy(pending = it.pending + key) }
        scope.launch {
            try {
                val r = Parse.counts(client.send("/api/routines/${routine.id}/run", timeoutSec = 180))
                val bits = mutableListOf("${r.ok} done")
                if (r.failed > 0) bits += "${r.failed} failed"
                if (r.ignoredLocked > 0) bits += "${r.ignoredLocked} locked"
                flashRoutine(routine.id, bits.joinToString(" · "))
                if (!current.live) refreshStatuses()
            } catch (e: Exception) {
                flashRoutine(routine.id, "Failed")
                handle(e)
            } finally {
                _state.update { it.copy(pending = it.pending - key) }
            }
        }
    }

    private fun flashRoutine(id: String, text: String) {
        _state.update { it.copy(routineResult = it.routineResult + (id to text)) }
        scope.launch {
            delay(3_000)
            if (current.routineResult[id] == text) _state.update { it.copy(routineResult = it.routineResult - id) }
        }
    }

    /** Unlock a password-locked room for this session. Returns an error message, or null. */
    suspend fun unlockRoom(room: Room, password: String): String? = scope.async {
        // Runs in the repository's scope: the password screen leaves composition as soon as
        // the room reads as unlocked, and that must not cancel the follow-up status read.
        try {
            client.send("/api/rooms/${room.id}/unlock", body = JSONObject().put("password", password))
            reloadQuietly()
            // Read the room's states now: a live snapshot taken while it was locked doesn't include them.
            refreshStatuses(room.devices.filter { !it.bluetooth }.map { it.id })
            null
        } catch (e: HubException.Server) {
            e.message
        } catch (e: Exception) {
            handle(e)
            "Couldn't unlock the room."
        }
    }.await()

    fun toggleAutomation(automation: Automation) {
        if (!current.isAdmin) return
        val enabled = !automation.enabled
        fun set(v: Boolean) = _state.update { s ->
            s.copy(automations = s.automations.map { if (it.id == automation.id) it.copy(enabled = v) else it })
        }
        set(enabled)
        scope.launch {
            try {
                client.send("/api/automations/${automation.id}", "PUT", JSONObject().put("enabled", enabled))
            } catch (e: Exception) {
                set(!enabled)
                handle(e)
            }
        }
    }

    fun toggleFavourite(ref: ControlRef, announce: Boolean = true) {
        val fav = Favourite(ref.device.id, ref.fn.code)
        val make = !current.isFavourite(ref)
        fun apply(add: Boolean) = _state.update { s ->
            s.copy(favourites = if (add) (s.favourites - fav) + fav else s.favourites - fav)
        }
        apply(make)
        if (announce) show(if (make) "Added ${ref.fn.name} to Favourites" else "Removed ${ref.fn.name} from Favourites")
        scope.launch {
            try {
                client.send(
                    "/api/favourites",
                    body = JSONObject().put("deviceId", fav.deviceId).put("code", fav.code).put("favourite", make),
                )
            } catch (e: Exception) {
                apply(!make)
                handle(e)
            }
        }
    }

    fun unlockApp() {
        scope.launch {
            try {
                client.send("/api/lock", "PUT", JSONObject().put("locked", false))
                _state.update { it.copy(appLocked = false, lockReason = null) }
                reloadQuietly()
            } catch (e: Exception) {
                handle(e)
            }
        }
    }

    // endregion

    // region Feedback

    fun show(text: String, error: Boolean = false) {
        val toast = Toast(toastIds.incrementAndGet(), text, error)
        _state.update { it.copy(toast = toast) }
        scope.launch {
            delay(3_500)
            if (current.toast?.id == toast.id) _state.update { it.copy(toast = null) }
        }
    }

    fun dismissToast() = _state.update { it.copy(toast = null) }

    private fun handle(e: Throwable) {
        when (e) {
            is kotlinx.coroutines.CancellationException -> return
            is HubException.Unauthorized -> return expireSession()
            is HubException.Unreachable -> {
                show("Can't reach your home hub.", error = true)
                reconnect()
            }
            else -> show(e.message ?: "Something went wrong.", error = true)
        }
    }

    // endregion

    /** Waits (briefly) for the first live snapshot, for surfaces that just opened. */
    suspend fun awaitLive(timeoutMs: Long) {
        withTimeoutOrNull(timeoutMs) {
            while (!current.live && current.phase == Phase.READY && !noLiveStream) delay(100)
        }
    }
}

private fun Map<String, Map<String, JsonValue>>.with(deviceId: String, code: String, v: JsonValue) =
    this + (deviceId to ((this[deviceId] ?: emptyMap()) + (code to v)))
