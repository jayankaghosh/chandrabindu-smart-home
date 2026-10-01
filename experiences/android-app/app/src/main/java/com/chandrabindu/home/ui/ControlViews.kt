package com.chandrabindu.home.ui

import android.view.HapticFeedbackConstants
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bed
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Shower
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.filled.Weekend
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.Block
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.DeviceFunction
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.JsonValue
import kotlinx.coroutines.delay

// region Icons and tints (mirror the web app / macOS app)

fun controlIcon(fn: DeviceFunction, on: Boolean): ImageVector = when (Controls.kind(fn)) {
    Controls.Kind.LIGHT -> if (on) Icons.Filled.Lightbulb else Icons.Outlined.Lightbulb
    Controls.Kind.FAN -> Icons.Filled.Air
    Controls.Kind.SOCKET -> Icons.Filled.Power
    Controls.Kind.LOCK -> Icons.Filled.Lock
    Controls.Kind.TV -> Icons.Filled.Tv
    Controls.Kind.BELL -> Icons.Filled.Notifications
    Controls.Kind.POWER -> Icons.Filled.PowerSettingsNew
}

fun controlTint(fn: DeviceFunction) = Color(Controls.tint(fn))

private val bedRe = Regex("""bed|\bmbr\b|\bgbr\b|\bfbr\b""")

fun roomIcon(name: String): ImageVector {
    val s = name.lowercase()
    return when {
        bedRe.containsMatchIn(s) -> Icons.Filled.Bed
        "living" in s -> Icons.Filled.Weekend
        "kitchen" in s -> Icons.Filled.Restaurant
        "drawing" in s || "tv" in s -> Icons.Filled.Tv
        "pooja" in s -> Icons.Filled.AutoAwesome
        "balcony" in s || "garden" in s -> Icons.Filled.WbSunny
        "bar" in s -> Icons.Filled.LocalCafe
        "park" in s || "garage" in s -> Icons.Filled.DirectionsCar
        "bath" in s -> Icons.Filled.Shower
        "study" in s || "office" in s -> Icons.Filled.Computer
        else -> Icons.Filled.Home
    }
}

// endregion

/** Light tick on toggle. */
@Composable
fun rememberHaptic(): (Boolean) -> Unit {
    val view = LocalView.current
    return remember(view) {
        { long: Boolean ->
            view.performHapticFeedback(if (long) HapticFeedbackConstants.LONG_PRESS else HapticFeedbackConstants.KEYBOARD_TAP)
        }
    }
}

/** A tap that has to be repeated within 3s (protected controls, All off / All on). */
class ConfirmState {
    var armed by mutableStateOf(false)
    var armedAt = 0L
}

@Composable
fun rememberConfirm(): ConfirmState {
    val c = remember { ConfirmState() }
    LaunchedEffect(c.armed, c.armedAt) {
        if (c.armed) {
            delay(3_000)
            c.armed = false
        }
    }
    return c
}

/** Returns true when the action should run now (second tap), false when it just armed. */
fun ConfirmState.tapNeedsConfirm(required: Boolean): Boolean {
    if (!required) return false
    if (armed) {
        armed = false
        return false
    }
    armed = true
    armedAt = System.currentTimeMillis()
    return true
}

