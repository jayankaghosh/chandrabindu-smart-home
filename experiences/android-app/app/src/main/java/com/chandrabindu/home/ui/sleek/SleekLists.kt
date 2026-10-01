package com.chandrabindu.home.ui.sleek

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.Automation
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.HubException
import com.chandrabindu.home.data.Shortcut
import com.chandrabindu.home.data.SleekApi
import com.chandrabindu.home.data.SwitchGroup
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun CenterNote(icon: ImageVector, title: String, body: String? = null) {
    val sk = LocalSleek.current
    Column(Modifier.fillMaxWidth().padding(vertical = 64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        SIcon(icon, 30.dp, sk.muted.copy(alpha = 0.6f))
        Spacer(Modifier.height(12.dp))
        Text(title, color = sk.muted, fontSize = 16.sp)
        if (body != null) {
            Text(body, color = sk.muted, fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 20.sp, modifier = Modifier.widthIn(max = 380.dp).padding(top = 8.dp))
        }
    }
}

@Composable
fun Loading() {
    Box(Modifier.fillMaxWidth().padding(vertical = 64.dp), contentAlignment = Alignment.Center) {
        Spinner(24.dp, LocalSleek.current.faint)
    }
}

// region Favourites

@Composable
fun SleekFavourites(repo: HomeRepository, s: HomeState, groupedKeys: Set<String>, requestProtected: (PendingProtected) -> Unit) {
    val sk = LocalSleek.current
    val entries = s.rooms.flatMap { room ->
        room.devices.filter { !it.bluetooth }.flatMap { d ->
            d.functions.filter { it.type in setOf("Boolean", "Enum", "Integer") && s.isFavourite(ControlRef(room, d, it)) }
                .map { ControlRef(room, d, it) }
        }
    }
    if (entries.isEmpty()) {
        Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(80.dp).clip(CircleShape).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.amber400.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { SIcon(Lucide.Star, 34.dp, Tw.amber500) }
            Spacer(Modifier.height(16.dp))
            Text("No favourites yet", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title)
            Text(
                "Open a room and tap the star on any switch to pin it here.", fontSize = 14.sp, color = sk.muted,
                textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 300.dp).padding(top = 6.dp),
            )
        }
        return
    }
    ControlGrid(entries) { ref ->
        val caption = "${ref.device.name} · ${ref.room.name}" + if (ref.room.isBlocked) " · 🔒" else ""
        SleekControlTile(repo, s, ref, inGroup = ref.id in groupedKeys, caption = caption, requestProtected = requestProtected)
    }
}

// endregion

// region Routines

@Composable
fun SleekRoutines(repo: HomeRepository, s: HomeState) {
    val sk = LocalSleek.current
    if (s.routines.isEmpty()) return CenterNote(Lucide.WandSparkles, "No routines yet")
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        for (r in s.routines) {
            val busy = s.isPending("routine:${r.id}")
            val done = s.routineResult[r.id]
            Column(Modifier.fillMaxWidth().glass(sk).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text(r.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, letterSpacing = (-0.3).sp)
                    Text("${r.actionCount} action${if (r.actionCount == 1) "" else "s"}", fontSize = 14.sp, color = sk.muted, modifier = Modifier.padding(top = 2.dp))
                }
                BtnPrimary(
                    Modifier.fillMaxWidth(), enabled = !busy && !s.appLocked && !s.setupIncomplete,
                    padding = PaddingValues(vertical = 16.dp), onClick = { repo.run(r) },
                ) {
                    when {
                        busy -> Spinner(18.dp, LocalContentColor.current)
                        done != null -> BtnIcon(Lucide.Check, 18.dp)
                        else -> BtnIcon(Lucide.Play, 18.dp)
                    }
                    BtnText(done ?: "Run", 16)
                }
            }
        }
    }
}

// endregion

// region Automations

@Composable
fun SleekAutomations(repo: HomeRepository, s: HomeState) {
    val sk = LocalSleek.current
    if (s.automations.isEmpty()) return CenterNote(Lucide.Zap, "No automations yet")
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        for (a in s.automations) AutomationCard(repo, s, a, sk)
    }
}

@Composable
private fun AutomationCard(repo: HomeRepository, s: HomeState, a: Automation, sk: Sleek) {
    Column(
        Modifier.fillMaxWidth().alpha(if (a.enabled) 1f else 0.6f).glass(sk).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(a.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, maxLines = 1, overflow = TextOverflow.Ellipsis, letterSpacing = (-0.3).sp)
                Text(if (a.enabled) "Active" else "Disabled", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = sk.faint)
            }
            Box(
                Modifier.size(44.dp).pressable(s.isAdmin, 0.92f) { repo.toggleAutomation(a) }
                    .alpha(if (s.isAdmin) 1f else 0.4f)
                    .clip(Rounded2xl)
                    .background(
                        when {
                            sk.dark -> Color.White.copy(alpha = 0.1f)
                            a.enabled -> Tw.emerald500.copy(alpha = 0.15f)
                            else -> Tw.slate200.copy(alpha = 0.7f)
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                SIcon(
                    Lucide.Power, 18.dp,
                    when {
                        a.enabled && sk.dark -> Tw.emerald300
                        a.enabled -> Tw.emerald600
                        else -> Tw.slate500
                    },
                )
            }
        }
        Column(
            Modifier.fillMaxWidth().clip(Rounded2xl)
                .background(if (sk.dark) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.4f)).padding(12.dp),
        ) {
            Text(
                "IF ${if (a.match == "all") "ALL MATCH" else "ANY MATCH"}", fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.4.sp, color = if (sk.dark) Tw.slate300 else Tw.brand600,
            )
            Text("${a.conditionCount} condition${if (a.conditionCount == 1) "" else "s"}", fontSize = 14.sp, color = if (sk.dark) Tw.slate300 else Tw.slate600, modifier = Modifier.padding(top = 2.dp))
            SIcon(Lucide.ArrowRight, 14.dp, if (sk.dark) Tw.slate600 else Tw.slate300, Modifier.padding(vertical = 6.dp))
            Text("THEN", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp, color = if (sk.dark) Tw.emerald300 else Tw.emerald600)
            Text("${a.actionCount} action${if (a.actionCount == 1) "" else "s"}", fontSize = 14.sp, color = if (sk.dark) Tw.slate300 else Tw.slate600, modifier = Modifier.padding(top = 2.dp))
        }
    }
}

