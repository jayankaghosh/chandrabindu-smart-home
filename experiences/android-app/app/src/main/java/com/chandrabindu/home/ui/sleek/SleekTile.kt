package com.chandrabindu.home.ui.sleek

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

/** A protected command waiting for the admin's "Yes" (shown by the app-level dialog). */
data class PendingProtected(val ref: ControlRef, val value: JsonValue)

/**
 * The single control tile (SleekControlTile.tsx): Boolean = tall lit toggle, Enum =
 * wide tile with level segments, Integer = wide tile with a slider that commits on
 * release. Favourite star top-right, switch-group link top-left, protected and
 * super-protected overlays.
 */
@Composable
fun SleekControlTile(
    repo: HomeRepository,
    s: HomeState,
    ref: ControlRef,
    inGroup: Boolean,
    caption: String? = null,
    requestProtected: (PendingProtected) -> Unit,
) {
    val sk = LocalSleek.current
    val fn = ref.fn
    val value = s.value(ref.device.id, fn.code)
    val kind = webKind(fn.name, fn.code)
    val on = Controls.isOn(fn, value)
    val block = s.block(ref)
    val superProtected = fn.superProtected
    // Web: disabled = offline, room locked, or protected for a non-admin.
    val disabled = block == Block.OFFLINE || block == Block.ROOM_LOCKED || block == Block.ADMIN_ONLY ||
        block == Block.BLUETOOTH
    val locked = disabled || superProtected
    val view = LocalView.current

    fun request(v: JsonValue) {
        if (locked || block == Block.APP_LOCKED || block == Block.SETUP) return
        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        if (fn.protected && s.isAdmin) {
            requestProtected(PendingProtected(ref, v))
            return
        }
        repo.setValue(ref, v)
    }

    // Protected tiles are greyscaled under their overlay (backdrop-grayscale on the web).
    fun gray(c: Color): Color {
        val l = 0.2126f * c.red + 0.7152f * c.green + 0.0722f * c.blue
        return Color(l, l, l, c.alpha)
    }
    val litBrush = when {
        sk.dark -> Brush.linearGradient(listOf(Color.White, Color.White))
        fn.protected -> Brush.linearGradient(listOf(gray(kind.from), gray(kind.to)))
        else -> Brush.linearGradient(listOf(kind.from, kind.to))
    }
    val litFg = if (sk.dark) Tw.slate900 else Color.White
    val fg = if (on) litFg else sk.title

    Column {
        if (caption != null) {
            Text(
                caption, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = sk.muted, maxLines = 1,
                overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 4.dp, end = 4.dp, bottom = 6.dp),
            )
        }
        Box {
            val surface = Modifier
                .fillMaxWidth()
                .then(
                    if (on) Modifier
                        .shadow(18.dp, TileShape, ambientColor = if (sk.dark || fn.protected) Color.White else kind.glow, spotColor = if (sk.dark || fn.protected) Color.White else kind.glow)
                        .clip(TileShape)
                        .background(litBrush)
                    else Modifier.tileOff(sk)
                )
            when (fn.type) {
                "Boolean" -> Column(
                    surface
                        .height(140.dp)
                        .alpha(if (disabled) 0.5f else 1f)
                        .pressable(!locked, 0.96f) { request(JsonValue.Bool(value?.bool != true)) }
                        .padding(16.dp),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    IconBox(kind, on, 48)
                    Column {
                        Text(fn.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 18.sp)
                        Text(
                            if (on) "On" else "Off", fontSize = 14.sp,
                            color = if (on) fg.copy(alpha = 0.9f) else sk.faint,
                        )
                    }
                }
                "Enum" -> Column(surface.alpha(if (disabled) 0.5f else 1f).padding(16.dp)) {
                    WideHeader(fn, value, kind, on, fg)
                    Spacer(Modifier.height(12.dp))
                    EnumSegments(fn, value?.string ?: "", on, enabled = !locked) { request(JsonValue.Str(it)) }
                }
                "Integer" -> Column(surface.alpha(if (disabled) 0.5f else 1f).padding(16.dp)) {
                    WideHeader(fn, value, kind, on, fg)
                    Spacer(Modifier.height(12.dp))
                    RangeSlider(fn, value?.number ?: fn.min ?: 0.0, enabled = !locked) { request(JsonValue.Num(it)) }
                }
            }

            // Protected overlay: greys the tile (non-admins can't, admins confirm).
            if (fn.protected && !superProtected) {
                Box(
                    Modifier.matchParentSize().clip(TileShape)
                        .background(if (sk.dark) Tw.slate900.copy(alpha = 0.55f) else Tw.slate400.copy(alpha = 0.5f)),
                )
            }
            // Super-protected: the lifeline switch. Loud, locked, never toggled.
            if (superProtected) {
                Column(
                    Modifier.matchParentSize().clip(TileShape).background(Tw.slate900.copy(alpha = 0.75f)).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    SIcon(Lucide.ShieldCheck, 30.dp, Tw.emerald300)
                    Text("SUPER PROTECTED", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White, letterSpacing = 0.4.sp)
                    Text(
                        "Powers the whole system. Cannot be turned off.", fontSize = 11.sp, fontWeight = FontWeight.Medium,
                        color = Color.White.copy(alpha = 0.8f), textAlign = TextAlign.Center, lineHeight = 13.sp,
                    )
                }
            }
            if (inGroup) {
                Box(
                    Modifier.align(Alignment.TopStart).offset((-6).dp, (-6).dp).size(24.dp)
                        .shadow(3.dp, CircleShape).clip(CircleShape)
                        .background(if (sk.dark) Tw.slate800 else Color.White),
                    contentAlignment = Alignment.Center,
                ) { SIcon(Lucide.Link2, 12.dp, if (sk.dark) Tw.indigo400 else Tw.indigo500) }
            }
            val fav = s.isFavourite(ref)
            Box(
                Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp).size(32.dp)
                    .shadow(5.dp, CircleShape).clip(CircleShape)
                    .background(if (sk.dark) Tw.slate800 else Color.White)
                    .then(if (sk.dark) Modifier.border(1.dp, Color.White.copy(alpha = 0.1f), CircleShape) else Modifier)
                    .clickable { repo.toggleFavourite(ref, announce = false) },
                contentAlignment = Alignment.Center,
            ) {
                if (fav) FilledStar(15) else SIcon(Lucide.Star, 15.dp, if (sk.dark) Tw.slate500 else Tw.slate400)
            }
        }
    }
}

