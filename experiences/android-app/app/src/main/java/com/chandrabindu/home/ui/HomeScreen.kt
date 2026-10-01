package com.chandrabindu.home.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.ElectricalServices
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.Automation
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.Room
import com.chandrabindu.home.data.Routine
import com.chandrabindu.home.data.SearchHit
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(repo: HomeRepository, s: HomeState, openSettings: () -> Unit, openFullApp: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var expanded by rememberSaveable { mutableStateOf(setOf<String>()) }
    var automationsOpen by rememberSaveable { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()
    // Results always start at the top (the home list keeps its own position otherwise).
    LaunchedEffect(query) { if (query.isNotBlank()) listState.scrollToItem(0) }

    Column(Modifier.fillMaxSize().statusBarsPadding().imePadding()) {
        Header(s, query, { query = it }, openSettings, openFullApp, repo)
        if (s.appLocked) LockBanner(repo, s)
        if (s.setupIncomplete) SetupBanner(s, openFullApp)

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                scope.launch {
                    repo.reloadQuietly()
                    if (!repo.current.live) repo.refreshStatuses()
                    refreshing = false
                }
            },
            modifier = Modifier.weight(1f),
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 6.dp, bottom = 96.dp),
            ) {
                if (query.isBlank()) {
                    favourites(repo, s)
                    routines(repo, s)
                    rooms(repo, s, expanded) { id ->
                        expanded = if (id in expanded) expanded - id else expanded + id
                    }
                    automations(repo, s, automationsOpen) { automationsOpen = !automationsOpen }
                    item(key = "footer") { Footer(s) }
                } else {
                    searchResults(repo, s, query)
                }
            }
        }
    }
}

// region Header

@Composable
private fun Header(
    s: HomeState, query: String, onQuery: (String) -> Unit,
    openSettings: () -> Unit, openFullApp: () -> Unit, repo: HomeRepository,
) {
    val focus = LocalFocusManager.current
    // Re-render the "Updated Nm ago" line now and then.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(15_000)
            now = System.currentTimeMillis()
        }
    }

    Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandTile(36, 20)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(s.houseName, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(7.dp).clip(CircleShape)
                            .background(if (s.live) Green else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)),
                    )
                    Spacer(Modifier.width(5.dp))
                    Text(statusLine(s, now), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            IconButton(onClick = openFullApp) {
                Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = "Open the full app", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = openSettings) {
                Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.padding(end = 8.dp).fillMaxWidth().height(46.dp).clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surfaceContainerHigh).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) {
                    Text("Search a switch, room or routine", fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f))
                }
                BasicTextField(
                    value = query, onValueChange = onQuery, singleLine = true,
                    textStyle = TextStyle(fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface),
                    cursorBrush = SolidColor(Brand),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = {
                        // Return runs the top hit, like the Mac panel.
                        when (val hit = s.searchHits(query).firstOrNull()) {
                            is SearchHit.RoutineHit -> repo.run(hit.routine)
                            is SearchHit.ControlHit -> if (!hit.ref.fn.protected) repo.primaryAction(hit.ref)
                            null -> Unit
                        }
                        focus.clearFocus()
                    }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            if (query.isNotEmpty()) {
                Icon(
                    Icons.Filled.Cancel, contentDescription = "Clear search",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    modifier = Modifier.size(20.dp).clip(CircleShape).clickable { onQuery(""); focus.clearFocus() },
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(onSummary(s), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            if (s.isPending("master")) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 1.5.dp, color = Brand)
                Spacer(Modifier.width(8.dp))
            }
            val enabled = !s.appLocked && !s.setupIncomplete
            ConfirmButton("All off", Icons.Filled.PowerSettingsNew, MaterialTheme.colorScheme.onSurfaceVariant, enabled) { repo.master(false) }
            Spacer(Modifier.width(8.dp))
            ConfirmButton("All on", Icons.Filled.WbSunny, Orange, enabled) { repo.master(true) }
        }
    }
}

private fun statusLine(s: HomeState, now: Long): String {
    if (s.live) return "Live"
    val at = s.statusLoadedAt ?: return "Connected"
    val secs = ((now - at) / 1000).coerceAtLeast(0)
    return if (secs < 60) "Updated just now" else "Updated ${secs / 60}m ago"
}

private fun onSummary(s: HomeState): String {
    if (!s.statusKnown && s.statusLoadedAt == null) return "Reading switches…"
    val n = s.onCount
    return if (n == 0) "Everything is off" else "$n switch${if (n == 1) "" else "es"} on"
}

// endregion

// region Banners

@Composable
private fun LockBanner(repo: HomeRepository, s: HomeState) {
    Banner(
        Icons.Filled.Lock, Color(0xFFE5484D), "App is locked",
        s.lockReason ?: "A runaway switch loop was detected, so all control is paused.",
    ) {
        if (s.isAdmin) {
            Button(onClick = repo::unlockApp, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE5484D))) { Text("Unlock") }
        }
    }
}

