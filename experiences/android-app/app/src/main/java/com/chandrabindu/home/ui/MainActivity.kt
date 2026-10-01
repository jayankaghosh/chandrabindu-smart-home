package com.chandrabindu.home.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chandrabindu.home.App
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.Phase
import com.chandrabindu.home.data.SleekApi
import com.chandrabindu.home.ui.sleek.DarkSleek
import com.chandrabindu.home.ui.sleek.IconBtn
import com.chandrabindu.home.ui.sleek.LightSleek
import com.chandrabindu.home.ui.sleek.LocalSleek
import com.chandrabindu.home.ui.sleek.Lucide
import com.chandrabindu.home.ui.sleek.SleekApp
import com.chandrabindu.home.ui.sleek.SleekBackdrop
import com.chandrabindu.home.ui.sleek.SleekChecking
import com.chandrabindu.home.ui.sleek.SleekLogin
import com.chandrabindu.home.ui.sleek.SleekSettings
import com.chandrabindu.home.ui.sleek.SleekUnreachable
import com.chandrabindu.home.ui.sleek.ThemeStore

class MainActivity : ComponentActivity() {
    private val repo get() = App.repo

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // Let the backdrop run under the 3-button navigation bar, like the status bar.
        if (android.os.Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        val theme = ThemeStore(this)
        val api = SleekApi(repo)
        setContent { AppRoot(repo, api, theme) }
    }

    override fun onStart() {
        super.onStart()
        repo.acquire(TAG)
    }

    override fun onStop() {
        repo.release(TAG)
        super.onStop()
    }

    private companion object {
        const val TAG = "app"
    }
}

@Composable
fun AppRoot(repo: HomeRepository, api: SleekApi, theme: ThemeStore) {
    val s by repo.state.collectAsStateWithLifecycle()
    val dark = theme.isDark(isSystemInDarkTheme())
    val sk = if (dark) DarkSleek else LightSleek
    val context = LocalContext.current
    val view = LocalView.current
    var standaloneSettings by rememberSaveable { mutableStateOf(false) }
    val toggleTheme = { theme.set(if (dark) "light" else "dark") }

    // Status/navigation bar icons follow the app theme (which may differ from the system's).
    SideEffect {
        val window = (view.context as? android.app.Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    ChandrabinduTheme(dark) {
        CompositionLocalProvider(LocalSleek provides sk, LocalContentColor provides sk.text) {
            Box(Modifier.fillMaxSize()) {
                // Re-fetch the hub's artwork once it's reachable (it may have changed).
                SleekBackdrop(s.serverAddress, dark, context, refreshKey = if (s.phase == Phase.READY) s.serverAddress else null)
                val signedIn = s.phase == Phase.READY || (s.phase == Phase.CHECKING && s.session != null && s.rooms.isNotEmpty())
                when {
                    standaloneSettings -> StandaloneSettings(repo, s, theme, toggleTheme, dark) { standaloneSettings = false }
                    signedIn -> SleekApp(repo, api, s, theme, toggleTheme)
                    s.phase == Phase.UNREACHABLE || s.phase == Phase.NOT_HUB ->
                        SleekUnreachable(repo, s) { standaloneSettings = true }
                    s.phase == Phase.NEEDS_LOGIN -> SleekLogin(repo, s) { standaloneSettings = true }
                    else -> SleekChecking(s)
                }
            }
        }
    }
}

/** Settings reached before signing in (Change address on the away / sign-in screens). */
@Composable
private fun StandaloneSettings(
    repo: HomeRepository,
    s: com.chandrabindu.home.data.HomeState,
    theme: ThemeStore,
    toggleTheme: () -> Unit,
    dark: Boolean,
    close: () -> Unit,
) {
    val sk = LocalSleek.current
    BackHandler(onBack = close)
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.statusBarsPadding().fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconBtn(Lucide.ChevronLeft, "Back", big = true, iconSize = 26.dp, onClick = close)
            Spacer(Modifier.width(12.dp))
            Text("Settings", fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = sk.title, modifier = Modifier.weight(1f))
            IconBtn(if (dark) Lucide.Sun else Lucide.Moon, "Toggle theme", big = true, iconSize = 16.dp, onClick = toggleTheme)
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 16.dp),
        ) {
            SleekSettings(repo, s, theme, onSaved = close)
        }
    }
}