// endregion

// region Shortcuts

@Composable
fun SleekShortcuts(api: SleekApi, s: HomeState) {
    val sk = LocalSleek.current
    var items by remember { mutableStateOf<List<Shortcut>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val busy = remember { mutableStateMapOf<String, Boolean>() }
    val result = remember { mutableStateMapOf<String, Pair<String, Boolean>>() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        items = try {
            api.shortcuts()
        } catch (e: Exception) {
            error = e.message
            emptyList()
        }
    }
    val list = items ?: return Loading()
    if (list.isEmpty()) {
        return CenterNote(
            Lucide.Command, error ?: "No shortcuts yet",
            "A shortcut checks its IF when you run it, and only then does its THEN. Run it here or from a URL, e.g. an iPhone Shortcut when you get home.",
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        for (sc in list) {
            val r = result[sc.id]
            Column(Modifier.fillMaxWidth().glass(sk).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(sc.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, maxLines = 1, overflow = TextOverflow.Ellipsis, letterSpacing = (-0.3).sp)
                        Text(
                            (if (sc.conditionCount == 0) "Always"
                            else "If ${if (sc.match == "all") "all" else "any"} of ${sc.conditionCount} condition${if (sc.conditionCount == 1) "" else "s"}") +
                                " · ${sc.actionCount} action${if (sc.actionCount == 1) "" else "s"}",
                            fontSize = 14.sp, color = sk.muted,
                        )
                    }
                    if (sc.apiEnabled) {
                        Row(
                            Modifier.clip(CircleShape).background(Tw.sky500.copy(alpha = 0.15f)).padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            val c = if (sk.dark) Tw.sky300 else Tw.sky700
                            SIcon(Lucide.Globe, 12.dp, c)
                            Text("API", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = c)
                        }
                    }
                }
                BtnPrimary(
                    Modifier.fillMaxWidth(), enabled = busy[sc.id] != true,
                    padding = PaddingValues(vertical = 16.dp),
                    onClick = {
                        busy[sc.id] = true
                        scope.launch {
                            val res = try {
                                val out = api.runShortcut(sc.id)
                                out.message to out.ran
                            } catch (e: HubException) {
                                (e.message ?: "Failed") to false
                            } catch (e: Exception) {
                                "Failed" to false
                            }
                            busy[sc.id] = false
                            result[sc.id] = res
                            if (!repo().current.live) repo().refreshStatuses()
                            delay(4_500)
                            if (result[sc.id] == res) result.remove(sc.id)
                        }
                    },
                ) {
                    when {
                        busy[sc.id] == true -> Spinner(18.dp, LocalContentColor.current)
                        r != null -> if (r.second) BtnIcon(Lucide.Check, 18.dp)
                        else -> BtnIcon(Lucide.Play, 18.dp)
                    }
                    BtnText(r?.first ?: "Run", 16)
                }
            }
        }
    }
}

private fun repo() = com.chandrabindu.home.App.repo

// endregion

// region Switch groups

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SleekSwitchGroups(api: SleekApi, s: HomeState, onLoaded: (List<SwitchGroup>) -> Unit) {
    val sk = LocalSleek.current
    var groups by remember { mutableStateOf<List<SwitchGroup>?>(null) }
    LaunchedEffect(Unit) {
        groups = try {
            api.switchGroups().also(onLoaded)
        } catch (_: Exception) {
            emptyList()
        }
    }
    val list = groups ?: return Loading()
    if (list.isEmpty()) {
        Column(
            Modifier.fillMaxWidth().glass(sk, Rounded3xl, if (sk.dark) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.4f)).padding(40.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SIcon(Lucide.Link2, 24.dp, sk.muted)
            Spacer(Modifier.height(12.dp))
            Text("No switch groups yet.", color = sk.muted, fontSize = 16.sp)
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        for (g in list) {
            Column(
                Modifier.fillMaxWidth().glass(sk, Rounded3xl, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.5f)).padding(20.dp),
            ) {
                Text(g.name, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, modifier = Modifier.padding(bottom = 8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (m in g.members) {
                        val ref = s.findRef(m.deviceId, m.code)
                        Text(
                            "${ref?.device?.name ?: "?"} · ${ref?.fn?.name ?: m.code}", fontSize = 14.sp,
                            color = if (sk.dark) Tw.slate200 else Tw.slate700,
                            modifier = Modifier.glass(sk, CircleShape, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.5f))
                                .padding(horizontal = 12.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

// endregion

/** Protected controls that are off (admin only, like the web's /api/protected). */
fun protectedOff(s: HomeState): List<ControlRef> {
    if (!s.isAdmin) return emptyList()
    return s.rooms.flatMap { room ->
        room.devices.filter { !it.bluetooth }.flatMap { d ->
            d.functions.filter { it.protected && it.type == "Boolean" && !Controls.isChildLock(it) }
                .filter { s.values[d.id]?.containsKey(it.code) == true && s.value(d.id, it.code)?.bool != true }
                .map { ControlRef(room, d, it) }
        }
    }
}
