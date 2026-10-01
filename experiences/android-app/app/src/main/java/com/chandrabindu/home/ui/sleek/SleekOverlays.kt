package com.chandrabindu.home.ui.sleek

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.JsonValue
import com.chandrabindu.home.data.SleekApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Dimmed full-screen scrim with a centred glass card. */
@Composable
fun ModalCard(
    scrim: Color = Tw.slate900.copy(alpha = 0.6f),
    onDismiss: (() -> Unit)? = null,
    maxWidth: Int = 448,
    content: @Composable ColumnScope.() -> Unit,
) {
    val sk = LocalSleek.current
    BackHandler(enabled = true) { onDismiss?.invoke() }
    Box(
        Modifier.fillMaxSize().background(scrim)
            .clickable(remember { MutableInteractionSource() }, indication = null) { onDismiss?.invoke() }
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = maxWidth.dp).fillMaxWidth()
                .clickable(remember { MutableInteractionSource() }, indication = null) {}
                // Near-opaque: stands in for the web's backdrop-blur behind dialogs.
                .glass(sk, Rounded3xl, if (sk.dark) Color(0xFF1B1E26).copy(alpha = 0.96f) else Color(0xFFEEF1F6).copy(alpha = 0.95f))
                .padding(24.dp),
            content = content,
        )
    }
}

@Composable
private fun RoundIcon(icon: ImageVector, fg: Color, bg: Color, size: Int = 56, iconSize: Int = 26) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
        SIcon(icon, iconSize.dp, fg)
    }
}

// region Master control

/** Floating All On / All Off (SleekMasterControl.tsx), bottom-left on every screen. */
@Composable
fun BoxScope.MasterControl(repo: HomeRepository, s: HomeState) {
    var open by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<Boolean?>(null) }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun run(on: Boolean) {
        busy = true
        result = null
        scope.launch {
            val r = repo.masterNow(on)
            repo.dismissToast() // shown here instead, like the web
            result = if (r != null) "${if (on) "Turned on" else "Turned off"} ${r.ok} switch${if (r.ok == 1) "" else "es"}" else "Failed"
            busy = false
            confirm = null
            open = false
            delay(3_500)
            result = null
        }
    }

    Column(
        Modifier.align(Alignment.BottomStart).navigationBarsPadding().padding(start = 24.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AnimatedVisibility(open, enter = fadeIn() + scaleIn(initialScale = 0.95f), exit = fadeOut() + scaleOut(targetScale = 0.95f)) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                MasterButton(Lucide.Power, "All On", Tw.emerald500) { confirm = true }
                MasterButton(Lucide.PowerOff, "All Off", if (LocalSleek.current.dark) Tw.slate600 else Tw.slate700) { confirm = false }
            }
        }
        Box(
            Modifier.size(56.dp).pressable(pressedScale = 0.92f) { open = !open }
                .shadow(14.dp, CircleShape, ambientColor = Tw.brand500, spotColor = Tw.brand500)
                .clip(CircleShape).background(Brush.linearGradient(listOf(Tw.brand500, Tw.brand400))),
            contentAlignment = Alignment.Center,
        ) { SIcon(if (open) Lucide.X else Lucide.Zap, 22.dp, Color.White) }
    }

    result?.let {
        Text(
            it, color = Color.White, fontSize = 14.sp,
            modifier = Modifier.align(Alignment.BottomStart).navigationBarsPadding().padding(start = 24.dp, bottom = 96.dp)
                .widthIn(max = 320.dp).clip(Rounded2xl).background(Tw.slate900.copy(alpha = 0.9f)).padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }

    confirm?.let { on ->
        val sk = LocalSleek.current
        ModalCard(onDismiss = { if (!busy) confirm = null }, maxWidth = 384) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                RoundIcon(
                    if (on) Lucide.Power else Lucide.PowerOff,
                    if (on) Tw.emerald500 else Tw.slate500,
                    (if (on) Tw.emerald500 else Tw.slate500).copy(alpha = 0.15f),
                )
                Spacer(Modifier.height(16.dp))
                Text(if (on) "Turn everything on?" else "Turn everything off?", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title)
                Text(
                    if (on) "Every switch in every unlocked room will turn on." else "Every switch will turn off. Protected controls stay on.",
                    fontSize = 14.sp, color = sk.muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BtnGhost(enabled = !busy, onClick = { confirm = null }) { BtnText("Cancel") }
                    BtnPrimary(enabled = !busy && !s.appLocked, onClick = { run(on) }) {
                        if (busy) Spinner(15.dp, LocalContentColor.current) else BtnIcon(if (on) Lucide.Power else Lucide.PowerOff)
                        BtnText(if (on) "Turn all on" else "Turn all off")
                    }
                }
            }
        }
    }
}

