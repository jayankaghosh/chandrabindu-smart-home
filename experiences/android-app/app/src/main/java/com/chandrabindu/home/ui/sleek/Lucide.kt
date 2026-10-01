package com.chandrabindu.home.ui.sleek

import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

// Generated from lucide-react 0.408 (ISC licence), the icon set the web app uses,
// so the Android screens draw the same glyphs. Stroke width 2, round caps/joins.
object Lucide {
    private fun icon(name: String, vararg paths: String): ImageVector {
        val b = ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)
        for (d in paths) {
            b.addPath(
                pathData = addPathNodes(d),
                fill = null,
                stroke = SolidColor(androidx.compose.ui.graphics.Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return b.build()
    }

    val Star: ImageVector by lazy {
        icon(
            "star",
            "M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z",
        )
    }

    val LayoutGrid: ImageVector by lazy {
        icon(
            "layout-grid",
            "M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
            "M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
            "M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
            "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1Z",
        )
    }

    val Play: ImageVector by lazy {
        icon(
            "play",
            "M6 3L20 12L6 21L6 3Z",
        )
    }

    val Zap: ImageVector by lazy {
        icon(
            "zap",
            "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
        )
    }

    val Command: ImageVector by lazy {
        icon(
            "command",
            "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3",
        )
    }

    val Link2: ImageVector by lazy {
        icon(
            "link-2",
            "M9 17H7A5 5 0 0 1 7 7h2",
            "M15 7h2a5 5 0 1 1 0 10h-2",
            "M8 12L16 12",
        )
    }

    val BarChart3: ImageVector by lazy {
        icon(
            "bar-chart-3",
            "M3 3v18h18",
            "M18 17V9",
            "M13 17V5",
            "M8 17v-3",
        )
    }

    val Sparkles: ImageVector by lazy {
        icon(
            "sparkles",
            "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
            "M20 3v4",
            "M22 5h-4",
            "M4 17v2",
            "M5 18H3",
        )
    }

    val Lightbulb: ImageVector by lazy {
        icon(
            "lightbulb",
            "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
            "M9 18h6",
            "M10 22h4",
        )
    }

    val Fan: ImageVector by lazy {
        icon(
            "fan",
            "M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z",
            "M12 12v.01",
        )
    }

    val Plug: ImageVector by lazy {
        icon(
            "plug",
            "M12 22v-5",
            "M9 8V2",
            "M15 8V2",
            "M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z",
        )
    }

    val Lock: ImageVector by lazy {
        icon(
            "lock",
            "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2Z",
            "M7 11V7a5 5 0 0 1 10 0v4",
        )
    }

    val Power: ImageVector by lazy {
        icon(
            "power",
            "M12 2v10",
            "M18.4 6.6a9 9 0 1 1-12.77.04",
        )
    }

    val ChevronLeft: ImageVector by lazy {
        icon(
            "chevron-left",
            "m15 18-6-6 6-6",
        )
    }

    val ChevronRight: ImageVector by lazy {
        icon(
            "chevron-right",
            "m9 18 6-6-6-6",
        )
    }

    val House: ImageVector by lazy {
        icon(
            "house",
            "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
            "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        )
    }

    val Moon: ImageVector by lazy {
        icon(
            "moon",
            "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
        )
    }

    val Sun: ImageVector by lazy {
        icon(
            "sun",
            "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
            "M12 2v2",
            "M12 20v2",
            "m4.93 4.93 1.41 1.41",
            "m17.66 17.66 1.41 1.41",
            "M2 12h2",
            "M20 12h2",
            "m6.34 17.66-1.41 1.41",
            "m19.07 4.93-1.41 1.41",
        )
    }

    val Settings: ImageVector by lazy {
        icon(
            "settings",
            "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
        )
    }

    val LogOut: ImageVector by lazy {
        icon(
            "log-out",
            "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
            "M16 17L21 12L16 7",
            "M21 12L9 12",
        )
    }

    val BedDouble: ImageVector by lazy {
        icon(
            "bed-double",
            "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8",
            "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
            "M12 4v6",
            "M2 18h20",
        )
    }

    val Sofa: ImageVector by lazy {
        icon(
            "sofa",
            "M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3",
            "M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z",
            "M4 18v2",
            "M20 18v2",
            "M12 4v9",
        )
    }

    val CookingPot: ImageVector by lazy {
        icon(
            "cooking-pot",
            "M2 12h20",
            "M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",
            "m4 8 16-4",
            "m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8",
        )
    }

    val Bath: ImageVector by lazy {
        icon(
            "bath",
            "M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
            "M10 5L8 7",
            "M2 12L22 12",
            "M7 19L7 21",
            "M17 19L17 21",
        )
    }

    val Utensils: ImageVector by lazy {
        icon(
            "utensils",
            "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2",
            "M7 2v20",
            "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
        )
    }

    val Laptop: ImageVector by lazy {
        icon(
            "laptop",
            "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16",
        )
    }

    val Car: ImageVector by lazy {
        icon(
            "car",
            "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2",
            "M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
            "M9 17h6",
            "M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        )
    }

    val Trees: ImageVector by lazy {
        icon(
            "trees",
            "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z",
            "M7 16v6",
            "M13 19v3",
            "M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5",
        )
    }

    val DoorOpen: ImageVector by lazy {
        icon(
            "door-open",
            "M13 4h3a2 2 0 0 1 2 2v14",
            "M2 20h3",
            "M13 20h9",
            "M10 12v.01",
            "M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z",
        )
    }

    val ShieldCheck: ImageVector by lazy {
        icon(
            "shield-check",
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "m9 12 2 2 4-4",
        )
    }

    val ShieldAlert: ImageVector by lazy {
        icon(
            "shield-alert",
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "M12 8v4",
            "M12 16h.01",
        )
    }

    val Bluetooth: ImageVector by lazy {
        icon(
            "bluetooth",
            "m7 7 10 10-5 5V2l5 5L7 17",
        )
    }

    val LockOpen: ImageVector by lazy {
        icon(
            "lock-open",
            "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2Z",
            "M7 11V7a5 5 0 0 1 9.9-1",
        )
    }

    val X: ImageVector by lazy {
        icon(
            "x",
            "M18 6 6 18",
            "m6 6 12 12",
        )
    }

    val Check: ImageVector by lazy {
        icon(
            "check",
            "M20 6 9 17l-5-5",
        )
    }

    val PowerOff: ImageVector by lazy {
        icon(
            "power-off",
            "M18.36 6.64A9 9 0 0 1 20.77 15",
            "M6.16 6.16a9 9 0 1 0 12.68 12.68",
            "M12 2v4",
            "m2 2 20 20",
        )
    }

    val Bot: ImageVector by lazy {
        icon(
            "bot",
            "M12 8V4H8",
            "M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2Z",
            "M2 14h2",
            "M20 14h2",
            "M15 13v2",
            "M9 13v2",
        )
    }

    val Send: ImageVector by lazy {
        icon(
            "send",
            "m22 2-7 20-4-9-9-4Z",
            "M22 2 11 13",
        )
    }

    val User: ImageVector by lazy {
        icon(
            "user",
            "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",
            "M8 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
        )
    }

    val Globe: ImageVector by lazy {
        icon(
            "globe",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
            "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
            "M2 12h20",
        )
    }

    val PlugZap: ImageVector by lazy {
        icon(
            "plug-zap",
            "M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z",
            "m2 22 3-3",
            "M7.5 13.5 10 11",
            "M10.5 16.5 13 14",
            "m18 3-4 4h6l-4 4",
        )
    }

    val Ban: ImageVector by lazy {
        icon(
            "ban",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
            "m4.9 4.9 14.2 14.2",
        )
    }

    val WandSparkles: ImageVector by lazy {
        icon(
            "wand-sparkles",
            "m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",
            "m14 7 3 3",
            "M5 6v4",
            "M19 14v4",
            "M10 2v2",
            "M7 8H3",
            "M21 16h-4",
            "M11 3H9",
        )
    }

    val LoaderCircle: ImageVector by lazy {
        icon(
            "loader-circle",
            "M21 12a9 9 0 1 1-6.219-8.56",
        )
    }

    val ArrowRight: ImageVector by lazy {
        icon(
            "arrow-right",
            "M5 12h14",
            "m12 5 7 7-7 7",
        )
    }

    val WifiOff: ImageVector by lazy {
        icon(
            "wifi-off",
            "M12 20h.01",
            "M8.5 16.429a5 5 0 0 1 7 0",
            "M5 12.859a10 10 0 0 1 5.17-2.69",
            "M19 12.859a10 10 0 0 0-2.007-1.523",
            "M2 8.82a15 15 0 0 1 4.177-2.643",
            "M22 8.82a15 15 0 0 0-11.288-3.764",
            "m2 2 20 20",
        )
    }

    val KeyRound: ImageVector by lazy {
        icon(
            "key-round",
            "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
            "M16 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
        )
    }

    val RefreshCw: ImageVector by lazy {
        icon(
            "refresh-cw",
            "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
            "M21 3v5h-5",
            "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
            "M8 16H3v5",
        )
    }

    val Plus: ImageVector by lazy {
        icon(
            "plus",
            "M5 12h14",
            "M12 5v14",
        )
    }

    val Activity: ImageVector by lazy {
        icon(
            "activity",
            "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
        )
    }

    val ToggleRight: ImageVector by lazy {
        icon(
            "toggle-right",
            "M8 6h8a6 6 0 0 1 6 6v0a6 6 0 0 1 -6 6h-8a6 6 0 0 1 -6 -6v0a6 6 0 0 1 6 -6Z",
            "M14 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        )
    }

    val Clock: ImageVector by lazy {
        icon(
            "clock",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
            "M12 6L12 12L16 14",
        )
    }

    val TriangleAlert: ImageVector by lazy {
        icon(
            "triangle-alert",
            "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
            "M12 9v4",
            "M12 17h.01",
        )
    }

    val Leaf: ImageVector by lazy {
        icon(
            "leaf",
            "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
            "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
        )
    }

    val Info: ImageVector by lazy {
        icon(
            "info",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0",
            "M12 16v-4",
            "M12 8h.01",
        )
    }

    val TrendingUp: ImageVector by lazy {
        icon(
            "trending-up",
            "M22 7L13.5 15.5L8.5 10.5L2 17",
            "M16 7L22 7L22 13",
        )
    }

    val Telescope: ImageVector by lazy {
        icon(
            "telescope",
            "m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44",
            "m13.56 11.747 4.332-.924",
            "m16 21-3.105-6.21",
            "M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a1 1 0 0 1 1.212.727l1.515 6.06a1 1 0 0 1-.727 1.213l-1.09.272a2 2 0 0 1-2.425-1.455z",
            "m6.158 8.633 1.114 4.456",
            "m8 21 3.105-6.21",
            "M10 13a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
        )
    }

    val ThumbsUp: ImageVector by lazy {
        icon(
            "thumbs-up",
            "M7 10v12",
            "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
        )
    }

    val ThumbsDown: ImageVector by lazy {
        icon(
            "thumbs-down",
            "M17 14V2",
            "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z",
        )
    }

    val Pencil: ImageVector by lazy {
        icon(
            "pencil",
            "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            "m15 5 4 4",
        )
    }

    val Server: ImageVector by lazy {
        icon(
            "server",
            "M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
            "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2Z",
            "M6 6L6.01 6",
            "M6 18L6.01 18",
        )
    }

    val Maximize2: ImageVector by lazy {
        icon(
            "maximize-2",
            "M15 3L21 3L21 9",
            "M9 21L3 21L3 15",
            "M21 3L14 10",
            "M3 21L10 14",
        )
    }

    val Minimize2: ImageVector by lazy {
        icon(
            "minimize-2",
            "M4 14L10 14L10 20",
            "M20 10L14 10L14 4",
            "M14 10L21 3",
            "M3 21L10 14",
        )
    }
}
