package com.chandrabindu.home.controls

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.controls.Control
import android.service.controls.ControlsProviderService
import android.service.controls.DeviceTypes
import android.service.controls.actions.BooleanAction
import android.service.controls.actions.CommandAction
import android.service.controls.actions.ControlAction
import android.service.controls.actions.FloatAction
import android.service.controls.templates.ControlButton
import android.service.controls.templates.ControlTemplate
import android.service.controls.templates.RangeTemplate
import android.service.controls.templates.StatelessTemplate
import android.service.controls.templates.ToggleRangeTemplate
import android.service.controls.templates.ToggleTemplate
import androidx.annotation.RequiresApi
import com.chandrabindu.home.App
import com.chandrabindu.home.data.Block
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.JsonValue
import com.chandrabindu.home.data.Phase
import com.chandrabindu.home.ui.MainActivity
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.concurrent.Flow
import java.util.function.Consumer

/**
 * Android's built-in smart-home panel (power menu / Quick Settings "Device
 * controls", usable from the lock screen). Structure = house, zone = room,
 * title = control, subtitle = panel.
 *
 * Only plain controls are published: protected switches and the panel button
 * lock are admin-only, and the super-protected lifeline can't be turned off at
 * all, so they stay in the app. Locked rooms and Bluetooth panels are left out.
 */
@RequiresApi(Build.VERSION_CODES.R)
class HomeControlsService : ControlsProviderService() {
    private val repo get() = App.repo