@Composable
private fun MasterButton(icon: ImageVector, label: String, bg: Color, onClick: () -> Unit) {
    Row(
        Modifier.pressable(onClick = onClick).shadow(8.dp, Rounded2xl).clip(Rounded2xl).background(bg)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        SIcon(icon, 18.dp, Color.White)
        Text(label, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
    }
}

// endregion

// region Protected

/** Shown on launch when a protected control is off (ProtectedAlert.tsx). */
@Composable
fun ProtectedAlert(repo: HomeRepository, items: List<ControlRef>, onDismiss: () -> Unit) {
    val sk = LocalSleek.current
    ModalCard(onDismiss = null) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
            Box(
                Modifier.size(48.dp).clip(Rounded2xl).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.rose500.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { SIcon(Lucide.ShieldAlert, 26.dp, if (sk.dark) Tw.rose300 else Tw.rose500) }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Protected control${if (items.size > 1) "s" else ""} off", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, letterSpacing = (-0.3).sp)
                Text("These should stay on.", fontSize = 14.sp, color = sk.muted)
            }
        }
        Column(
            Modifier.padding(vertical = 16.dp).heightIn(max = 288.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (c in items) {
                Row(
                    Modifier.fillMaxWidth().glass(sk, Rounded2xl, if (sk.dark) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.4f))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(c.fn.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.slate100 else Tw.slate800, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(c.device.name, fontSize = 12.sp, color = sk.faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.width(12.dp))
                    TurnOnButton { repo.setValue(c, JsonValue.Bool(true)) }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
            BtnGhost(onClick = onDismiss) { BtnIcon(Lucide.X); BtnText("Not now") }
            BtnPrimary(onClick = { items.forEach { repo.setValue(it, JsonValue.Bool(true)) } }) { BtnIcon(Lucide.Power); BtnText("Turn all on") }
        }
    }
}

@Composable
private fun TurnOnButton(onClick: () -> Unit) {
    Row(
        Modifier.pressable(pressedScale = 0.95f, onClick = onClick).shadow(4.dp, RoundedXl).clip(RoundedXl)
            .background(Brush.horizontalGradient(listOf(Tw.emerald500, Tw.teal500))).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SIcon(Lucide.Power, 15.dp, Color.White)
        Text("Turn on", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** Admin confirm before changing a protected control. */
@Composable
fun ProtectedConfirm(repo: HomeRepository, pending: PendingProtected, onClose: () -> Unit) {
    val sk = LocalSleek.current
    ModalCard(scrim = Tw.slate900.copy(alpha = 0.5f), onDismiss = onClose, maxWidth = 384) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
            SIcon(Lucide.ShieldAlert, 20.dp, Tw.amber500)
            Spacer(Modifier.width(8.dp))
            Text("Protected control", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title)
        }
        Text(
            androidx.compose.ui.text.buildAnnotatedString {
                append("“${pending.ref.fn.name}” is protected. Set it to ")
                pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.Bold))
                append(WebLabels.valueLabel(pending.ref.fn, pending.value))
                pop()
                append("?")
            },
            fontSize = 14.sp, color = if (sk.dark) Tw.slate300 else Tw.slate600, modifier = Modifier.padding(bottom = 20.dp),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
            BtnGhost(onClick = onClose) { BtnIcon(Lucide.X); BtnText("Cancel") }
            BtnPrimary(onClick = { repo.setValue(pending.ref, pending.value); onClose() }) { BtnIcon(Lucide.Check); BtnText("Yes") }
        }
    }
}

// endregion

// region Locked / setup gate

/** Non-dismissible app lock (LockedOverlay.tsx). */
@Composable
fun LockedOverlay(repo: HomeRepository, s: HomeState) {
    val sk = LocalSleek.current
    ModalCard(scrim = Tw.slate900.copy(alpha = 0.7f), onDismiss = null) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            RoundIcon(Lucide.Lock, Tw.red500, Tw.red500.copy(alpha = 0.15f), 64, 32)
            Spacer(Modifier.height(16.dp))
            Text("APP IS LOCKED", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = sk.title, letterSpacing = (-0.4).sp)
            Text(
                "A runaway switch loop was detected and all control has been halted to protect your devices.",
                fontSize = 14.sp, color = if (sk.dark) Tw.slate300 else Tw.slate600, textAlign = TextAlign.Center, lineHeight = 20.sp,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
            )
            s.lockReason?.let { reason ->
                Row(
                    Modifier.fillMaxWidth().padding(bottom = 20.dp).clip(Rounded2xl).background(Tw.amber500.copy(alpha = 0.1f))
                        .border(1.dp, Tw.amber500.copy(alpha = 0.3f), Rounded2xl).padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    val c = if (sk.dark) Tw.amber300 else Tw.amber700
                    SIcon(Lucide.ShieldAlert, 16.dp, c, Modifier.padding(top = 2.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(reason, fontSize = 14.sp, color = c)
                }
            }
            if (s.isAdmin) {
                BtnPrimary(Modifier.fillMaxWidth(), padding = androidx.compose.foundation.layout.PaddingValues(vertical = 14.dp), onClick = repo::unlockApp) {
                    BtnIcon(Lucide.LockOpen, 18.dp)
                    BtnText("Unlock", 16)
                }
            } else {
                Text("Ask an administrator to unlock the app.", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = sk.muted)
            }
        }
    }
}

/** Setup gate until the lifeline switch is named (SuperProtectedGate.tsx). */
@Composable
fun SuperProtectedGate(api: SleekApi, s: HomeState) {
    val sk = LocalSleek.current
    var choice by remember { mutableStateOf<ControlRef?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var menu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val options = s.rooms.flatMap { room ->
        room.devices.filter { !it.bluetooth }.flatMap { d ->
            d.functions.filter { it.type == "Boolean" && !Controls.isChildLock(it) }.map { ControlRef(room, d, it) }
        }
    }
    fun save(ref: ControlRef?) {
        busy = true
        error = null
        scope.launch {
            try {
                api.setSuperProtected(ref?.device?.id, ref?.fn?.code)
            } catch (e: Exception) {
                error = e.message ?: "Couldn't save"
            } finally {
                busy = false
            }
        }
    }
    ModalCard(scrim = Tw.slate900.copy(alpha = 0.7f), onDismiss = null) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            RoundIcon(Lucide.PlugZap, Tw.indigo500, Tw.indigo500.copy(alpha = 0.15f), 64, 32)
            Spacer(Modifier.height(16.dp))
            if (!s.isAdmin) {
                Text("Setup incomplete", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = sk.title)
                Text(
                    "This home hasn't been fully set up yet. Please contact your administrator.", fontSize = 14.sp,
                    color = if (sk.dark) Tw.slate300 else Tw.slate600, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
                )
                return@Column
            }
            Text("Choose the main power switch", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = sk.title, textAlign = TextAlign.Center, lineHeight = 30.sp)
            Text(
                "Select the switch that powers your internet, router and this hub. It will be locked so it can never be turned off by accident. The app can't run until this is set.",
                fontSize = 14.sp, color = if (sk.dark) Tw.slate300 else Tw.slate600, textAlign = TextAlign.Center, lineHeight = 20.sp,
                modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
            )
            Text("Lifeline switch", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = sk.muted, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp))
            Box(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                Text(
                    choice?.let { "${it.room.name} · ${it.device.name} · ${it.fn.name}" } ?: if (options.isEmpty()) "No on/off switches found" else "Select a switch…",
                    fontSize = 14.sp, color = if (choice == null) sk.faint else sk.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().pressable(!busy) { menu = true }
                        .glass(sk, RoundedXl, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.55f)).padding(horizontal = 12.dp, vertical = 11.dp),
                )
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    for (o in options) {
                        DropdownMenuItem(text = { Text("${o.room.name} · ${o.device.name} · ${o.fn.name}") }, onClick = { choice = o; menu = false })
                    }
                }
            }
            BtnPrimary(
                Modifier.fillMaxWidth(), enabled = !busy && choice != null,
                padding = androidx.compose.foundation.layout.PaddingValues(vertical = 14.dp),
                onClick = { choice?.let(::save) },
            ) {
                if (busy) Spinner(18.dp, LocalContentColor.current) else BtnIcon(Lucide.ShieldCheck, 18.dp)
                BtnText("Set as main switch", 16)
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f).height(1.dp).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.slate200))
                Text("or", fontSize = 12.sp, color = sk.faint, modifier = Modifier.padding(horizontal = 12.dp))
                Box(Modifier.weight(1f).height(1.dp).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.slate200))
            }
            BtnGhost(Modifier.fillMaxWidth(), enabled = !busy, onClick = { save(null) }) {
                BtnIcon(Lucide.Ban)
                BtnText("My main switch isn't a smart switch")
            }
            Text("You can change this later in Settings.", fontSize = 12.sp, color = sk.faint, modifier = Modifier.padding(top = 16.dp))
            error?.let { Text(it, fontSize = 14.sp, color = Tw.red500, modifier = Modifier.padding(top = 8.dp)) }
        }
    }
}

// endregion

/** Repository toasts (errors), styled like the web's master result toast. */
@Composable
fun BoxScope.SleekToast(s: HomeState, onClick: () -> Unit) {
    val t = s.toast ?: return
    Text(
        t.text, color = Color.White, fontSize = 14.sp, textAlign = TextAlign.Center,
        modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 100.dp, start = 24.dp, end = 24.dp)
            .clip(Rounded2xl).background(Tw.slate900.copy(alpha = 0.9f)).clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    )
}
