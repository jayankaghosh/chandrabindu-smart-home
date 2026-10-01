package com.chandrabindu.home.data

enum class Phase { CHECKING, UNREACHABLE, NOT_HUB, NEEDS_LOGIN, READY }

data class Toast(val id: Long, val text: String, val isError: Boolean)

sealed class SearchHit {
    abstract val id: String

    data class RoutineHit(val routine: Routine) : SearchHit() {
        override val id get() = "r:${routine.id}"
    }

    data class ControlHit(val ref: ControlRef) : SearchHit() {
        override val id get() = "c:${ref.id}"
    }
}

/** Everything the UI surfaces render. Immutable; the repository swaps it atomically. */
data class HomeState(
    val phase: Phase = Phase.CHECKING,
    val serverAddress: String = Prefs.DEFAULT_SERVER,
    val session: StoredSession? = null,
    val rooms: List<Room> = emptyList(),
    val houseName: String = "Home",
    val values: Map<String, Map<String, JsonValue>> = emptyMap(),
    val offline: Set<String> = emptySet(),
    val favourites: List<Favourite> = emptyList(),
    val routines: List<Routine> = emptyList(),
    val automations: List<Automation> = emptyList(),
    val appLocked: Boolean = false,
    val lockReason: String? = null,
    val setupIncomplete: Boolean = false,
    val live: Boolean = false,
    val statusLoadedAt: Long? = null,
    val pending: Set<String> = emptySet(),
    val routineResult: Map<String, String> = emptyMap(),
    val toast: Toast? = null,
    val signingIn: Boolean = false,
    val loginError: String? = null,
) {
    val isAdmin: Boolean get() = session?.isAdmin == true

    /** Away from home (or something else answered at the address). */
    val isAway: Boolean get() = phase == Phase.UNREACHABLE || phase == Phase.NOT_HUB

    fun value(deviceId: String, code: String): JsonValue? = values[deviceId]?.get(code)

    fun onCount(room: Room): Int = room.devices.sumOf { d ->
        d.functions.count { Controls.countsAsOn(it, value(d.id, it.code)) }
    }

    val onCount: Int get() = rooms.sumOf { onCount(it) }

    /** Whether the count can be trusted (live stream, or a recent read). */
    val statusKnown: Boolean
        get() = live || (statusLoadedAt?.let { System.currentTimeMillis() - it < 5 * 60_000 } ?: false)

    fun block(ref: ControlRef): Block = when {
        appLocked -> Block.APP_LOCKED
        setupIncomplete -> Block.SETUP
        ref.device.bluetooth -> Block.BLUETOOTH
        ref.room.isBlocked -> Block.ROOM_LOCKED
        ref.fn.superProtected -> Block.SUPER_PROTECTED
        (ref.fn.protected || Controls.isChildLock(ref.fn)) && !isAdmin -> Block.ADMIN_ONLY
        ref.device.id in offline -> Block.OFFLINE
        else -> Block.NONE
    }

    fun isPending(key: String) = key in pending

    fun findRef(deviceId: String, code: String): ControlRef? {
        for (room in rooms) {
            val device = room.devices.firstOrNull { it.id == deviceId } ?: continue
            val fn = device.functions.firstOrNull { it.code == code } ?: return null
            return ControlRef(room, device, fn)
        }
        return null
    }

    fun findRef(key: String): ControlRef? {
        val i = key.indexOf("::")
        if (i < 0) return null
        return findRef(key.substring(0, i), key.substring(i + 2))
    }

    val favouriteRefs: List<ControlRef>
        get() = favourites.mapNotNull { fav ->
            findRef(fav.deviceId, fav.code)?.takeIf { Controls.isListed(it.fn) && !it.device.bluetooth }
        }

    fun isFavourite(ref: ControlRef) = favourites.contains(Favourite(ref.device.id, ref.fn.code))

    /** Every listed control (Bluetooth panels can't be reached over the LAN). */
    val allControls: List<ControlRef>
        get() = rooms.flatMap { room ->
            room.devices.filter { !it.bluetooth }.flatMap { d ->
                d.functions.filter(Controls::isListed).map { ControlRef(room, d, it) }
            }
        }

    fun searchHits(query: String): List<SearchHit> {
        val tokens = query.lowercase().split(" ").filter { it.isNotBlank() }
        if (tokens.isEmpty()) return emptyList()
        fun matches(text: String): Boolean {
            val hay = text.lowercase()
            return tokens.all { it in hay }
        }
        val hits = mutableListOf<SearchHit>()
        routines.filter { matches("${it.name} routine scene") }.forEach { hits += SearchHit.RoutineHit(it) }
        for (ref in allControls) {
            if (matches("${ref.room.name} ${ref.device.name} ${ref.fn.name}")) hits += SearchHit.ControlHit(ref)
        }
        return hits.take(40)
    }

    /** The control a Quick Settings favourite tile (slot 0..2) is bound to. */
    fun tileRef(slot: Int, prefs: Prefs): ControlRef? {
        prefs.tileBinding(slot)?.let { key -> findRef(key)?.let { return it } }
        return favouriteRefs.getOrNull(slot)
    }
}
