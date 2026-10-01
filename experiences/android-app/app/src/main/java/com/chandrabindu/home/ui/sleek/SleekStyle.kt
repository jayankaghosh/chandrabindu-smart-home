package com.chandrabindu.home.ui.sleek

import android.content.Context
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween

// Tailwind palette values the web app's Sleek theme uses (tailwind.config.ts +
// default Tailwind colours), so both clients render the same colours.
object Tw {
    val slate100 = Color(0xFFF1F5F9)
    val slate200 = Color(0xFFE2E8F0)
    val slate300 = Color(0xFFCBD5E1)
    val slate400 = Color(0xFF94A3B8)
    val slate500 = Color(0xFF64748B)
    val slate600 = Color(0xFF475569)
    val slate700 = Color(0xFF334155)
    val slate800 = Color(0xFF1E293B)
    val slate900 = Color(0xFF0F172A)
    val brand400 = Color(0xFF818CF8)
    val brand500 = Color(0xFF6366F1)
    val brand600 = Color(0xFF4F46E5)
    val brand700 = Color(0xFF4338CA)
    val amber300 = Color(0xFFFCD34D)
    val amber400 = Color(0xFFFBBF24)
    val amber500 = Color(0xFFF59E0B)
    val amber600 = Color(0xFFD97706)
    val amber700 = Color(0xFFB45309)
    val orange500 = Color(0xFFF97316)
    val sky300 = Color(0xFF7DD3FC)
    val sky400 = Color(0xFF38BDF8)
    val sky500 = Color(0xFF0EA5E9)
    val sky600 = Color(0xFF0284C7)
    val sky700 = Color(0xFF0369A1)
    val cyan500 = Color(0xFF06B6D4)
    val cyan600 = Color(0xFF0891B2)
    val emerald300 = Color(0xFF6EE7B7)
    val emerald400 = Color(0xFF34D399)
    val emerald500 = Color(0xFF10B981)
    val emerald600 = Color(0xFF059669)
    val teal500 = Color(0xFF14B8A6)
    val rose300 = Color(0xFFFDA4AF)
    val rose400 = Color(0xFFFB7185)
    val rose500 = Color(0xFFF43F5E)
    val rose600 = Color(0xFFE11D48)
    val pink500 = Color(0xFFEC4899)
    val fuchsia500 = Color(0xFFD946EF)
    val fuchsia600 = Color(0xFFC026D3)
    val indigo400 = Color(0xFF818CF8)
    val indigo500 = Color(0xFF6366F1)
    val indigo600 = Color(0xFF4F46E5)
    val violet500 = Color(0xFF8B5CF6)
    val violet600 = Color(0xFF7C3AED)
    val blue500 = Color(0xFF3B82F6)
    val blue600 = Color(0xFF2563EB)
    val red500 = Color(0xFFEF4444)
    val white = Color.White
}

/** Light/dark tokens (the web's `dark:` variants). */
@Immutable
data class Sleek(
    val dark: Boolean,
    val text: Color, // body text
    val title: Color, // slate-900 / slate-100
    val muted: Color, // slate-500 / slate-400
    val faint: Color, // slate-400 / slate-500
    val glassBg: Color,
    val glassBorder: Color,
    val tileOffBg: Color,
    val tileOffBorder: Color,
    val iconBtnFg: Color,
    val chipBg: Color, // bg-white/50 pills
    val headerBg: Color,
    val headerBorder: Color,
)

val LightSleek = Sleek(
    dark = false,
    text = Tw.slate900,
    title = Tw.slate900,
    muted = Tw.slate500,
    faint = Tw.slate400,
    glassBg = Color.White.copy(alpha = 0.45f),
    glassBorder = Color.White.copy(alpha = 0.6f),
    tileOffBg = Color.White.copy(alpha = 0.40f),
    tileOffBorder = Color.White.copy(alpha = 0.55f),
    iconBtnFg = Tw.slate700,
    chipBg = Color.White.copy(alpha = 0.5f),
    headerBg = Color.White.copy(alpha = 0.40f),
    headerBorder = Color.White.copy(alpha = 0.40f),
)

