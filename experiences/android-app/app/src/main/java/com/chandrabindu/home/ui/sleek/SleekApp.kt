package com.chandrabindu.home.ui.sleek

import android.content.Context
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.SleekApi
import java.util.Calendar

/** Navigation stack entries (SleekApp.tsx Screen). */
sealed class Screen(val key: String) {
    data object Home : Screen("home")
    data object Favourites : Screen("favourites")
    data object Rooms : Screen("rooms")
    data class Room(val roomId: String) : Screen("room:$roomId")
    data object Routines : Screen("routines")
    data object Automations : Screen("automations")
    data object Shortcuts : Screen("shortcuts")
    data object SwitchGroups : Screen("switchGroups")
    data object Usage : Screen("usage")
    data object Insights : Screen("insights")
    data object Settings : Screen("settings")

    companion object {
        fun of(key: String): Screen? = when {
            key.startsWith("room:") -> Room(key.removePrefix("room:"))
            else -> listOf(Home, Favourites, Rooms, Routines, Automations, Shortcuts, SwitchGroups, Usage, Insights, Settings)
                .firstOrNull { it.key == key }
        }

        fun of(section: Section): Screen = when (section) {
            Section.FAVOURITES -> Favourites
            Section.ROOMS -> Rooms
            Section.ROUTINES -> Routines
            Section.AUTOMATIONS -> Automations
            Section.SHORTCUTS -> Shortcuts
            Section.SWITCH_GROUPS -> SwitchGroups
            Section.USAGE -> Usage
            Section.INSIGHTS -> Insights
        }
    }
}

/** The protected-off popup stays dismissed until the next launch (process lifetime). */
private object LaunchFlags {
    var protectedDismissed = false
}

private const val NAV_KEY = "sleek-nav"

private fun loadNav(context: Context): List<String> {
    val raw = context.getSharedPreferences("ui", Context.MODE_PRIVATE).getString(NAV_KEY, null) ?: return listOf("home")
    val keys = raw.split("\n").filter { Screen.of(it) != null }
    return if (keys.isEmpty() || keys.first() != "home") listOf("home") else keys
}

private fun saveNav(context: Context, keys: List<String>) {
    context.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().putString(NAV_KEY, keys.joinToString("\n")).apply()
}

private fun greeting(): String {
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when {
        h < 12 -> "Good morning"
        h < 18 -> "Good afternoon"
        else -> "Good evening"
    }
}

