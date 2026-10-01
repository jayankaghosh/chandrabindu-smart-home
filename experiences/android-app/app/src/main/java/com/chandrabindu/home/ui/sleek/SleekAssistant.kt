package com.chandrabindu.home.ui.sleek

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.ChatAction
import com.chandrabindu.home.data.ChatRoutine
import com.chandrabindu.home.data.SleekApi
import kotlinx.coroutines.launch

private data class Msg(
    val id: Int,
    val role: String,
    val content: String,
    val actions: List<ChatAction> = emptyList(),
    val routines: List<ChatRoutine> = emptyList(),
)

private data class Pending(val actions: List<ChatAction>, val routines: List<ChatRoutine>)

/** Floating assistant (Assistant.tsx): a chat that proposes actions you confirm. */
@Composable
fun BoxScope.SleekAssistant(api: SleekApi) {
    val sk = LocalSleek.current
    var open by remember { mutableStateOf(false) }
    var fullscreen by remember { mutableStateOf(false) }
    val messages = remember { mutableStateListOf<Msg>() }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<Pending?>(null) }
    var running by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var nextId by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    fun add(m: (Int) -> Msg) {
        nextId += 1
        messages += m(nextId)
    }

    fun send() {
        val text = input.trim()
        if (text.isEmpty() || sending) return
        error = null
        add { Msg(it, "user", text) }
        input = ""
        sending = true
        scope.launch {
            try {
                val r = api.chat(messages.map { it.role to it.content })
                add { Msg(it, "assistant", r.reply, r.actions, r.routines) }
                if (r.actions.isNotEmpty() || r.routines.isNotEmpty()) confirm = Pending(r.actions, r.routines)
            } catch (e: Exception) {
                error = e.message ?: "The assistant failed to reply"
            } finally {
                sending = false
            }
        }
    }

    fun runConfirmed() {
        val p = confirm ?: return
        running = true
        scope.launch {
            try {
                val (ok, failed, skipped) = api.runConfirmed(p.actions, p.routines)
                val bits = mutableListOf("$ok done")
                if (failed > 0) bits += "$failed failed"
                if (skipped > 0) bits += "$skipped skipped (locked)"
                add { Msg(it, "assistant", "✓ ${bits.joinToString(" · ")}.") }
                confirm = null
            } catch (e: Exception) {
                error = e.message
            } finally {
                running = false
            }
        }
    }

    fun cancelConfirm() {
        confirm = null
        add { Msg(it, "assistant", "Okay, I won't make any changes.") }
    }

    if (!open) {
        Box(
            Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(end = 24.dp, bottom = 24.dp).size(64.dp)
                .pressable(pressedScale = 0.92f) { open = true }
                .shadow(16.dp, CircleShape, ambientColor = Tw.brand600, spotColor = Tw.brand600)
                .clip(CircleShape).background(if (sk.dark) Color.White else Tw.brand500),
            contentAlignment = Alignment.Center,
        ) { SIcon(Lucide.Bot, 28.dp, if (sk.dark) Tw.slate900 else Color.White) }
        return
    }

    BackHandler { if (confirm == null) open = false }
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size, sending) {
        val count = messages.size + (if (sending) 1 else 0)
        if (count > 0) listState.animateScrollToItem(count - 1)
    }
    Box(
        if (fullscreen) Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().padding(12.dp)
        else Modifier.align(Alignment.BottomEnd).navigationBarsPadding().imePadding().padding(end = 16.dp, bottom = 16.dp, start = 16.dp)
            .widthIn(max = 400.dp).fillMaxWidth()
            // h-[min(78vh,600px)] like the web window.
            .height(minOf(LocalConfiguration.current.screenHeightDp * 0.78f, 600f).dp),
    ) {
        Column(
            Modifier.fillMaxSize().shadow(24.dp, Rounded3xl)
                .glass(sk, Rounded3xl, if (sk.dark) Color(0xFF1C1F27).copy(alpha = 0.96f) else Color.White.copy(alpha = 0.85f)),
        ) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.brand500.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center,
                ) { SIcon(Lucide.Bot, 16.dp, if (sk.dark) Tw.slate200 else Tw.brand600) }
                Spacer(Modifier.width(8.dp))
                Text("Assistant", fontWeight = FontWeight.SemiBold, color = sk.title, modifier = Modifier.weight(1f))
                SmallIconBtn(if (fullscreen) Lucide.Minimize2 else Lucide.Maximize2, "Fullscreen") { fullscreen = !fullscreen }
                Spacer(Modifier.width(4.dp))
                SmallIconBtn(Lucide.X, "Close") { open = false }
            }
            Box(Modifier.fillMaxWidth().padding(horizontal = 0.dp).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.5f)).heightIn(min = 1.dp, max = 1.dp))

            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (messages.isEmpty() && !sending) {
                    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        SIcon(Lucide.Sparkles, 24.dp, if (sk.dark) Tw.slate200 else Tw.brand500)
                        Spacer(Modifier.size(12.dp))
                        Text("Ask about your home or give a command", fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.slate200 else Tw.slate700, textAlign = TextAlign.Center)
                        Text(
                            "e.g. \"How many lights are on?\" or \"Turn on all the striplights and turn the other lights off.\"",
                            fontSize = 14.sp, color = sk.muted, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 300.dp).padding(top = 4.dp),
                        )
                    }
                }
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    items(messages, key = { it.id }) { m -> Bubble(m) }
                    if (sending) item(key = "thinking") {
                        Row {
                            Avatar(false)
                            Spacer(Modifier.width(10.dp))
                            Row(
                                Modifier.clip(Rounded2xl).background(if (sk.dark) Color.White.copy(alpha = 0.07f) else Color.White.copy(alpha = 0.6f)).padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Spinner(14.dp, sk.muted)
                                Text("  Thinking…", fontSize = 14.sp, color = if (sk.dark) Tw.slate300 else Tw.slate500)
                            }
                        }
                    }
                }
            }
            error?.let { Text(it, color = Tw.red500, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
            Box(Modifier.fillMaxWidth().background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.5f)).heightIn(min = 1.dp, max = 1.dp))
            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassField(
                    input, { input = it }, "Ask or command your home…", Modifier.weight(1f),
                    imeAction = ImeAction.Go, onDone = ::send, enabled = !sending,
                )
                Spacer(Modifier.width(8.dp))
                BtnPrimary(enabled = !sending && input.isNotBlank(), onClick = ::send) {
                    if (sending) Spinner(15.dp, LocalContentColor.current) else BtnIcon(Lucide.Send)
                }
            }
        }
    }

    confirm?.let { p ->
        ModalCard(scrim = Tw.slate900.copy(alpha = 0.4f), onDismiss = { if (!running) cancelConfirm() }) {
            Text("Confirm these actions?", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, letterSpacing = (-0.3).sp)
            val parts = listOfNotNull(
                p.routines.size.takeIf { it > 0 }?.let { "$it routine${if (it == 1) "" else "s"}" },
                p.actions.size.takeIf { it > 0 }?.let { "$it device action${if (it == 1) "" else "s"}" },
            )
            Text("The assistant will run ${parts.joinToString(" and ")}:", fontSize = 14.sp, color = sk.muted, modifier = Modifier.padding(top = 4.dp, bottom = 16.dp))
            Column(Modifier.heightIn(max = 256.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (r in p.routines) {
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedXl)
                            .background(if (sk.dark) Color.White.copy(alpha = 0.06f) else Color(0x99FDF4FF))
                            .border(1.dp, if (sk.dark) Color.White.copy(alpha = 0.1f) else Color(0xB3F5D0FE), RoundedXl)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        SIcon(Lucide.WandSparkles, 14.dp, if (sk.dark) Tw.slate300 else Tw.fuchsia600)
                        Text("  Run \"${r.name}\"  ", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.slate200 else Tw.slate800)
                        Text("${r.actionCount} action${if (r.actionCount == 1) "" else "s"}", fontSize = 12.sp, color = sk.muted)
                    }
                }
                for (a in p.actions) {
                    Text(
                        actionLine(a, sk),
                        fontSize = 14.sp,
                        modifier = Modifier.fillMaxWidth().glass(sk, RoundedXl, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.5f)).padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                BtnGhost(enabled = !running, onClick = ::cancelConfirm) { BtnIcon(Lucide.X); BtnText("Cancel") }
                BtnPrimary(enabled = !running, onClick = ::runConfirmed) {
                    if (running) Spinner(15.dp, LocalContentColor.current) else BtnIcon(Lucide.Check)
                    BtnText("Yes, do it")
                }
            }
        }
    }
}