val DarkSleek = Sleek(
    dark = true,
    text = Color(0xFFE7E7EA),
    title = Tw.slate100,
    muted = Tw.slate400,
    faint = Tw.slate500,
    glassBg = Color.White.copy(alpha = 0.06f),
    glassBorder = Color.White.copy(alpha = 0.10f),
    tileOffBg = Color.White.copy(alpha = 0.05f),
    tileOffBorder = Color.White.copy(alpha = 0.10f),
    iconBtnFg = Tw.slate300,
    chipBg = Color.White.copy(alpha = 0.06f),
    headerBg = Color.White.copy(alpha = 0.04f),
    headerBorder = Color.White.copy(alpha = 0.10f),
)

val LocalSleek = staticCompositionLocalOf { LightSleek }

/** Theme choice, remembered per device like the web's localStorage "theme". */
class ThemeStore(context: Context) {
    private val p = context.getSharedPreferences("ui", Context.MODE_PRIVATE)
    var mode by mutableStateOf(p.getString("theme", "system") ?: "system")
        private set

    fun set(value: String) {
        mode = value
        p.edit().putString("theme", value).apply()
    }

    fun isDark(systemDark: Boolean) = when (mode) {
        "dark" -> true
        "light" -> false
        else -> systemDark
    }
}

// region Surfaces

val Rounded3xl = RoundedCornerShape(24.dp)
val Rounded2xl = RoundedCornerShape(16.dp)
val RoundedXl = RoundedCornerShape(12.dp)
val TileShape = RoundedCornerShape(26.dp)

/** `.card`: liquid-glass surface. */
fun Modifier.glass(s: Sleek, shape: Shape = Rounded3xl, bg: Color = s.glassBg): Modifier =
    this.clip(shape).background(bg, shape).border(1.dp, s.glassBorder, shape)

/** `.tile-off`: frosted tile. */
fun Modifier.tileOff(s: Sleek, shape: Shape = TileShape): Modifier =
    this.clip(shape).background(s.tileOffBg, shape).border(1.dp, s.tileOffBorder, shape)

/** Tap feedback like framer-motion's whileTap scale. */
@Composable
fun Modifier.pressable(
    enabled: Boolean = true,
    pressedScale: Float = 0.97f,
    onClick: () -> Unit,
): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed && enabled) pressedScale else 1f, spring(stiffness = 900f), label = "press")
    return this
        .scale(scale)
        .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
}

// endregion

// region Controls

@Composable
fun SIcon(icon: ImageVector, size: Dp, tint: Color, modifier: Modifier = Modifier) {
    Icon(icon, contentDescription = null, tint = tint, modifier = modifier.size(size))
}

/** Rotating loader (lucide Loader2). */
@Composable
fun Spinner(size: Dp, tint: Color, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "spin")
    val angle by t.animateFloat(0f, 360f, infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Restart), label = "a")
    Icon(Lucide.LoaderCircle, contentDescription = null, tint = tint, modifier = modifier.size(size).rotate(angle))
}

/** `.icon-btn` (40dp) or the header's bigger 48dp variant. */
@Composable
fun IconBtn(
    icon: ImageVector,
    contentDescription: String,
    big: Boolean = false,
    enabled: Boolean = true,
    iconSize: Dp? = null,
    onClick: () -> Unit,
) {
    val s = LocalSleek.current
    val box = if (big) 48.dp else 40.dp
    val shape = if (big) Rounded2xl else RoundedXl
    Box(
        Modifier
            .size(box)
            .pressable(enabled, 0.92f, onClick)
            .alpha(if (enabled) 1f else 0.5f)
            .glass(s, shape, if (s.dark) s.glassBg else Color.White.copy(alpha = if (big) 0.5f else 0.45f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon, contentDescription = contentDescription,
            tint = if (big && s.dark) Tw.slate200 else s.iconBtnFg,
            modifier = Modifier.size(iconSize ?: if (big) 24.dp else 16.dp),
        )
    }
}

/** `.btn-primary`: brand gradient (white in dark mode). */
@Composable
fun BtnPrimary(
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    padding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
    onClick: () -> Unit,
    content: @Composable RowScope.() -> Unit,
) {
    val s = LocalSleek.current
    val bg = if (s.dark) Brush.horizontalGradient(listOf(Color.White, Color.White))
    else Brush.horizontalGradient(listOf(Tw.brand500, Tw.brand400))
    val fg = if (s.dark) Tw.slate900 else Color.White
    Row(
        modifier
            .pressable(enabled, 0.95f, onClick)
            .alpha(if (enabled) 1f else 0.5f)
            .then(if (s.dark || !enabled) Modifier else Modifier.shadow(10.dp, RoundedXl, ambientColor = Tw.brand500, spotColor = Tw.brand500))
            .clip(RoundedXl)
            .background(bg)
            .padding(padding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalContentColor provides fg) { content() }
    }
}

/** `.btn-ghost`: glass button. */
@Composable
fun BtnGhost(
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
    content: @Composable RowScope.() -> Unit,
) {
    val s = LocalSleek.current
    Row(
        modifier
            .pressable(enabled, 0.95f, onClick)
            .alpha(if (enabled) 1f else 0.5f)
            .glass(s, RoundedXl)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalContentColor provides if (s.dark) Tw.slate200 else Tw.slate700) { content() }
    }
}