/** One control as a list row. Switches toggle on a tap anywhere on the row; long-press toggles favourite. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ControlRow(repo: HomeRepository, s: HomeState, ref: ControlRef, subtitle: String? = null) {
    val fn = ref.fn
    val value = s.value(ref.device.id, fn.code)
    val on = Controls.isOn(fn, value)
    val block = s.block(ref)
    val enabled = block == Block.NONE
    val tint = controlTint(fn)
    val haptic = rememberHaptic()
    val confirm = rememberConfirm()

    fun act(v: JsonValue) {
        if (!enabled || confirm.tapNeedsConfirm(fn.protected)) return
        haptic(false)
        repo.setValue(ref, v)
    }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .combinedClickable(
                onClick = { if (fn.type == "Boolean") repo.primaryValue(ref)?.let(::act) },
                onLongClick = {
                    haptic(true)
                    repo.toggleFavourite(ref)
                },
            )
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val bubble by animateColorAsState(if (on) tint.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceContainerHigh, label = "bubble")
            Box(Modifier.size(38.dp).clip(CircleShape).background(bubble), contentAlignment = Alignment.Center) {
                Icon(
                    controlIcon(fn, on), contentDescription = null,
                    tint = if (on) tint else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        fn.name, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled || block == Block.SUPER_PROTECTED) 1f else 0.55f),
                    )
                    if (s.isPending(ref.id)) {
                        Spacer(Modifier.width(6.dp))
                        CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp, color = tint)
                    }
                    if (s.isFavourite(ref)) {
                        Spacer(Modifier.width(4.dp))
                        Text("★", fontSize = 12.sp, color = Orange)
                    }
                }
                val hint = hintText(fn, block, confirm.armed)
                val sub = hint ?: subtitle
                if (sub != null) {
                    Text(
                        sub, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        color = when {
                            confirm.armed -> Orange
                            block == Block.OFFLINE -> Orange
                            block == Block.SUPER_PROTECTED -> Green
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            when {
                block == Block.SUPER_PROTECTED -> Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Shield, contentDescription = null, tint = Green, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("Always on", color = Green, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                fn.type == "Boolean" -> Switch(
                    checked = on, enabled = enabled,
                    onCheckedChange = { act(JsonValue.Bool(it)) },
                    colors = SwitchDefaults.colors(checkedTrackColor = tint, checkedThumbColor = Color.White, checkedBorderColor = tint),
                )
                fn.type == "Integer" -> Text(
                    Controls.valueLabel(fn, value), fontSize = 13.sp,
                    color = if (on) tint else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                fn.type == "Enum" && fn.range.size > 5 -> EnumMenu(fn, value, enabled) { act(JsonValue.Str(it)) }
            }
        }
        if (block != Block.SUPER_PROTECTED) {
            when {
                fn.type == "Enum" && fn.range.size in 1..5 -> {
                    Spacer(Modifier.height(8.dp))
                    LevelSegments(fn, value?.string ?: "", tint, enabled) { act(JsonValue.Str(it)) }
                }
                fn.type == "Integer" -> LevelSlider(fn, value?.number ?: fn.min ?: 0.0, tint, enabled) {
                    act(JsonValue.Num(Math.rint(it)))
                }
            }
        }
    }
}

private fun hintText(fn: DeviceFunction, block: Block, confirming: Boolean): String? {
    if (confirming) return "Protected. Tap again to confirm"
    return when (block) {
        Block.SUPER_PROTECTED -> "Powers the whole house"
        Block.ADMIN_ONLY -> "Protected · admin only"
        Block.OFFLINE -> "Offline"
        Block.ROOM_LOCKED -> "Room locked"
        else -> if (fn.protected) "Protected" else null
    }
}

/** Fan / mode levels as one-tap segments (no dropdown to open first). */
@Composable
fun LevelSegments(fn: DeviceFunction, current: String, tint: Color, enabled: Boolean, pick: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 50.dp).clip(RoundedCornerShape(10.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        for (option in fn.range) {
            val selected = option == current
            val bg by animateColorAsState(if (selected) tint else Color.Transparent, label = "seg")
            Box(
                Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(8.dp)).background(bg)
                    .clickable(enabled = enabled) { pick(option) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    Controls.enumLabel(option, fn), fontSize = 13.sp,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    color = when {
                        selected -> Color.White
                        enabled -> MaterialTheme.colorScheme.onSurface
                        else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    },
                )
            }
        }
    }
}

/** Dimmer slider that only sends a command when the drag ends. */
@Composable
fun LevelSlider(fn: DeviceFunction, current: Double, tint: Color, enabled: Boolean, commit: (Double) -> Unit) {
    val low = (fn.min ?: 0.0).toFloat()
    val high = maxOf((fn.max ?: 100.0).toFloat(), low + 1f)
    val step = (fn.step ?: 1.0).toFloat().coerceAtLeast(1f)
    var drag by remember { mutableStateOf<Float?>(null) }
    val steps = (((high - low) / step).toInt() - 1).coerceIn(0, 200)
    Slider(
        value = drag ?: current.toFloat().coerceIn(low, high),
        onValueChange = { drag = it },
        onValueChangeFinished = {
            drag?.let { commit(it.toDouble()) }
            drag = null
        },
        valueRange = low..high,
        steps = if (steps > 100) 0 else steps,
        enabled = enabled,
        colors = SliderDefaults.colors(thumbColor = tint, activeTrackColor = tint),
        modifier = Modifier.fillMaxWidth().padding(start = 50.dp).height(36.dp),
    )
}