/** Amber filled star (lucide Star with fill-amber-400). */
@Composable
fun FilledStar(size: Int) {
    Box(contentAlignment = Alignment.Center) {
        androidx.compose.foundation.Image(
            imageVector = Lucide.Star, contentDescription = "Favourite",
            modifier = Modifier.size(size.dp),
            colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(Tw.amber400),
        )
        androidx.compose.foundation.Canvas(Modifier.size(size.dp)) {
            // Fill the star body: draw the same outline as a filled path.
            val p = androidx.compose.ui.graphics.Path()
            val sx = this.size.width / 24f
            fun pt(x: Float, y: Float) = androidx.compose.ui.geometry.Offset(x * sx, y * sx)
            val pts = listOf(12f to 2f, 15.09f to 8.26f, 22f to 9.27f, 17f to 14.14f, 18.18f to 21.02f, 12f to 17.77f, 5.82f to 21.02f, 7f to 14.14f, 2f to 9.27f, 8.91f to 8.26f)
            pts.forEachIndexed { i, (x, y) -> val o = pt(x, y); if (i == 0) p.moveTo(o.x, o.y) else p.lineTo(o.x, o.y) }
            p.close()
            drawPath(p, Tw.amber400)
        }
    }
}

@Composable
private fun IconBox(kind: WebKind, on: Boolean, size: Int) {
    val sk = LocalSleek.current
    val bg = when {
        on && sk.dark -> Tw.slate900.copy(alpha = 0.10f)
        on -> Color.White.copy(alpha = 0.25f)
        sk.dark -> Color.White.copy(alpha = 0.10f)
        else -> Tw.slate200.copy(alpha = 0.7f)
    }
    val fg = when {
        on && sk.dark -> Tw.slate900
        on -> Color.White
        sk.dark -> Tw.slate300
        else -> Tw.slate500
    }
    Box(Modifier.size(size.dp).clip(Rounded2xl).background(bg), contentAlignment = Alignment.Center) {
        SIcon(kind.icon(), if (size >= 48) 24.dp else 22.dp, fg)
    }
}