@Composable
private fun SetupBanner(s: HomeState, openFullApp: () -> Unit) {
    Banner(
        Icons.Filled.ElectricalServices, Orange, "Setup incomplete",
        if (s.isAdmin) "Choose the switch that powers your internet before controlling anything."
        else "Ask your administrator to finish setting up the app.",
    ) {
        if (s.isAdmin) {
            Button(onClick = openFullApp, colors = ButtonDefaults.buttonColors(containerColor = Orange)) { Text("Finish setup") }
        }
    }
}

@Composable
private fun Banner(icon: ImageVector, tint: Color, title: String, message: String, accessory: @Composable () -> Unit) {
    Row(
        Modifier.padding(horizontal = 14.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp))
            .background(tint.copy(alpha = 0.12f)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            Text(message, fontSize = 13.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        accessory()
    }
}

// endregion

// region Sections

@Composable
private fun SectionLabel(text: String, trailing: String? = null, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 16.dp, bottom = 8.dp)) {
        Text(
            text.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.7.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f),
        )
        if (trailing != null) Text(trailing, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f))
    }
}

private fun LazyListScope.favourites(repo: HomeRepository, s: HomeState) {
    val refs = s.favouriteRefs
    if (refs.isEmpty()) return
    item(key = "fav-label") { SectionLabel("Favourites") }
    refs.chunked(2).forEachIndexed { i, pair ->
        item(key = "fav-row-$i-${pair.joinToString { it.id }}") {
            Row(Modifier.padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (ref in pair) FavouriteTile(repo, s, ref, Modifier.weight(1f))
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
private fun LazyListScope.routines(repo: HomeRepository, s: HomeState) {
    if (s.routines.isEmpty()) return
    item(key = "routines") {
        Column {
            SectionLabel("Routines")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (r in s.routines) RoutineChip(repo, s, r)
            }
        }
    }
}

@Composable
private fun RoutineChip(repo: HomeRepository, s: HomeState, routine: Routine) {
    val running = s.isPending("routine:${routine.id}")
    val result = s.routineResult[routine.id]
    val failed = result == "Failed"
    val haptic = rememberHaptic()
    val enabled = !running && !s.appLocked && !s.setupIncomplete
    Row(
        Modifier.alpha(if (enabled || running) 1f else 0.45f).clip(RoundedCornerShape(50)).background(Brand.copy(alpha = 0.13f))
            .clickable(enabled = enabled) { haptic(false); repo.run(routine) }
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val color = if (failed) Color(0xFFE5484D) else MaterialTheme.colorScheme.primary
        if (running) {
            CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 1.5.dp, color = color)
        } else {
            Icon(
                when {
                    result == null -> Icons.Filled.PlayArrow
                    failed -> Icons.Filled.Close
                    else -> Icons.Filled.Check
                },
                contentDescription = null, tint = color, modifier = Modifier.size(16.dp),
            )
        }
        Spacer(Modifier.width(6.dp))
        Text(result ?: routine.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = color, maxLines = 1)
    }
}

private fun LazyListScope.rooms(repo: HomeRepository, s: HomeState, expanded: Set<String>, toggle: (String) -> Unit) {
    item(key = "rooms-label") { SectionLabel("Rooms", "${s.rooms.size}") }
    for (room in s.rooms) {
        item(key = "room-${room.id}") {
            RoomCard(repo, s, room, room.id in expanded) { toggle(room.id) }
        }
    }
}

@Composable
private fun RoomCard(repo: HomeRepository, s: HomeState, room: Room, expanded: Boolean, toggle: () -> Unit) {
    val count = s.onCount(room)
    val haptic = rememberHaptic()
    val rotation by animateFloatAsState(if (expanded) 90f else 0f, label = "chevron")
    Surface(
        shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable(onClick = toggle).padding(start = 14.dp, end = 10.dp, top = 12.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    roomIcon(room.name), contentDescription = null,
                    tint = if (count > 0) Orange else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(12.dp))
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    Text(room.name, fontSize = 16.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (room.isBlocked) {
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Filled.Lock, contentDescription = "Locked", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                    }
                }
                if (count > 0) {
                    Text(
                        "$count on", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Orange,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(Orange.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                    if (!room.isBlocked && !s.appLocked && !s.setupIncomplete) {
                        Spacer(Modifier.width(6.dp))
                        Box(
                            Modifier.size(34.dp).clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surfaceContainerHigh)
                                .clickable { haptic(false); repo.turnOffRoom(room) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.PowerSettingsNew, contentDescription = "Turn off everything in ${room.name}", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                        }
                    }
                }
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.rotate(rotation),
                )
            }
            AnimatedVisibility(visible = expanded, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                Column(Modifier.padding(start = 4.dp, end = 4.dp, bottom = 8.dp)) {
                    if (room.isBlocked) RoomUnlock(repo, room) else RoomControls(repo, s, room)
                }
            }
        }
    }
}

@Composable
private fun RoomControls(repo: HomeRepository, s: HomeState, room: Room) {
    for (device in room.devices) {
        val listed = device.functions.filter(Controls::isListed)
        if (device.bluetooth) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Bluetooth, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("${device.name}: Bluetooth, use the Smart Life app", fontSize = 13.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else if (listed.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 8.dp, top = 10.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    device.name.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (device.id in s.offline) {
                    Spacer(Modifier.width(6.dp))
                    Text("OFFLINE", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Orange)
                }
                Spacer(Modifier.weight(1f))
                device.functions.firstOrNull(Controls::isChildLock)?.let { lock ->
                    PanelLockPill(repo, s, ControlRef(room, device, lock))
                }
            }
            for (fn in listed) ControlRow(repo, s, ControlRef(room, device, fn))
        }
    }
}

@Composable
private fun RoomUnlock(repo: HomeRepository, room: Room) {
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    fun unlock() {
        if (password.isEmpty() || busy) return
        busy = true
        scope.launch {
            error = repo.unlockRoom(room, password)
            busy = false
            if (error == null) password = ""
        }
    }
    Column(Modifier.padding(horizontal = 10.dp, vertical = 4.dp)) {
        Text("This room is locked. Enter its password to control it.", fontSize = 13.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = password, onValueChange = { password = it }, singleLine = true,
                placeholder = { Text("Room password") }, visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { unlock() }),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Button(onClick = ::unlock, enabled = password.isNotEmpty() && !busy, colors = ButtonDefaults.buttonColors(containerColor = Brand)) {
                Text("Unlock")
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp)) }
    }
}

