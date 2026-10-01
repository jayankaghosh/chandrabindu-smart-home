package com.chandrabindu.home.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.BuildConfig
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.HubClient
import com.chandrabindu.home.data.Phase
import com.chandrabindu.home.data.Toast
import kotlinx.coroutines.launch

@Composable
fun CheckingScreen(s: HomeState) {
    Column(
        Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = Brand, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
        Spacer(Modifier.height(16.dp))
        Text("Connecting to your home…", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Text(
            hostOf(s.serverAddress), fontFamily = FontFamily.Monospace, fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        )
    }
}

fun hostOf(address: String) = address.removePrefix("http://").removePrefix("https://")

/**
 * Shown whenever the hub can't be reached. It only lives on the home LAN, so
 * this is normal when away, and it should read that way (not as an error).
 */
@Composable
fun UnreachableScreen(repo: HomeRepository, s: HomeState, changeAddress: () -> Unit) {
    val notHub = s.phase == Phase.NOT_HUB
    val scope = rememberCoroutineScope()
    var retrying by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(88.dp).clip(CircleShape).background(Orange.copy(alpha = 0.13f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (notHub) Icons.AutoMirrored.Outlined.HelpOutline else Icons.Filled.WifiOff,
                contentDescription = null, tint = Orange, modifier = Modifier.size(38.dp),
            )
        }
        Spacer(Modifier.height(22.dp))
        Text(
            if (notHub) "That isn't your home hub" else "Can't reach your home",
            fontSize = 22.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            if (notHub) "Something answered at ${hostOf(s.serverAddress)}, but it isn't Chandrabindu. You may be on a different network."
            else "Chandrabindu runs on your home network, so it only works when this phone is on your home Wi-Fi.",
            fontSize = 15.sp, lineHeight = 21.sp, textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(28.dp))
        Button(
            onClick = {
                retrying = true
                scope.launch {
                    repo.checkAndLoad()
                    retrying = false
                }
            },
            enabled = !retrying,
            colors = ButtonDefaults.buttonColors(containerColor = Brand),
            modifier = Modifier.widthIn(min = 200.dp).height(48.dp),
        ) {
            if (retrying) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                Spacer(Modifier.size(10.dp))
            }
            Text("Try again", fontSize = 16.sp)
        }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(onClick = changeAddress, modifier = Modifier.widthIn(min = 200.dp).height(48.dp)) {
            Text("Change address", fontSize = 16.sp)
        }
        Spacer(Modifier.height(28.dp))
        Text(
            "Looking for ${hostOf(s.serverAddress)}", fontFamily = FontFamily.Monospace, fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            "We'll reconnect by ourselves when your network changes.", fontSize = 12.sp, lineHeight = 16.sp, textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
        )
    }
}

@Composable
fun BrandTile(size: Int, iconSize: Int) {
    Box(
        Modifier.size(size.dp).clip(RoundedCornerShape((size * 0.27f).dp))
            .background(Brush.linearGradient(listOf(Color(0xFF7B76FF), Color(0xFF4F49D6)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(iconSize.dp))
    }
}

@Composable
fun LoginScreen(repo: HomeRepository, s: HomeState, changeAddress: () -> Unit) {
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val passwordFocus = remember { FocusRequester() }

    fun submit() {
        val u = username.trim()
        if (u.isEmpty() || password.isEmpty() || s.signingIn) return
        val p = password
        scope.launch {
            repo.signIn(u, p)
            if (repo.current.session != null) password = ""
        }
    }

    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()
            .verticalScroll(rememberScrollState()).padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(72.dp))
        BrandTile(68, 34)
        Spacer(Modifier.height(18.dp))
        Text("Sign in to Chandrabindu", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(6.dp))
        Text("Use the same account as the web app.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(28.dp))
        OutlinedTextField(
            value = username, onValueChange = { username = it }, label = { Text("Username") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onNext = { passwordFocus.requestFocus() }),
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text("Password") },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().focusRequester(passwordFocus),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { submit() }),
        )
        s.loginError?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(18.dp))
        Button(
            onClick = ::submit,
            enabled = username.isNotBlank() && password.isNotEmpty() && !s.signingIn,
            colors = ButtonDefaults.buttonColors(containerColor = Brand),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (s.signingIn) {
                CircularProgressIndicator(Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                Spacer(Modifier.size(10.dp))
            }
            Text("Sign in", fontSize = 16.sp)
        }
        Spacer(Modifier.height(28.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                hostOf(s.serverAddress), fontFamily = FontFamily.Monospace, fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = changeAddress) { Text("Change") }
        }
    }
}