@Composable
private fun WideHeader(fn: DeviceFunction, value: JsonValue?, kind: WebKind, on: Boolean, fg: Color) {
    val sk = LocalSleek.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconBox(kind, on, 44)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(fn.name, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 18.sp)
            Text(WebLabels.valueLabel(fn, value), fontSize = 14.sp, color = if (on) fg.copy(alpha = 0.9f) else sk.faint)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EnumSegments(fn: DeviceFunction, current: String, on: Boolean, enabled: Boolean, pick: (String) -> Unit) {
    val sk = LocalSleek.current
    val containerBg = when {
        on -> Color.Black.copy(alpha = 0.15f)
        sk.dark -> Color.White.copy(alpha = 0.10f)
        else -> Tw.slate100
    }
    BoxWithConstraints(Modifier.fillMaxWidth().clip(Rounded2xl).background(containerBg).padding(4.dp)) {
        // flex-wrap with min-w 64px + gap 8px, like the web.
        val perRow = (((maxWidth.value + 8f) / 72f).toInt()).coerceAtLeast(1)
        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            maxItemsInEachRow = perRow,
        ) {
            for (opt in fn.range) {
                val active = opt == current
                val bg: Brush? = when {
                    active && on -> Brush.linearGradient(listOf(if (sk.dark) Tw.slate800 else Color.White, if (sk.dark) Tw.slate800 else Color.White))
                    active && sk.dark -> Brush.linearGradient(listOf(Color.White, Color.White))
                    active -> Brush.horizontalGradient(listOf(Tw.brand500, Tw.brand400))
                    else -> null
                }
                val fg = when {
                    active && on -> if (sk.dark) Color.White else Tw.slate900
                    active -> if (sk.dark) Tw.slate900 else Color.White
                    on -> if (sk.dark) Tw.slate700 else Color.White.copy(alpha = 0.85f)
                    else -> if (sk.dark) Tw.slate300 else Tw.slate500
                }
                Box(
                    Modifier.weight(1f).height(44.dp)
                        .pressable(enabled, 0.94f) { pick(opt) }
                        .then(if (active && on) Modifier.shadow(2.dp, RoundedXl) else Modifier)
                        .clip(RoundedXl)
                        .then(if (bg != null) Modifier.background(bg) else Modifier)
                        .alpha(if (enabled) 1f else 0.5f),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(WebLabels.enumLabel(opt, fn.unit), fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = fg)
                }
            }
        }
    }
}

/** The web's range input: an 8px track and a 22px white thumb; commits on release. */
@Composable
private fun RangeSlider(fn: DeviceFunction, current: Double, enabled: Boolean, commit: (Double) -> Unit) {
    val sk = LocalSleek.current
    val low = fn.min ?: 0.0
    val high = maxOf(fn.max ?: 100.0, low + 1)
    val step = (fn.step ?: 1.0).coerceAtLeast(1.0)
    var drag by remember { mutableStateOf<Double?>(null) }
    var widthPx by remember { mutableFloatStateOf(1f) }
    val density = LocalDensity.current
    val thumbPx = with(density) { 22.dp.toPx() }
    val shown = (drag ?: current).coerceIn(low, high)
    val frac = ((shown - low) / (high - low)).toFloat()

    fun valueAt(x: Float): Double {
        val f = ((x - thumbPx / 2) / (widthPx - thumbPx)).coerceIn(0f, 1f)
        val raw = low + f * (high - low)
        return (Math.round((raw - low) / step) * step + low).coerceIn(low, high)
    }

    Box(
        Modifier.fillMaxWidth().height(28.dp).onSizeChanged { widthPx = it.width.toFloat().coerceAtLeast(1f) }
            .alpha(if (enabled) 1f else 0.5f)
            .then(
                if (!enabled) Modifier else Modifier
                    .pointerInput(low, high, step) {
                        detectTapGestures { o -> commit(valueAt(o.x)) }
                    }
                    .pointerInput(low, high, step) {
                        detectHorizontalDragGestures(
                            onDragStart = { o -> drag = valueAt(o.x) },
                            onDragEnd = { drag?.let(commit); drag = null },
                            onDragCancel = { drag = null },
                            onHorizontalDrag = { change, _ -> drag = valueAt(change.position.x) },
                        )
                    }
            ),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier.fillMaxWidth().height(8.dp).clip(CircleShape)
                .background(if (sk.dark) Color.White.copy(alpha = 0.18f) else Tw.slate900.copy(alpha = 0.16f)),
        )
        val offsetDp = with(density) { (frac * (widthPx - thumbPx)).toDp() }
        Box(
            Modifier.offset(x = offsetDp).size(22.dp).shadow(4.dp, CircleShape).clip(CircleShape).background(Color.White)
                .border(1.dp, Tw.slate900.copy(alpha = 0.08f), CircleShape),
        )
    }
}

/** Bluetooth panels can't be reached over the LAN. */
@Composable
fun BluetoothNotice() {
    val sk = LocalSleek.current
    Row(Modifier.fillMaxWidth().tileOff(sk).padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(44.dp).clip(Rounded2xl).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.sky500.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) { SIcon(Lucide.Bluetooth, 22.dp, Tw.sky500) }
        Spacer(Modifier.width(12.dp))
        Column {
            Text("Bluetooth device", fontWeight = FontWeight.SemiBold, color = if (sk.dark) Tw.slate200 else Tw.slate700, fontSize = 16.sp)
            Text("Can't be controlled from here, use the Smart Life app.", fontSize = 14.sp, color = sk.muted, lineHeight = 19.sp)
        }
    }
}
