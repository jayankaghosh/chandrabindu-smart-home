package com.chandrabindu.home

import android.app.Application
import android.content.ComponentName
import android.net.ConnectivityManager
import android.net.Network
import android.service.quicksettings.TileService
import com.chandrabindu.home.data.HomeRepository
import com.chandrabindu.home.tiles.AllOffTileService
import com.chandrabindu.home.tiles.Favourite1TileService
import com.chandrabindu.home.tiles.Favourite2TileService
import com.chandrabindu.home.tiles.Favourite3TileService
import com.chandrabindu.home.widget.HomeWidget
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class App : Application() {
    lateinit var repo: HomeRepository
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        repo = HomeRepository(this)

        // Reconnect by ourselves the moment the phone joins a network (back home).
        getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    repo.scope.launch { repo.onNetworkAvailable() }
                }
            }
        )

        watchForGlanceableChanges()
    }

    /** Push state changes to the widget and the Quick Settings tiles while we're running. */
    @OptIn(FlowPreview::class)
    private fun watchForGlanceableChanges() {
        repo.scope.launch {
            repo.state
                .map { s ->
                    // Only what the widget / tiles show.
                    listOf(s.phase, s.onCount, s.favouriteRefs.map { s.value(it.device.id, it.fn.code) to it.id }, s.houseName, s.offline)
                }
                .distinctUntilChanged()
                .drop(1)
                .debounce(400)
                .collect {
                    runCatching { HomeWidget.refreshAll(this@App) }
                    for (cls in listOf(
                        AllOffTileService::class.java, Favourite1TileService::class.java,
                        Favourite2TileService::class.java, Favourite3TileService::class.java,
                    )) {
                        runCatching { TileService.requestListeningState(this@App, ComponentName(this@App, cls)) }
                    }
                }
        }
    }

    companion object {
        lateinit var instance: App
            private set
        val repo: HomeRepository get() = instance.repo
    }
}