private fun actionLine(a: ChatAction, sk: Sleek) = buildAnnotatedString {
    withStyle(SpanStyle(color = sk.faint)) { append("${a.roomName}  ") }
    withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.slate200 else Tw.slate800)) { append(a.deviceName) }
    withStyle(SpanStyle(color = sk.muted)) { append("  ${a.controlName}  →  ") }
    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = sk.title)) { append(a.valueLabel) }
    if (a.locked) withStyle(SpanStyle(color = if (sk.dark) Tw.amber300 else Tw.amber600)) { append("   locked, will skip") }
}

@Composable
private fun SmallIconBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val sk = LocalSleek.current
    Box(
        Modifier.size(32.dp).pressable(pressedScale = 0.92f, onClick = onClick).glass(sk, RoundedXl),
        contentAlignment = Alignment.Center,
    ) { androidx.compose.material3.Icon(icon, contentDescription = label, tint = sk.iconBtnFg, modifier = Modifier.size(15.dp)) }
}

@Composable
private fun Avatar(user: Boolean) {
    val sk = LocalSleek.current
    Box(
        Modifier.size(32.dp).clip(CircleShape).background(
            when {
                sk.dark -> Color.White.copy(alpha = 0.1f)
                user -> Tw.brand500.copy(alpha = 0.15f)
                else -> Tw.slate200.copy(alpha = 0.7f)
            },
        ),
        contentAlignment = Alignment.Center,
    ) { SIcon(if (user) Lucide.User else Lucide.Bot, 15.dp, if (sk.dark) Tw.slate200 else if (user) Tw.brand600 else Tw.slate600) }
}

@Composable
private fun Bubble(m: Msg) {
    val sk = LocalSleek.current
    val user = m.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (user) Arrangement.End else Arrangement.Start) {
        if (!user) { Avatar(false); Spacer(Modifier.width(10.dp)) }
        Column(
            Modifier.widthIn(max = 280.dp).clip(Rounded2xl)
                .background(if (user) Tw.brand500 else if (sk.dark) Color.White.copy(alpha = 0.07f) else Color.White.copy(alpha = 0.6f))
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(m.content, fontSize = 14.sp, lineHeight = 21.sp, color = if (user) Color.White else if (sk.dark) Tw.slate100 else Tw.slate800)
            if (m.actions.isNotEmpty() || m.routines.isNotEmpty()) {
                Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (r in m.routines) Text("Run \"${r.name}\" (${r.actionCount} action${if (r.actionCount == 1) "" else "s"})", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = if (sk.dark) Tw.slate200 else Tw.slate700)
                    for (a in m.actions) Text(actionLine(a, sk), fontSize = 12.sp)
                }
            }
        }
        if (user) { Spacer(Modifier.width(10.dp)); Avatar(true) }
    }
}
