package com.chandrabindu.home.ui.sleek

import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.BuildConfig
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.HubClient
import com.chandrabindu.home.data.Phase
import com.chandrabindu.home.ui.WebAppActivity
import kotlinx.coroutines.launch

fun hostOf(address: String) = address.removePrefix("http://").removePrefix("https://")

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    val sk = LocalSleek.current
    Text(
        title.uppercase(), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp, color = sk.faint,
        modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 10.dp),
    )
    Column(Modifier.fillMaxWidth().glass(sk).padding(20.dp), content = content)
}

/** The app's own settings (server, appearance, Quick Settings tiles, account). */
@Composable
fun SleekSettings(repo: HomeRepository, s: HomeState, theme: ThemeStore, onSaved: () -> Unit) {
    val sk = LocalSleek.current
    val context = LocalContext.current
    var address by rememberSaveable { mutableStateOf(s.serverAddress) }
    var tileVersion by remember { mutableIntStateOf(0) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SettingsSection("Home hub") {
            GlassField(
                address, { address = it }, "http://192.168.68.68", Modifier.fillMaxWidth(),
                keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done,
                onDone = { if (address.isNotBlank()) { repo.changeServer(address); onSaved() } },
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Your hub is only reachable on your home network.", fontSize = 13.sp, lineHeight = 18.sp, color = sk.muted, modifier = Modifier.weight(1f))
                Spacer(Modifier.width(12.dp))
                BtnPrimary(
                    enabled = address.isNotBlank() && !(HubClient.normalize(address) == s.serverAddress && s.phase == Phase.READY),
                    onClick = { repo.changeServer(address); onSaved() },
                ) { BtnText("Connect") }
            }
        }

        SettingsSection("Appearance") {
            Row(
                Modifier.fillMaxWidth().clip(Rounded2xl).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.slate100).padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                for ((key, label) in listOf("system" to "System", "light" to "Light", "dark" to "Dark")) {
                    val active = theme.mode == key
                    Box(
                        Modifier.weight(1f).height(40.dp).pressable { theme.set(key) }.clip(RoundedXl)
                            .then(
                                if (active) Modifier.background(
                                    if (sk.dark) Brush.linearGradient(listOf(Color.White, Color.White))
                                    else Brush.horizontalGradient(listOf(Tw.brand500, Tw.brand400)),
                                ) else Modifier,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                            color = when {
                                active -> if (sk.dark) Tw.slate900 else Color.White
                                sk.dark -> Tw.slate300
                                else -> Tw.slate500
                            },
                        )
                    }
                }
            }
        }

        if (s.session != null) {
            SettingsSection("Quick Settings tiles") {
                Text(
                    "Choose the controls for the three favourite tiles. Automatic uses your first three favourites.",
                    fontSize = 13.sp, lineHeight = 18.sp, color = sk.muted, modifier = Modifier.padding(bottom = 6.dp),
                )
                for (slot in 0..2) key(tileVersion) { TileSlotPicker(repo, s, slot) { tileVersion++ } }
            }

            SettingsSection("Account") {
                Text(
                    "Signed in as ${s.session.username}${if (s.isAdmin) " (admin)" else ""}", fontSize = 15.sp,
                    fontWeight = FontWeight.Medium, color = sk.title,
                )
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BtnGhost(onClick = { context.startActivity(Intent(context, WebAppActivity::class.java)) }) {
                        BtnIcon(Lucide.Globe)
                        BtnText("Open the web app")
                    }
                    BtnGhost(onClick = { repo.signOut() }) {
                        BtnIcon(Lucide.LogOut)
                        Text("Sign out", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Tw.red500)
                    }
                }
                Text(
                    "Building routines, automations and groups, and the hub's own settings, live in the web app.",
                    fontSize = 13.sp, lineHeight = 18.sp, color = sk.muted, modifier = Modifier.padding(top = 12.dp),
                )
            }
        }

        SettingsSection("Control without opening the app") {
            Help("Device controls", "Android 11+: open Quick Settings (or hold power), tap Device controls, choose Chandrabindu and pick your switches. Turn on \"Control from locked device\" in Android settings to use them from the lock screen.")
            Help("Quick Settings tiles", "Pull down the shade twice, tap the pencil and drag in \"All off\" and the three favourite tiles.")
            Help("Home-screen widget", "Long-press the home screen, Widgets, Chandrabindu.")
        }
        Text(
            "Chandrabindu ${BuildConfig.VERSION_NAME}", fontSize = 12.sp, color = sk.faint, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        )
    }
}