@Composable
private fun EnumMenu(fn: DeviceFunction, value: JsonValue?, enabled: Boolean, pick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.clip(RoundedCornerShape(8.dp)).clickable(enabled = enabled) { open = true }.padding(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(Controls.valueLabel(fn, value), fontSize = 14.sp)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (option in fn.range) {
                DropdownMenuItem(text = { Text(Controls.enumLabel(option, fn)) }, onClick = {
                    open = false
                    pick(option)
                })
            }
        }
    }
}

/** Favourite as a two-column tile: the fastest one-tap target in the app. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FavouriteTile(repo: HomeRepository, s: HomeState, ref: ControlRef, modifier: Modifier = Modifier) {
    val fn = ref.fn
    val value = s.value(ref.device.id, fn.code)
    val on = Controls.isOn(fn, value)
    val block = s.block(ref)
    val enabled = block == Block.NONE
    val tint = controlTint(fn)
    val haptic = rememberHaptic()
    val confirm = rememberConfirm()
    val bg by animateColorAsState(
        if (on) tint.copy(alpha = 0.2f) else MaterialTheme.colorScheme.surfaceContainerLow, label = "fav",
    )

    Surface(
        shape = RoundedCornerShape(16.dp), color = bg,
        modifier = modifier.height(66.dp).clip(RoundedCornerShape(16.dp)).combinedClickable(
            onClick = {
                if (enabled && !confirm.tapNeedsConfirm(fn.protected)) {
                    haptic(false)
                    repo.primaryAction(ref)
                }
            },
            onLongClick = {
                haptic(true)
                repo.toggleFavourite(ref)
            },
        ),
    ) {
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                controlIcon(fn, on), contentDescription = null,
                tint = if (on) tint else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    fn.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else 0.55f),
                )
                // The room disambiguates the many controls simply called "Fan".
                val state = when {
                    confirm.armed -> "Tap again"
                    block == Block.OFFLINE -> "Offline"
                    block == Block.SUPER_PROTECTED -> "Always on"
                    else -> Controls.valueLabel(fn, value)
                }
                Text(
                    "$state · ${ref.room.name}", fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = if (on || confirm.armed) (if (confirm.armed) Orange else tint) else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (s.isPending(ref.id)) CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 1.5.dp, color = tint)
        }
    }
}

/** A button that asks for a second tap (within 3s) before acting. */
@Composable
fun ConfirmButton(title: String, icon: ImageVector, tint: Color, enabled: Boolean, action: () -> Unit) {
    val confirm = rememberConfirm()
    val haptic = rememberHaptic()
    val armed = confirm.armed
    Surface(
        shape = RoundedCornerShape(50),
        color = if (armed) Color(0xFFE5484D) else tint.copy(alpha = 0.14f),
        modifier = Modifier.alpha(if (enabled) 1f else 0.4f).clip(RoundedCornerShape(50)).clickable(enabled = enabled) {
            if (!confirm.tapNeedsConfirm(true)) {
                haptic(false)
                action()
            }
        },
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (armed) Icons.Filled.Check else icon, contentDescription = null,
                tint = if (armed) Color.White else tint, modifier = Modifier.size(16.dp),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                if (armed) "Confirm?" else title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                color = if (armed) Color.White else tint,
            )
        }
    }
}

/** The panel's physical-button lock (Tuya child lock). Admins toggle; others see it. */
@Composable
fun PanelLockPill(repo: HomeRepository, s: HomeState, ref: ControlRef) {
    val locked = s.value(ref.device.id, ref.fn.code)?.bool == true
    val canToggle = s.isAdmin && s.block(ref) == Block.NONE
    val color = if (locked) Orange else MaterialTheme.colorScheme.onSurfaceVariant
    Row(
        Modifier.clip(RoundedCornerShape(50))
            .background(if (locked) Orange.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceContainerHigh)
            .clickable(enabled = canToggle) { repo.setValue(ref, JsonValue.Bool(!locked)) }
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (locked) Icons.Filled.Lock else Icons.Filled.LockOpen, contentDescription = null, tint = color, modifier = Modifier.size(13.dp))
        Spacer(Modifier.width(4.dp))
        Text(if (locked) "Buttons locked" else "Buttons free", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = color)
    }
}