@Composable
fun SettingsScreen(repo: HomeRepository, s: HomeState, onBack: () -> Unit, openFullApp: () -> Unit) {
    var address by rememberSaveable { mutableStateOf(s.serverAddress) }
    // Bump to re-read tile bindings after a change.
    var tileVersion by remember { mutableIntStateOf(0) }

    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
            Text("Settings", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            SettingsCard("Home hub") {
                OutlinedTextField(
                    value = address, onValueChange = { address = it }, singleLine = true,
                    label = { Text("Address") }, placeholder = { Text("http://192.168.68.68") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done, autoCorrectEnabled = false),
                    keyboardActions = KeyboardActions(onDone = { if (address.isNotBlank()) { repo.changeServer(address); onBack() } }),
                )
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Your hub is only reachable on your home network.", fontSize = 13.sp, lineHeight = 18.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = { repo.changeServer(address); onBack() },
                        enabled = address.isNotBlank() &&
                            !(HubClient.normalize(address) == s.serverAddress && s.phase == Phase.READY),
                        colors = ButtonDefaults.buttonColors(containerColor = Brand),
                    ) { Text("Connect") }
                }
            }

            if (s.session != null) {
                SettingsCard("Quick Settings tiles") {
                    Text(
                        "Choose the controls for the three favourite tiles. Automatic uses your first three favourites.",
                        fontSize = 13.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(6.dp))
                    for (slot in 0..2) {
                        key(tileVersion) {
                            TileSlotPicker(repo, s, slot) { tileVersion++ }
                        }
                    }
                }

                SettingsCard("Account") {
                    Text(
                        "Signed in as ${s.session.username}${if (s.isAdmin) " (admin)" else ""}",
                        fontSize = 15.sp,
                    )
                    Spacer(Modifier.height(10.dp))
                    Row {
                        OutlinedButton(onClick = openFullApp) { Text("Open the full app") }
                        Spacer(Modifier.size(10.dp))
                        TextButton(onClick = { repo.signOut(); onBack() }) {
                            Text("Sign out", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }

            SettingsCard("Control without opening the app") {
                Help("Device controls", "Android 11+: open Quick Settings (or hold power), tap Device controls, choose Chandrabindu and pick your switches. Turn on \"Control from locked device\" in Android settings to use them from the lock screen.")
                Help("Quick Settings tiles", "Pull down the shade twice, tap the pencil and drag in \"All off\" and the three favourite tiles.")
                Help("Home-screen widget", "Long-press the home screen, Widgets, Chandrabindu.")
            }

            Text(
                "Chandrabindu ${BuildConfig.VERSION_NAME}", fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.padding(vertical = 16.dp).fillMaxWidth(), textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun TileSlotPicker(repo: HomeRepository, s: HomeState, slot: Int, changed: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val bound = repo.prefs.tileBinding(slot)?.let { s.findRef(it) }
    val effective = s.tileRef(slot, repo.prefs)
    val label = when {
        bound != null -> "${bound.fn.name} · ${bound.room.name}"
        effective != null -> "Automatic (${effective.fn.name} · ${effective.room.name})"
        else -> "Automatic (no favourite yet)"
    }
    Box {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { open = true }.padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Tile ${slot + 1}", fontWeight = FontWeight.Medium, modifier = Modifier.widthIn(min = 56.dp))
            Text(label, color = Brand, fontSize = 14.sp, maxLines = 1, modifier = Modifier.weight(1f))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("Automatic") }, onClick = {
                repo.prefs.setTileBinding(slot, null); open = false; changed()
            })
            val options = s.favouriteRefs.ifEmpty { s.allControls.take(30) }
            for (ref in options) {
                DropdownMenuItem(text = { Text("${ref.fn.name} · ${ref.room.name}") }, onClick = {
                    repo.prefs.setTileBinding(slot, ref.id); open = false; changed()
                })
            }
        }
    }
}

@Composable
private fun Help(title: String, text: String) {
    Column(Modifier.padding(vertical = 6.dp)) {
        Text(title, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        Text(text, fontSize = 13.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable () -> Unit) {
    Text(
        title.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 4.dp, top = 14.dp, bottom = 6.dp),
    )
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) { content() }
    }
}

@Composable
fun ToastPill(toast: Toast?, onClick: () -> Unit) {
    var last by remember { mutableStateOf(toast) }
    LaunchedEffect(toast) { if (toast != null) last = toast }
    val t = toast ?: last ?: return
    Surface(
        shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shadowElevation = 6.dp, tonalElevation = 2.dp,
        modifier = Modifier.padding(horizontal = 20.dp).clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                if (t.isError) Icons.Filled.Warning else Icons.Filled.CheckCircle, contentDescription = null,
                tint = if (t.isError) Orange else Green, modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.size(8.dp))
            Text(t.text, fontSize = 14.sp, maxLines = 2)
        }
    }
}