private fun LazyListScope.automations(repo: HomeRepository, s: HomeState, open: Boolean, toggle: () -> Unit) {
    if (s.automations.isEmpty()) return
    item(key = "auto-label") {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = toggle), verticalAlignment = Alignment.CenterVertically) {
            SectionLabel(
                "Automations", "${s.automations.count { it.enabled }} of ${s.automations.size} on",
                Modifier.weight(1f),
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.padding(top = 8.dp).rotate(if (open) 90f else 0f),
            )
        }
    }
    if (!open) return
    item(key = "auto-list") {
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(vertical = 4.dp)) {
                for (a in s.automations) AutomationRow(repo, s, a)
            }
        }
    }
}

@Composable
private fun AutomationRow(repo: HomeRepository, s: HomeState, a: Automation) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Filled.Bolt, contentDescription = null, tint = if (a.enabled) Color(0xFFFFCC00) else MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(a.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${a.conditionCount} if · ${a.actionCount} then" + if (s.isAdmin) "" else " · admin only",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = a.enabled, enabled = s.isAdmin, onCheckedChange = { repo.toggleAutomation(a) },
            colors = SwitchDefaults.colors(checkedTrackColor = Brand, checkedBorderColor = Brand),
        )
    }
}

private fun LazyListScope.searchResults(repo: HomeRepository, s: HomeState, query: String) {
    val hits = s.searchHits(query)
    if (hits.isEmpty()) {
        item(key = "nohits") {
            Text(
                "No matches for \"$query\"", color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().padding(top = 40.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
        return
    }
    item(key = "hits-label") { SectionLabel("Results", "${hits.size}") }
    items(hits, key = { it.id }) { hit ->
        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
            when (hit) {
                is SearchHit.RoutineHit -> RoutineHitRow(repo, s, hit.routine)
                is SearchHit.ControlHit -> ControlRow(repo, s, hit.ref, subtitle = "${hit.ref.room.name} · ${hit.ref.device.name}")
            }
        }
    }
}

@Composable
private fun RoutineHitRow(repo: HomeRepository, s: HomeState, routine: Routine) {
    val haptic = rememberHaptic()
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !s.appLocked && !s.setupIncomplete) { haptic(false); repo.run(routine) }
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(38.dp).clip(CircleShape).background(Brand.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(routine.name, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            Text(
                s.routineResult[routine.id] ?: "Routine · ${routine.actionCount} action${if (routine.actionCount == 1) "" else "s"}",
                fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (s.isPending("routine:${routine.id}")) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 1.5.dp, color = Brand)
    }
}

@Composable
private fun Footer(s: HomeState) {
    val name = s.session?.username ?: ""
    Text(
        (if (s.isAdmin && name.lowercase() != "admin") "$name · admin" else name) +
            "  ·  Long-press a switch to add it to Favourites",
        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
        modifier = Modifier.fillMaxWidth().padding(top = 20.dp, start = 4.dp).navigationBarsPadding(),
    )
}

// endregion