    private val appIntent: PendingIntent by lazy {
        PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun eligible(s: HomeState, ref: ControlRef) =
        Controls.isListed(ref.fn) && !ref.device.bluetooth && !ref.fn.superProtected &&
            !ref.fn.protected && !ref.room.isBlocked

    override fun createPublisherForAllAvailable(): Flow.Publisher<Control> = ControlPublisher { emit, complete ->
        repo.scope.launch {
            repo.ensureFresh()
            val s = repo.current
            if (s.phase == Phase.READY) {
                s.allControls.filter { eligible(s, it) }.forEach { emit(stateless(s, it)) }
            }
            complete()
        }
    }

    override fun createPublisherForSuggested(): Flow.Publisher<Control> = ControlPublisher { emit, complete ->
        repo.scope.launch {
            repo.ensureFresh()
            val s = repo.current
            if (s.phase == Phase.READY) {
                s.favouriteRefs.filter { eligible(s, it) }.take(6).forEach { emit(stateless(s, it)) }
            }
            complete()
        }
    }

    override fun createPublisherFor(controlIds: List<String>): Flow.Publisher<Control> =
        ControlPublisher(onCancel = { repo.release(TAG) }) { emit, _ ->
            repo.acquire(TAG)
            repo.scope.launch {
                val sent = HashMap<String, String>()
                launch { repo.ensureFresh() }
                repo.state.collectLatest { s ->
                    for (id in controlIds) {
                        val (control, signature) = stateful(s, id)
                        if (sent[id] != signature) {
                            sent[id] = signature
                            emit(control)
                        }
                    }
                }
            }
        }

    override fun performControlAction(controlId: String, action: ControlAction, consumer: Consumer<Int>) {
        val s = repo.current
        if (s.phase != Phase.READY) {
            consumer.accept(ControlAction.RESPONSE_FAIL)
            repo.reconnect()
            return
        }
        val ref = s.findRef(controlId)
        if (ref == null || !eligible(s, ref) || s.block(ref) != Block.NONE) {
            consumer.accept(ControlAction.RESPONSE_FAIL)
            if (ref != null && s.block(ref) == Block.OFFLINE) repo.reconnect()
            return
        }
        val value = valueFor(s, ref, action)
        if (value == null) {
            consumer.accept(ControlAction.RESPONSE_FAIL)
            return
        }
        consumer.accept(ControlAction.RESPONSE_OK) // optimistic: the publisher shows the new state
        repo.setValue(ref, value)
    }

    private fun valueFor(s: HomeState, ref: ControlRef, action: ControlAction): JsonValue? {
        val fn = ref.fn
        val levels = Controls.numericLevels(fn)
        return when (action) {
            is BooleanAction -> when (fn.type) {
                "Boolean" -> JsonValue.Bool(action.newState)
                "Integer" -> JsonValue.Num(if (action.newState) fn.max ?: 100.0 else fn.min ?: 0.0)
                "Enum" -> if (levels != null) {
                    val offOption = fn.range[levels.indices.minBy { levels[it] }]
                    if (action.newState) {
                        val last = repo.lastLevel[ref.id]?.takeIf { it in fn.range && it != offOption }
                        JsonValue.Str(last ?: fn.range[levels.indices.maxBy { levels[it] }])
                    } else JsonValue.Str(offOption)
                } else repo.primaryValue(ref)
                else -> null
            }
            is FloatAction -> when (fn.type) {
                "Integer" -> {
                    val step = (fn.step ?: 1.0).coerceAtLeast(1.0)
                    val low = fn.min ?: 0.0
                    val high = fn.max ?: 100.0
                    // Wide raw ranges (e.g. 10..1000) are shown as a percentage.
                    val raw = if (usesPercent(fn)) low + action.newValue / 100.0 * (high - low) else action.newValue.toDouble()
                    val v = (Math.round((raw - low) / step) * step + low).coerceIn(low, high)
                    JsonValue.Num(v)
                }
                "Enum" -> Controls.nearestOption(fn, action.newValue.toDouble())?.let { JsonValue.Str(it) }
                else -> null
            }
            is CommandAction -> repo.primaryValue(ref)
            else -> null
        }
    }

    // region Building controls

    private fun deviceType(ref: ControlRef): Int = when (Controls.kind(ref.fn)) {
        Controls.Kind.LIGHT -> DeviceTypes.TYPE_LIGHT
        Controls.Kind.FAN -> DeviceTypes.TYPE_FAN
        Controls.Kind.SOCKET -> DeviceTypes.TYPE_OUTLET
        Controls.Kind.TV -> DeviceTypes.TYPE_TV
        else -> DeviceTypes.TYPE_GENERIC_ON_OFF
    }

    private fun stateless(s: HomeState, ref: ControlRef): Control =
        Control.StatelessBuilder(ref.id, appIntent)
            .setTitle(ref.fn.name)
            .setSubtitle(ref.device.name)
            .setZone(ref.room.name)
            .setStructure(s.houseName)
            .setDeviceType(deviceType(ref))
            .build()

    /** The control for [id] plus a signature of what it shows (to skip no-op updates). */
    private fun stateful(s: HomeState, id: String): Pair<Control, String> {
        val ref = s.findRef(id)
        if (ref == null) {
            if (s.phase == Phase.READY) {
                val c = Control.StatefulBuilder(id, appIntent).setStatus(Control.STATUS_NOT_FOUND).build()
                return c to "notfound"
            }
            // Not loaded yet (away / signing in): we don't know its name, keep it generic.
            val text = notice(s) ?: "Connecting…"
            val c = Control.StatefulBuilder(id, appIntent)
                .setTitle("Chandrabindu")
                .setStatus(Control.STATUS_OK)
                .setStatusText(text)
                .setControlTemplate(StatelessTemplate("t:$id"))
                .build()
            return c to "unknown:$text"
        }

        val b = Control.StatefulBuilder(ref.id, appIntent)
            .setTitle(ref.fn.name)
            .setSubtitle(ref.device.name)
            .setZone(ref.room.name)
            .setStructure(s.houseName)
            .setDeviceType(deviceType(ref))
            .setStatus(Control.STATUS_OK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // Plain lights and fans may be used from the lock screen (if the user allows it in Settings).
            b.setAuthRequired(false)
        }

        val notice = notice(s) ?: when {
            !eligible(s, ref) && ref.room.isBlocked -> "Room locked"
            !eligible(s, ref) -> "Use the app"
            s.block(ref) == Block.OFFLINE -> "Offline"
            else -> null
        }
        if (notice != null && notice != "Offline") {
            // Tapping a stateless control is a "try again".
            b.setStatusText(notice).setControlTemplate(StatelessTemplate("t:${ref.id}"))
            return b.build() to "notice:$notice"
        }

        val value = s.value(ref.device.id, ref.fn.code)
        val on = Controls.isOn(ref.fn, value)
        val label = if (s.values.containsKey(ref.device.id)) Controls.valueLabel(ref.fn, value) else "…"
        // A dimmer's range already shows its level; only say "Off" when it's off.
        val status = when {
            notice != null -> notice
            ref.fn.type == "Integer" -> if (on) "" else "Off"
            else -> label
        }
        b.setStatusText(status)
        b.setControlTemplate(template(ref, value, on))
        return b.build() to "ok:${notice ?: ""}:$label:$on:${value?.string}"
    }

    private fun template(ref: ControlRef, value: JsonValue?, on: Boolean): ControlTemplate {
        val fn = ref.fn
        val id = ref.id
        return when (fn.type) {
            "Boolean" -> ToggleTemplate("t:$id", ControlButton(on, "Toggle"))
            "Integer" -> {
                val low = (fn.min ?: 0.0).toFloat()
                val high = maxOf((fn.max ?: 100.0).toFloat(), low + 1f)
                val cur = (value?.number?.toFloat() ?: low).coerceIn(low, high)
                val range = if (usesPercent(fn)) {
                    RangeTemplate("r:$id", 0f, 100f, (cur - low) / (high - low) * 100f, 1f, "%.0f%%")
                } else {
                    val step = (fn.step ?: 1.0).toFloat().coerceAtLeast(1f)
                    RangeTemplate("r:$id", low, high, cur, step, "%.0f" + (fn.unit ?: "").replace("%", "%%"))
                }
                ToggleRangeTemplate("t:$id", ControlButton(on, "Toggle"), range)
            }
            "Enum" -> {
                val levels = Controls.numericLevels(fn)
                if (levels == null) {
                    StatelessTemplate("t:$id") // a mode list: each tap steps to the next option
                } else {
                    val low = levels.min().toFloat()
                    val high = maxOf(levels.max().toFloat(), low + 1f)
                    val sorted = levels.sorted()
                    val gaps = sorted.zipWithNext { a, b -> b - a }.distinct()
                    val step = if (gaps.size == 1) gaps[0].toFloat() else 1f
                    val cur = (value?.number?.toFloat() ?: low).coerceIn(low, high)
                    ToggleRangeTemplate(
                        "t:$id", ControlButton(on, "Toggle"),
                        RangeTemplate("r:$id", low, high, cur, step, "%.0f%%"),
                    )
                }
            }
            else -> StatelessTemplate("t:$id")
        }
    }

    private fun usesPercent(fn: com.chandrabindu.home.data.DeviceFunction) =
        (fn.max ?: 100.0) - (fn.min ?: 0.0) > 100.0

    /** House-wide reasons nothing can be controlled right now. */
    private fun notice(s: HomeState): String? = when (s.phase) {
        Phase.UNREACHABLE, Phase.NOT_HUB -> "Away from home"
        Phase.NEEDS_LOGIN -> "Sign in to Chandrabindu"
        Phase.CHECKING -> if (s.rooms.isEmpty()) "Connecting…" else null
        Phase.READY -> when {
            s.appLocked -> "App locked"
            s.setupIncomplete -> "Setup incomplete"
            else -> null
        }
    }

    // endregion

    private companion object {
        const val TAG = "device-controls"
    }
}

/**
 * Minimal java.util.concurrent.Flow publisher: buffers until requested,
 * signals serially, and cancels the producer job when the subscriber leaves.
 */
private class ControlPublisher(
    private val onCancel: () -> Unit = {},
    private val start: (emit: (Control) -> Unit, complete: () -> Unit) -> Job,
) : Flow.Publisher<Control> {
    override fun subscribe(subscriber: Flow.Subscriber<in Control>) {
        val lock = Any()
        val queue = ArrayDeque<Control>()
        var demand = 0L
        var cancelled = false
        var done = false
        var completed = false
        var job: Job? = null

        fun drain() = synchronized(lock) {
            if (cancelled) return@synchronized
            while (demand > 0 && queue.isNotEmpty()) {
                demand--
                subscriber.onNext(queue.removeFirst())
            }
            if (done && queue.isEmpty() && !completed) {
                completed = true
                subscriber.onComplete()
            }
        }

        subscriber.onSubscribe(object : Flow.Subscription {
            override fun request(n: Long) {
                synchronized(lock) { demand = if (Long.MAX_VALUE - demand < n) Long.MAX_VALUE else demand + n }
                drain()
            }

            override fun cancel() {
                val wasCancelled = synchronized(lock) { cancelled.also { cancelled = true } }
                if (wasCancelled) return
                job?.cancel()
                App.repo.scope.launch { onCancel() }
            }
        })

        job = start(
            { control ->
                synchronized(lock) {
                    // Only the newest state of a control matters.
                    queue.removeAll { it.controlId == control.controlId }
                    queue.addLast(control)
                }
                drain()
            },
            {
                synchronized(lock) { done = true }
                drain()
            },
        )
    }
}