/** The signed-in app: header, nav stack with slide transitions, and the global overlays. */
@Composable
fun SleekApp(repo: HomeRepository, api: SleekApi, s: HomeState, theme: ThemeStore, toggleTheme: () -> Unit) {
    val context = LocalContext.current
    var stack by rememberSaveable { mutableStateOf(loadNav(context)) }
    var forward by remember { mutableStateOf(true) }
    var groupedKeys by remember { mutableStateOf(emptySet<String>()) }
    var pendingProtected by remember { mutableStateOf<PendingProtected?>(null) }
    var protDismissed by remember { mutableStateOf(LaunchFlags.protectedDismissed) }

    val screen = Screen.of(stack.last()) ?: Screen.Home
    LaunchedEffect(stack) { saveNav(context, stack) }
    // A restored room that no longer exists drops back gracefully.
    LaunchedEffect(screen, s.rooms) {
        if (screen is Screen.Room && s.rooms.isNotEmpty() && s.rooms.none { it.id == screen.roomId }) {
            stack = if (stack.size > 1) stack.dropLast(1) else listOf("home")
        }
    }
    LaunchedEffect(Unit) {
        groupedKeys = try {
            api.switchGroups().flatMap { g -> g.members.map { it.key } }.toSet()
        } catch (_: Exception) {
            emptySet()
        }
    }

    fun go(sc: Screen) { forward = true; stack = stack + sc.key }
    fun back() { forward = false; if (stack.size > 1) stack = stack.dropLast(1) }
    fun home() { forward = false; stack = listOf("home") }
    fun switchRoom(roomId: String) {
        val top = Screen.of(stack.last()) as? Screen.Room ?: return
        if (top.roomId == roomId) return
        val ids = s.rooms.map { it.id }
        forward = ids.indexOf(roomId) >= ids.indexOf(top.roomId)
        stack = stack.dropLast(1) + Screen.Room(roomId).key
    }
    BackHandler(enabled = stack.size > 1) { back() }
    val slidePx = with(LocalDensity.current) { 48.dp.roundToPx() }

    val title = when (screen) {
        Screen.Home -> s.houseName
        Screen.Rooms -> "Rooms"
        is Screen.Room -> s.rooms.firstOrNull { it.id == screen.roomId }?.name ?: "Room"
        Screen.Favourites -> "Favourites"
        Screen.Routines -> "Routines"
        Screen.Automations -> "Automations"
        Screen.Shortcuts -> "Shortcuts"
        Screen.SwitchGroups -> "Switch Groups"
        Screen.Usage -> "Usage"
        Screen.Insights -> "Insights"
        Screen.Settings -> "Settings"
    }

    val off = protectedOff(s)
    val showProtected = off.isNotEmpty() && !protDismissed
    // Android 12+ can blur what's behind a dialog, like the web's backdrop-blur.
    val modalOpen = showProtected || pendingProtected != null || s.appLocked || s.setupIncomplete
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().then(if (modalOpen) Modifier.blur(10.dp) else Modifier)) {
            Header(
                atHome = screen == Screen.Home, title = title, base = s.serverAddress,
                dark = LocalSleek.current.dark, toggleTheme = toggleTheme,
                back = ::back, home = ::home,
                settings = { go(Screen.Settings) }, logout = { repo.signOut() },
            )
            if (screen is Screen.Room) SleekRoomSwitcher(s, screen.roomId, ::switchRoom)

            AnimatedContent(
                targetState = screen,
                transitionSpec = {
                    // Screen slide like motion.ts: 48px in from the right on push, from the left on pop.
                    val spec = spring<androidx.compose.ui.unit.IntOffset>(stiffness = 400f, dampingRatio = 0.9f)
                    val dx = if (forward) slidePx else -slidePx
                    (slideInHorizontally(spec) { dx } + fadeIn(spring(stiffness = 400f))) togetherWith
                        (slideOutHorizontally(spec) { -dx } + fadeOut(spring(stiffness = 400f)))
                },
                contentKey = { it.key },
                modifier = Modifier.weight(1f).fillMaxWidth(),
                label = "screen",
            ) { sc ->
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()
                        .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 120.dp)
                        .navigationBarsPadding(),
                ) {
                    val request = { p: PendingProtected -> pendingProtected = p }
                    when (sc) {
                        Screen.Home -> SleekHomeScreen(s) { go(Screen.of(it)) }
                        Screen.Favourites -> SleekFavourites(repo, s, groupedKeys, request)
                        Screen.Rooms -> SleekRoomList(s) { go(Screen.Room(it)) }
                        is Screen.Room -> s.rooms.firstOrNull { it.id == sc.roomId }?.let { room ->
                            SleekRoomDetail(repo, s, room, groupedKeys, request)
                        }
                        Screen.Routines -> SleekRoutines(repo, s)
                        Screen.Automations -> SleekAutomations(repo, s)
                        Screen.Shortcuts -> SleekShortcuts(api, s)
                        Screen.SwitchGroups -> SleekSwitchGroups(api, s) { groups ->
                            groupedKeys = groups.flatMap { g -> g.members.map { it.key } }.toSet()
                        }
                        Screen.Usage -> SleekUsage(api)
                        Screen.Insights -> SleekInsights(api, s)
                        Screen.Settings -> SleekSettings(repo, s, theme) { home() }
                    }
                }
            }
        }

        MasterControl(repo, s)
        if (s.aiAvailable) SleekAssistant(api)
        SleekToast(s) { repo.dismissToast() }

        if (showProtected) {
            ProtectedAlert(repo, off) {
                protDismissed = true
                LaunchFlags.protectedDismissed = true
            }
        }
        pendingProtected?.let { p -> ProtectedConfirm(repo, p) { pendingProtected = null } }
        if (s.appLocked) LockedOverlay(repo, s)
        if (s.setupIncomplete) SuperProtectedGate(api, s)
    }
}

@Composable
private fun Header(
    atHome: Boolean,
    title: String,
    base: String,
    dark: Boolean,
    toggleTheme: () -> Unit,
    back: () -> Unit,
    home: () -> Unit,
    settings: () -> Unit,
    logout: () -> Unit,
) {
    val sk = LocalSleek.current
    Column(Modifier.fillMaxWidth().background(sk.headerBg)) {
        Row(
            Modifier.statusBarsPadding().fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (atHome) {
                SleekLogo(48, base)
            } else {
                IconBtn(Lucide.ChevronLeft, "Back", big = true, iconSize = 26.dp, onClick = back)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                if (atHome) {
                    Text(
                        greeting().uppercase(), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp,
                        color = if (sk.dark) Tw.slate500 else Tw.slate400, lineHeight = 14.sp,
                    )
                }
                Text(
                    title, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.6).sp,
                    color = sk.title, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 30.sp,
                )
            }
            Spacer(Modifier.width(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                val themeIcon = if (dark) Lucide.Sun else Lucide.Moon
                if (atHome) {
                    IconBtn(themeIcon, "Toggle theme", onClick = toggleTheme)
                    IconBtn(Lucide.Settings, "Settings", onClick = settings)
                    IconBtn(Lucide.LogOut, "Log out", onClick = logout)
                } else {
                    IconBtn(themeIcon, "Toggle theme", big = true, iconSize = 16.dp, onClick = toggleTheme)
                    IconBtn(Lucide.House, "Home", big = true, iconSize = 22.dp, onClick = home)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(sk.headerBorder))
    }
}
