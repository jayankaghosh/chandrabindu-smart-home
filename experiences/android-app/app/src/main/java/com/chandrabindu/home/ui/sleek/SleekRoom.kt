package com.chandrabindu.home.ui.sleek

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.Block
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.JsonValue
import com.chandrabindu.home.data.Room
import kotlinx.coroutines.launch

/** Horizontal room pills under the header (SleekRoomSwitcher.tsx). */
@Composable
fun SleekRoomSwitcher(s: HomeState, activeId: String, onSwitch: (String) -> Unit) {
    val sk = LocalSleek.current
    val rooms = s.rooms
    if (rooms.size < 2) return
    val scroll = rememberScrollState()
    val positions = remember { mutableStateMapOf<String, Int>() }
    val density = LocalDensity.current
    LaunchedEffect(activeId, positions[activeId]) {
        positions[activeId]?.let { x ->
            val target = (x - with(density) { 120.dp.roundToPx() }).coerceAtLeast(0)
            scroll.animateScrollTo(target)
        }
    }
    Column {
        Row(
            Modifier.fillMaxWidth().background(if (sk.dark) Color.White.copy(alpha = 0.03f) else Color.White.copy(alpha = 0.3f))
                .horizontalScroll(scroll).padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for (room in rooms) {
                val active = room.id == activeId
                val on = roomOnCount(s, room)
                Box(
                    Modifier.padding(top = 6.dp, end = 4.dp)
                        .onGloballyPositioned { positions[room.id] = it.positionInParent().x.toInt() },
                ) {
                    Row(
                        Modifier
                            .pressable(!active, 0.95f) { onSwitch(room.id) }
                            .then(
                                if (active) Modifier.clip(CircleShape).background(if (sk.dark) Color.White else Tw.slate900)
                                else Modifier.glass(sk, CircleShape, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.5f))
                            )
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        if (room.locked) SIcon(Lucide.Lock, 12.dp, if (active) (if (sk.dark) Tw.slate900 else Color.White).copy(alpha = 0.7f) else if (sk.dark) Tw.amber300 else Tw.amber600)
                        Text(
                            room.name, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1,
                            color = when {
                                active -> if (sk.dark) Tw.slate900 else Color.White
                                sk.dark -> Tw.slate300
                                else -> Tw.slate600
                            },
                        )
                    }
                    if (on > 0) {
                        Box(
                            Modifier.align(Alignment.TopEnd).offset(4.dp, (-6).dp).heightIn(min = 20.dp).widthIn(min = 20.dp)
                                .shadow(2.dp, CircleShape).clip(CircleShape)
                                .background(if (sk.dark) Tw.slate900 else Color.White)
                                .padding(2.dp)
                                .clip(CircleShape)
                                .background(if (sk.dark) Color.White else Tw.slate900)
                                .padding(horizontal = 4.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("$on", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (sk.dark) Tw.slate900 else Color.White, lineHeight = 10.sp)
                        }
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(sk.headerBorder))
    }
}

/** A room's panels and controls (SleekRoomDetail.tsx). */
@Composable
fun SleekRoomDetail(
    repo: HomeRepository,
    s: HomeState,
    room: Room,
    groupedKeys: Set<String>,
    requestProtected: (PendingProtected) -> Unit,
) {
    val sk = LocalSleek.current
    if (room.isBlocked) return LockedRoom(repo, room)
    val devices = room.devices.filter { d -> d.functions.any { it.type in setOf("Boolean", "Enum", "Integer") } }
    Column(verticalArrangement = Arrangement.spacedBy(28.dp)) {
        if (devices.isEmpty()) {
            Text(
                "No controllable switches in this room.", color = sk.muted, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
            )
        }
        for (device in devices) {
            Column {
                val offline = device.id in s.offline
                Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        device.name.uppercase(),
                        fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp, lineHeight = 20.sp,
                        color = sk.faint, modifier = Modifier.weight(1f).padding(horizontal = 4.dp),
                    )
                    if (offline) {
                        Text("· offline", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (sk.dark) Tw.amber300 else Tw.amber600, modifier = Modifier.padding(end = 8.dp))
                    }
                    if (!device.bluetooth) {
                        device.functions.firstOrNull(Controls::isChildLock)?.let { lockFn ->
                            PanelLockToggle(repo, s, ControlRef(room, device, lockFn))
                        }
                    }
                }
                if (device.bluetooth) {
                    BluetoothNotice()
                } else {
                    val controls = device.functions.filter(Controls::isListed)
                    ControlGrid(controls.map { ControlRef(room, device, it) }) { ref ->
                        SleekControlTile(repo, s, ref, inGroup = ref.id in groupedKeys, requestProtected = requestProtected)
                    }
                }
            }
        }
    }
}

/** 2-column grid; Enum/Integer tiles span both columns (col-span-2). */
@Composable
fun ControlGrid(refs: List<ControlRef>, tile: @Composable (ControlRef) -> Unit) {
    // Group consecutive Booleans into pairs; wide tiles take a full row.
    val rows = mutableListOf<List<ControlRef>>()
    var pending: ControlRef? = null
    for (r in refs) {
        if (r.fn.type == "Boolean") {
            if (pending == null) pending = r else { rows += listOf(pending, r); pending = null }
        } else {
            if (pending != null) { rows += listOf(pending); pending = null }
            rows += listOf(r)
        }
    }
    pending?.let { rows += listOf(it) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for (row in rows) {
            if (row.size == 1 && row[0].fn.type != "Boolean") {
                tile(row[0])
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.weight(1f)) { tile(row[0]) }
                    if (row.size > 1) Box(Modifier.weight(1f)) { tile(row[1]) } else Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

/** The panel's physical-button lock (PanelLockToggle.tsx). Admins toggle; others read-only. */
@Composable
fun PanelLockToggle(repo: HomeRepository, s: HomeState, ref: ControlRef) {
    val sk = LocalSleek.current
    val locked = s.value(ref.device.id, ref.fn.code)?.bool == true
    val interactive = s.isAdmin && s.block(ref) == Block.NONE
    val fg = when {
        locked -> if (sk.dark) Tw.amber300 else Tw.amber600
        sk.dark -> Tw.slate300
        else -> Tw.slate500
    }
    val bg = when {
        locked -> Tw.amber500.copy(alpha = 0.15f)
        sk.dark -> Color.White.copy(alpha = 0.10f)
        else -> Tw.slate200.copy(alpha = 0.7f)
    }
    val ring = when {
        locked -> Tw.amber500.copy(alpha = 0.3f)
        sk.dark -> Color.White.copy(alpha = 0.10f)
        else -> Color.Black.copy(alpha = 0.05f)
    }
    Row(
        Modifier.padding(horizontal = 4.dp)
            .pressable(interactive, 0.95f) { repo.setValue(ref, JsonValue.Bool(!locked)) }
            .clip(CircleShape).background(bg).border(1.dp, ring, CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SIcon(if (locked) Lucide.Lock else Lucide.LockOpen, 13.dp, fg)
        Text(if (locked) "Buttons locked" else "Buttons unlocked", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = fg)
    }
}

/** A glass text field (`.field`): the whole frosted box is the tap target. */
@Composable
fun GlassField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    password: Boolean = false,
    big: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Done,
    onDone: () -> Unit = {},
    enabled: Boolean = true,
) {
    val sk = LocalSleek.current
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    val fg = if (sk.dark) Tw.slate100 else Tw.slate900
    val align = if (big) TextAlign.Center else TextAlign.Start
    BasicTextField(
        value = value, onValueChange = onValueChange, singleLine = true, enabled = enabled,
        textStyle = TextStyle(fontSize = if (big) 18.sp else 14.sp, color = fg, textAlign = align),
        cursorBrush = SolidColor(Tw.brand500),
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboardType, imeAction = imeAction, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(
            onDone = { onDone() }, onGo = { onDone() },
            onNext = { focus.moveFocus(androidx.compose.ui.focus.FocusDirection.Down) },
        ),
        modifier = modifier,
        decorationBox = { inner ->
            Box(
                Modifier.fillMaxWidth().glass(sk, RoundedXl, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.55f))
                    .padding(horizontal = 12.dp, vertical = if (big) 16.dp else 12.dp),
                contentAlignment = if (big) Alignment.Center else Alignment.CenterStart,
            ) {
                if (value.isEmpty()) {
                    Text(placeholder, fontSize = if (big) 18.sp else 14.sp, color = if (sk.dark) Tw.slate500 else Tw.slate400, textAlign = align, modifier = Modifier.fillMaxWidth())
                }
                inner()
            }
        },
    )
}

@Composable
private fun LockedRoom(repo: HomeRepository, room: Room) {
    val sk = LocalSleek.current
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    fun unlock() {
        if (password.isEmpty() || busy) return
        busy = true
        error = null
        scope.launch {
            error = repo.unlockRoom(room, password)
            busy = false
            if (error == null) password = ""
        }
    }
    Column(Modifier.fillMaxWidth().padding(top = 24.dp, start = 16.dp, end = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(80.dp).shadow(10.dp, CircleShape).clip(CircleShape)
                .background(if (sk.dark) Tw.slate700.copy(alpha = 0.7f) else Color.White.copy(alpha = 0.7f)),
            contentAlignment = Alignment.Center,
        ) { SIcon(Lucide.Lock, 34.dp, if (sk.dark) Tw.slate200 else Tw.slate600) }
        Spacer(Modifier.height(16.dp))
        Text("${room.name} is locked", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title)
        Text("Enter the room password to control it.", fontSize = 14.sp, color = sk.muted, modifier = Modifier.padding(top = 4.dp, bottom = 20.dp))
        GlassField(password, { password = it }, "Room password", Modifier.fillMaxWidth(), password = true, big = true, imeAction = ImeAction.Go, onDone = ::unlock)
        Spacer(Modifier.height(12.dp))
        BtnPrimary(Modifier.fillMaxWidth(), enabled = !busy && password.isNotEmpty(), padding = androidx.compose.foundation.layout.PaddingValues(vertical = 16.dp), onClick = ::unlock) {
            if (busy) Spinner(18.dp, androidx.compose.material3.LocalContentColor.current) else BtnIcon(Lucide.LockOpen, 18.dp)
            BtnText("Unlock", 16)
        }
        error?.let { Text(it, color = Tw.red500, fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp)) }
    }
}