@Composable
private fun Help(title: String, text: String) {
    val sk = LocalSleek.current
    Column(Modifier.padding(vertical = 6.dp)) {
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = sk.title)
        Text(text, fontSize = 13.sp, lineHeight = 18.sp, color = sk.muted)
    }
}

@Composable
private fun TileSlotPicker(repo: HomeRepository, s: HomeState, slot: Int, changed: () -> Unit) {
    val sk = LocalSleek.current
    var open by remember { mutableStateOf(false) }
    val bound = repo.prefs.tileBinding(slot)?.let { s.findRef(it) }
    val effective = s.tileRef(slot, repo.prefs)
    val label = when {
        bound != null -> "${bound.fn.name} · ${bound.room.name}"
        effective != null -> "Automatic (${effective.fn.name} · ${effective.room.name})"
        else -> "Automatic (no favourite yet)"
    }
    Box {
        Row(Modifier.fillMaxWidth().pressable { open = true }.padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Tile ${slot + 1}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = sk.title, modifier = Modifier.widthIn(min = 56.dp))
            Text(label, color = if (sk.dark) Tw.slate200 else Tw.brand600, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            SIcon(Lucide.ChevronRight, 16.dp, sk.faint)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("Automatic") }, onClick = { repo.prefs.setTileBinding(slot, null); open = false; changed() })
            for (ref in s.favouriteRefs.ifEmpty { s.allControls.take(30) }) {
                DropdownMenuItem(text = { Text("${ref.fn.name} · ${ref.room.name}") }, onClick = {
                    repo.prefs.setTileBinding(slot, ref.id); open = false; changed()
                })
            }
        }
    }
}

// region Before the home screen: connecting, away, sign in

@Composable
private fun AuthScaffold(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
        content = content,
    )
}

@Composable
fun SleekLogo(size: Int, base: String) {
    val context = LocalContext.current
    val logo = rememberLogo(base, context)
    if (logo != null) {
        Image(
            logo, contentDescription = "Logo", contentScale = ContentScale.Crop,
            modifier = Modifier.size(size.dp).shadow(6.dp, Rounded2xl).clip(Rounded2xl),
        )
    } else {
        Box(
            Modifier.size(size.dp).shadow(6.dp, Rounded2xl).clip(Rounded2xl).background(Brush.linearGradient(listOf(Tw.brand500, Tw.brand400))),
            contentAlignment = Alignment.Center,
        ) { SIcon(Lucide.House, (size / 2).dp, Color.White) }
    }
}

@Composable
fun SleekChecking(s: HomeState) {
    val sk = LocalSleek.current
    AuthScaffold {
        Spinner(26.dp, sk.muted)
        Spacer(Modifier.height(16.dp))
        Text("Connecting to your home…", color = sk.muted, fontSize = 15.sp)
        Text(hostOf(s.serverAddress), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = sk.faint, modifier = Modifier.padding(top = 4.dp))
    }
}