@Composable
fun BtnText(text: String, size: Int = 14) {
    Text(text, fontSize = size.sp, fontWeight = FontWeight.Medium, color = LocalContentColor.current)
}

@Composable
fun BtnIcon(icon: ImageVector, size: Dp = 15.dp) {
    Icon(icon, contentDescription = null, tint = LocalContentColor.current, modifier = Modifier.size(size))
}

/** Small rounded pill (status chips, badges). */
@Composable
fun Pill(
    bg: Color,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier.clip(CircleShape).background(bg).padding(horizontal = 14.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

// endregion

/** Lit-tile gradient + glow colour per control kind (lib/icons.ts). */
enum class WebKind(val from: Color, val to: Color, val glow: Color) {
    LIGHT(Tw.amber400, Tw.orange500, Color(0xFFF59E0B)),
    FAN(Tw.sky400, Tw.cyan500, Color(0xFF38BDF8)),
    SOCKET(Tw.emerald400, Tw.teal500, Color(0xFF10B981)),
    LOCK(Tw.rose400, Tw.pink500, Color(0xFFF43F5E)),
    SWITCH(Tw.indigo400, Tw.violet500, Color(0xFF6366F1)),
}

private val fanRe = Regex("""\bfan""")
private val socketRe = Regex("sock|plug|outlet|power")
private val lightRe = Regex("light|lamp|bulb|strip|chandelier|led|spot|down")

/** The web's controlKind() (lib/icons.ts), which differs slightly from the Mac app's. */
fun webKind(name: String, code: String): WebKind {
    val s = "$name $code".lowercase()
    return when {
        fanRe.containsMatchIn(s) -> WebKind.FAN
        socketRe.containsMatchIn(s) -> WebKind.SOCKET
        "lock" in s -> WebKind.LOCK
        lightRe.containsMatchIn(s) -> WebKind.LIGHT
        else -> WebKind.SWITCH
    }
}

fun WebKind.icon(): ImageVector = when (this) {
    WebKind.LIGHT -> Lucide.Lightbulb
    WebKind.FAN -> Lucide.Fan
    WebKind.SOCKET -> Lucide.Plug
    WebKind.LOCK -> Lucide.Lock
    WebKind.SWITCH -> Lucide.Power
}

/** The web's Sleek labels (components/sleek/labels.ts): fan steps read Off/Low/Medium/High/Full. */
object WebLabels {
    private val fan = mapOf("0" to "Off", "25" to "Low", "50" to "Medium", "75" to "High", "100" to "Full")

    fun enumLabel(v: String, unit: String?): String =
        if (v.isNotEmpty() && v.all(Char::isDigit)) fan[v] ?: "$v${unit ?: "%"}" else v

    fun valueLabel(fn: com.chandrabindu.home.data.DeviceFunction, v: com.chandrabindu.home.data.JsonValue?): String = when (fn.type) {
        "Boolean" -> if (v?.bool == true) "On" else "Off"
        "Enum" -> enumLabel(v?.string ?: "", fn.unit)
        "Integer" -> {
            val n = v?.number ?: 0.0
            if (n <= (fn.min ?: 0.0)) "Off" else "${n.toLong()}${fn.unit ?: ""}"
        }
        else -> v?.string ?: ""
    }
}
