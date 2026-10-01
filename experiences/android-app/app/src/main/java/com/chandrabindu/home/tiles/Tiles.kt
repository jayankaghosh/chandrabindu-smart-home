package com.chandrabindu.home.tiles

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.chandrabindu.home.App
import com.chandrabindu.home.R
import com.chandrabindu.home.data.Block
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.Phase
import com.chandrabindu.home.ui.MainActivity
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Shared plumbing: while the shade is open, keep the repository live and redraw on change. */
abstract class HomeTileService : TileService() {
    protected val repo get() = App.repo
    private var collectJob: Job? = null
    private val tag = "tile:${javaClass.simpleName}"

    override fun onStartListening() {
        super.onStartListening()
        repo.acquire(tag)
        collectJob?.cancel()
        collectJob = repo.scope.launch {
            repo.state.collect { s -> qsTile?.let { render(it, s) } }
        }
        repo.scope.launch { repo.ensureFresh() }
    }

    override fun onStopListening() {
        collectJob?.cancel()
        collectJob = null
        repo.release(tag)
        super.onStopListening()
    }

    abstract fun render(tile: Tile, s: HomeState)

    protected fun Tile.apply(label: String, subtitle: String?, state: Int, icon: Int) {
        this.label = label
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) this.subtitle = subtitle
        this.state = state
        this.icon = Icon.createWithResource(this@HomeTileService, icon)
        updateTile()
    }

    /** Subtitle for states where no control is possible, or null when everything is fine. */
    protected fun awaySubtitle(s: HomeState): String? = when (s.phase) {
        Phase.UNREACHABLE, Phase.NOT_HUB -> "Away from home"
        Phase.NEEDS_LOGIN -> "Sign in"
        Phase.CHECKING -> if (s.rooms.isEmpty()) "Connecting…" else null
        Phase.READY -> when {
            s.appLocked -> "App locked"
            s.setupIncomplete -> "Setup incomplete"
            else -> null
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    protected fun openApp() {
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(
                PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}

/** "All off" tile: shows how many switches are on; asks before acting. */
class AllOffTileService : HomeTileService() {
    private var armedUntil = 0L

    override fun render(tile: Tile, s: HomeState) {
        val away = awaySubtitle(s)
        val n = s.onCount
        val subtitle = when {
            away != null -> away
            System.currentTimeMillis() < armedUntil -> "Tap again to confirm"
            s.isPending("master") -> "Turning off…"
            !s.statusKnown -> "Reading…"
            n == 0 -> "Everything off"
            else -> "$n on"
        }
        tile.apply(
            "All off", subtitle,
            if (away == null && n > 0) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE,
            R.drawable.ic_power,
        )
    }

    override fun onClick() {
        super.onClick()
        val s = repo.current
        when {
            s.phase == Phase.NEEDS_LOGIN -> return openApp()
            s.isAway || s.phase == Phase.CHECKING -> {
                repo.reconnect()
                return
            }
            s.appLocked || s.setupIncomplete -> return openApp()
        }
        if (isLocked) unlockAndRun { confirm() } else confirm()
    }

    private fun confirm() {
        try {
            val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
            val theme = if (night) android.R.style.Theme_DeviceDefault_Dialog_Alert
            else android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
            val n = repo.current.onCount
            val dialog = AlertDialog.Builder(this, theme)
                .setTitle("Turn everything off?")
                .setMessage(
                    (if (n > 0) "$n switch${if (n == 1) " is" else "es are"} on. " else "") +
                        "Protected switches stay on."
                )
                .setPositiveButton("All off") { _, _ -> repo.master(on = false) }
                .setNegativeButton("Cancel", null)
                .create()
            showDialog(dialog)
        } catch (_: Exception) {
            // No dialog possible here: fall back to a second tap within 3s.
            val now = System.currentTimeMillis()
            if (now < armedUntil) {
                armedUntil = 0
                repo.master(on = false)
            } else {
                armedUntil = now + 3_000
                repo.scope.launch {
                    delay(3_100)
                    qsTile?.let { render(it, repo.current) }
                }
            }
            qsTile?.let { render(it, repo.current) }
        }
    }
}

/** A favourite as a tile: tap toggles (or steps a fan), long-press opens the app. */
abstract class FavouriteTileService(private val slot: Int) : HomeTileService() {
    override fun render(tile: Tile, s: HomeState) {
        val away = awaySubtitle(s)
        val ref = s.tileRef(slot, repo.prefs)
        if (ref == null) {
            val label = if (s.phase == Phase.READY) "No favourite" else "Favourite ${slot + 1}"
            val sub = away ?: if (s.phase == Phase.READY) "Long-press a switch in the app" else null
            tile.apply(label, sub, Tile.STATE_INACTIVE, R.drawable.ic_star)
            return
        }
        val value = s.value(ref.device.id, ref.fn.code)
        val on = Controls.isOn(ref.fn, value)
        val block = s.block(ref)
        val subtitle = away ?: when (block) {
            Block.OFFLINE -> "${ref.room.name} · offline"
            Block.ROOM_LOCKED -> "${ref.room.name} · locked"
            Block.SUPER_PROTECTED -> "${ref.room.name} · always on"
            else -> if (ref.fn.type == "Boolean") ref.room.name
            else "${ref.room.name} · ${Controls.valueLabel(ref.fn, value)}"
        }
        val state = when {
            away != null -> Tile.STATE_INACTIVE
            block == Block.BLUETOOTH || block == Block.ADMIN_ONLY -> Tile.STATE_UNAVAILABLE
            on -> Tile.STATE_ACTIVE
            else -> Tile.STATE_INACTIVE
        }
        tile.apply(ref.fn.name, subtitle, state, Controls.iconRes(ref.fn))
    }

    override fun onClick() {
        super.onClick()
        val s = repo.current
        when {
            s.phase == Phase.NEEDS_LOGIN -> return openApp()
            s.isAway || s.phase == Phase.CHECKING -> {
                repo.reconnect()
                return
            }
        }
        val ref = s.tileRef(slot, repo.prefs) ?: return openApp()
        // Protected controls need the in-app confirm; anything blocked explains itself there.
        if (ref.fn.protected || s.block(ref) != Block.NONE) {
            if (s.block(ref) == Block.OFFLINE) return repo.reconnect()
            return openApp()
        }
        toggle(ref)
    }

    // Like Device Controls, a plain switch works straight from the lock screen.
    private fun toggle(ref: ControlRef) = repo.primaryAction(ref)
}

class Favourite1TileService : FavouriteTileService(0)
class Favourite2TileService : FavouriteTileService(1)
class Favourite3TileService : FavouriteTileService(2)
