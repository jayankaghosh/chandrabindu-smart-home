package com.chandrabindu.home.ui

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chandrabindu.home.App
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.data.Phase

class MainActivity : ComponentActivity() {
    private val repo get() = App.repo

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            ChandrabinduTheme {
                AppRoot(repo, openFullApp = { startActivity(Intent(this, WebAppActivity::class.java)) })
            }
        }
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
fun AppRoot(repo: HomeRepository, openFullApp: () -> Unit) {
    val s by repo.state.collectAsStateWithLifecycle()
    var showSettings by rememberSaveable { mutableStateOf(false) }

    BackHandler(enabled = showSettings) { showSettings = false }

    // A Surface (not a plain background) so text picks up the theme's content colour in dark mode.
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
    Box(Modifier.fillMaxSize()) {
        when {
            showSettings -> SettingsScreen(repo, s, onBack = { showSettings = false }, openFullApp = openFullApp)
            // Keep the home panel up while a background re-check runs.
            s.phase == Phase.READY || (s.phase == Phase.CHECKING && s.session != null && s.rooms.isNotEmpty()) ->
                HomeScreen(repo, s, openSettings = { showSettings = true }, openFullApp = openFullApp)
            s.phase == Phase.UNREACHABLE || s.phase == Phase.NOT_HUB ->
                UnreachableScreen(repo, s, changeAddress = { showSettings = true })
            s.phase == Phase.NEEDS_LOGIN -> LoginScreen(repo, s, changeAddress = { showSettings = true })
            else -> CheckingScreen(s)
        }

        AnimatedVisibility(
            visible = s.toast != null,
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 20.dp),
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
        ) {
            ToastPill(s.toast, onClick = repo::dismissToast)
        }
    }
    }
}