/** Shown when the hub can't be reached. Normal when away, so it must not read as an error. */
@Composable
fun SleekUnreachable(repo: HomeRepository, s: HomeState, changeAddress: () -> Unit) {
    val sk = LocalSleek.current
    val notHub = s.phase == Phase.NOT_HUB
    val scope = rememberCoroutineScope()
    var retrying by remember { mutableStateOf(false) }
    AuthScaffold {
        Column(Modifier.widthIn(max = 448.dp).fillMaxWidth().glass(sk).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(72.dp).clip(androidx.compose.foundation.shape.CircleShape).background(Tw.amber500.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                SIcon(if (notHub) Lucide.Info else Lucide.WifiOff, 32.dp, Tw.amber500)
            }
            Spacer(Modifier.height(18.dp))
            Text(
                if (notHub) "That isn't your home hub" else "Can't reach your home",
                fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = sk.title, textAlign = TextAlign.Center, letterSpacing = (-0.4).sp,
            )
            Text(
                if (notHub) "Something answered at ${hostOf(s.serverAddress)}, but it isn't Chandrabindu. You may be on a different network."
                else "Chandrabindu runs on your home network, so it only works when this phone is on your home Wi-Fi.",
                fontSize = 15.sp, lineHeight = 21.sp, textAlign = TextAlign.Center, color = if (sk.dark) Tw.slate300 else Tw.slate600,
                modifier = Modifier.padding(top = 8.dp, bottom = 24.dp),
            )
            BtnPrimary(
                Modifier.fillMaxWidth(), enabled = !retrying, padding = PaddingValues(vertical = 14.dp),
                onClick = {
                    retrying = true
                    scope.launch { repo.checkAndLoad(); retrying = false }
                },
            ) {
                if (retrying) Spinner(18.dp, LocalContentColor.current) else BtnIcon(Lucide.RefreshCw, 18.dp)
                BtnText("Try again", 16)
            }
            Spacer(Modifier.height(10.dp))
            BtnGhost(Modifier.fillMaxWidth(), onClick = changeAddress) { BtnIcon(Lucide.Settings, 16.dp); BtnText("Change address", 16) }
            Spacer(Modifier.height(20.dp))
            Text("Looking for ${hostOf(s.serverAddress)}", fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = sk.faint)
            Text("We'll reconnect by ourselves when your network changes.", fontSize = 12.sp, lineHeight = 16.sp, color = sk.faint, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
fun SleekLogin(repo: HomeRepository, s: HomeState, changeAddress: () -> Unit) {
    val sk = LocalSleek.current
    var username by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    fun submit() {
        val u = username.trim()
        if (u.isEmpty() || password.isEmpty() || s.signingIn) return
        val p = password
        scope.launch {
            repo.signIn(u, p)
            if (repo.current.session != null) password = ""
        }
    }
    AuthScaffold {
        Column(Modifier.widthIn(max = 448.dp).fillMaxWidth().glass(sk).padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            SleekLogo(64, s.serverAddress)
            Spacer(Modifier.height(18.dp))
            Text("Sign in to Chandrabindu", fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = sk.title, letterSpacing = (-0.4).sp)
            Text("Use the same account as the web app.", fontSize = 14.sp, color = sk.muted, modifier = Modifier.padding(top = 4.dp, bottom = 24.dp))
            GlassField(username, { username = it }, "Username", Modifier.fillMaxWidth(), keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next)
            Spacer(Modifier.height(10.dp))
            GlassField(password, { password = it }, "Password", Modifier.fillMaxWidth(), password = true, imeAction = ImeAction.Go, onDone = ::submit)
            s.loginError?.let { Text(it, color = Tw.red500, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) }
            Spacer(Modifier.height(18.dp))
            BtnPrimary(
                Modifier.fillMaxWidth(), enabled = username.isNotBlank() && password.isNotEmpty() && !s.signingIn,
                padding = PaddingValues(vertical = 14.dp), onClick = ::submit,
            ) {
                if (s.signingIn) Spinner(18.dp, LocalContentColor.current)
                BtnText("Sign in", 16)
            }
            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(hostOf(s.serverAddress), fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = sk.faint)
                Text(
                    "  Change", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (sk.dark) Tw.slate200 else Tw.brand600,
                    modifier = Modifier.pressable(onClick = changeAddress).padding(4.dp),
                )
            }
        }
    }
}

// endregion
