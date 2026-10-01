package com.chandrabindu.home.ui.sleek

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.Room

enum class Section(val title: String, val subtitle: String, val from: Color, val to: Color) {
    FAVOURITES("Favourites", "Your starred switches", Tw.amber400, Tw.orange500),
    ROOMS("Rooms", "Browse by room", Tw.brand500, Tw.brand400),
    ROUTINES("Routines", "Run a scene", Tw.fuchsia500, Tw.pink500),
    AUTOMATIONS("Automations", "If this, then that", Tw.emerald400, Tw.teal500),
    SHORTCUTS("Shortcuts", "Run on demand or by URL", Tw.sky500, Tw.indigo500),
    SWITCH_GROUPS("Switch Groups", "Keep switches in sync", Tw.indigo500, Tw.blue500),
    USAGE("Usage", "On/off time per switch", Tw.rose400, Tw.red500),
    INSIGHTS("Insights", "Your home at a glance", Tw.sky400, Tw.cyan500),
    ;

    val icon: ImageVector
        get() = when (this) {
            FAVOURITES -> Lucide.Star
            ROOMS -> Lucide.LayoutGrid
            ROUTINES -> Lucide.Play
            AUTOMATIONS -> Lucide.Zap
            SHORTCUTS -> Lucide.Command
            SWITCH_GROUPS -> Lucide.Link2
            USAGE -> Lucide.BarChart3
            INSIGHTS -> Lucide.Sparkles
        }
}

/** Big touch-friendly navigation tile (NavTile.tsx). */
@Composable
fun NavTile(
    icon: ImageVector,
    title: String,
    subtitle: String?,
    from: Color,
    to: Color,
    badge: String? = null,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val sk = LocalSleek.current
    Column(
        modifier.heightIn(min = 132.dp).pressable(onClick = onClick).glass(sk).padding(20.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Box(
                Modifier.size(56.dp)
                    .then(if (sk.dark) Modifier else Modifier.shadow(10.dp, Rounded2xl, ambientColor = to, spotColor = to))
                    .clip(Rounded2xl)
                    .background(if (sk.dark) Brush.linearGradient(listOf(Color.White, Color.White)) else Brush.linearGradient(listOf(from, to))),
                contentAlignment = Alignment.Center,
            ) { SIcon(icon, 26.dp, if (sk.dark) Tw.slate900 else Color.White) }
            Spacer(Modifier.weight(1f))
            if (badge != null) {
                Text(
                    badge, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                    color = if (sk.dark) Color.White else Tw.brand700,
                    modifier = Modifier.clip(CircleShape)
                        .background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.brand500.copy(alpha = 0.15f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
            } else {
                SIcon(Lucide.ChevronRight, 22.dp, if (sk.dark) Tw.slate600 else Tw.slate300)
            }
        }
        Column(Modifier.padding(top = 8.dp)) {
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, letterSpacing = (-0.3).sp, lineHeight = 24.sp)
            if (subtitle != null) Text(subtitle, fontSize = 14.sp, color = sk.muted, lineHeight = 20.sp)
        }
    }
}

/** Two-column grid where both cells of a row share the taller height (CSS grid). */
@Composable
fun <T> TwoColumnGrid(items: List<T>, gap: Int, cell: @Composable (T, Modifier) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(gap.dp)) {
        for (pair in items.chunked(2)) {
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(gap.dp)) {
                cell(pair[0], Modifier.weight(1f).fillMaxHeight())
                if (pair.size > 1) cell(pair[1], Modifier.weight(1f).fillMaxHeight()) else Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun SleekHomeScreen(s: HomeState, open: (Section) -> Unit) {
    val sk = LocalSleek.current
    val offline = s.offline.size
    Column {
        Row(Modifier.padding(bottom = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill(sk.chipBg) {
                SIcon(Lucide.Lightbulb, 15.dp, if (s.onCount > 0) Tw.amber500 else Tw.slate400)
                Text(
                    "${s.onCount} on", fontSize = 14.sp, fontWeight = FontWeight.Medium,
                    color = if (sk.dark) Tw.slate200 else Tw.slate700,
                )
            }
            if (offline > 0) {
                Pill(Tw.amber500.copy(alpha = 0.15f)) {
                    SIcon(Lucide.WifiOff, 15.dp, if (sk.dark) Tw.amber300 else Tw.amber700)
                    Text("$offline offline", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.amber300 else Tw.amber700)
                }
            }
        }
        TwoColumnGrid(Section.entries, 16) { sec, m ->
            NavTile(sec.icon, sec.title, sec.subtitle, sec.from, sec.to, modifier = m) { open(sec) }
        }
    }
}

private val bedRe = Regex("""bed|bedroom|\bbr\b|mbr|gbr|fbr""")
private val livingRe = Regex("living|lounge|drawing|hall|sofa")
private val bathRe = Regex("bath|wash|toilet")
private val officeRe = Regex("office|study|work")
private val garageRe = Regex("garage|parking|car")
private val gardenRe = Regex("balcony|garden|terrace|lawn|outdoor")
private val poojaRe = Regex("pooja|temple|prayer")

/** Room icons (SleekRoomList.tsx roomIcon). */
fun webRoomIcon(name: String): ImageVector {
    val s = name.lowercase()
    return when {
        bedRe.containsMatchIn(s) -> Lucide.BedDouble
        livingRe.containsMatchIn(s) -> Lucide.Sofa
        "kitchen" in s -> Lucide.CookingPot
        bathRe.containsMatchIn(s) -> Lucide.Bath
        "dining" in s -> Lucide.Utensils
        officeRe.containsMatchIn(s) -> Lucide.Laptop
        garageRe.containsMatchIn(s) -> Lucide.Car
        gardenRe.containsMatchIn(s) -> Lucide.Trees
        poojaRe.containsMatchIn(s) -> Lucide.Sparkles
        else -> Lucide.DoorOpen
    }
}

/** On switches in a room: Boolean, not protected, not the panel lock. */
fun roomOnCount(s: HomeState, room: Room): Int = room.devices.sumOf { d ->
    d.functions.count { f ->
        f.type == "Boolean" && !f.protected && !Controls.isChildLock(f) && s.value(d.id, f.code)?.bool == true
    }
}

@Composable
fun SleekRoomList(s: HomeState, openRoom: (String) -> Unit) {
    val rooms = s.rooms.filter { it.devices.isNotEmpty() }
    TwoColumnGrid(rooms, 16) { room, m ->
        val locked = room.isBlocked
        val on = roomOnCount(s, room)
        NavTile(
            icon = if (locked) Lucide.Lock else webRoomIcon(room.name),
            title = room.name,
            subtitle = if (locked) "Locked" else "${room.devices.size} device${if (room.devices.size == 1) "" else "s"}",
            from = if (locked) Tw.slate400 else Tw.brand500,
            to = if (locked) Tw.slate500 else Tw.brand400,
            badge = if (!locked && on > 0) "$on on" else null,
            modifier = m,
        ) { openRoom(room.id) }
    }
}
