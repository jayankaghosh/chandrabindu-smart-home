package com.chandrabindu.home.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.lazy.GridCells
import androidx.glance.appwidget.lazy.LazyVerticalGrid
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.glance.LocalSize
import androidx.glance.color.ColorProvider as DayNight
import com.chandrabindu.home.data.ControlRef
import com.chandrabindu.home.App
import com.chandrabindu.home.R
import com.chandrabindu.home.data.Block
import com.chandrabindu.home.data.Controls
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.Phase
import com.chandrabindu.home.ui.MainActivity
import kotlinx.coroutines.withTimeoutOrNull

/** Home-screen widget: "N on" plus favourites as one-tap toggles. */
class HomeWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = App.repo
        withTimeoutOrNull(8_000) { repo.ensureFresh(60_000) }
        provideContent {
            val s by repo.state.collectAsState()
            WidgetContent(s)
        }
    }

    companion object {
        suspend fun refreshAll(context: Context) = HomeWidget().updateAll(context)
    }
}

class HomeWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = HomeWidget()
}

private val KeyParam = ActionParameters.Key<String>("control")

// Fixed day/night palette (the system's dynamic widget colours only exist on Android 12+).
private val OnSurface = DayNight(day = Color(0xFF16161D), night = Color(0xFFEDEDF4))
private val OnSurfaceVariant = DayNight(day = Color(0xFF5E5E6E), night = Color(0xFFA5A5B5))

private fun tileBackground(ref: ControlRef, on: Boolean): Int {
    if (!on) return R.drawable.widget_tile_off
    return when (Controls.kind(ref.fn)) {
        Controls.Kind.LIGHT -> R.drawable.widget_tile_light
        Controls.Kind.FAN -> R.drawable.widget_tile_fan
        Controls.Kind.SOCKET, Controls.Kind.TV -> R.drawable.widget_tile_socket
        Controls.Kind.LOCK, Controls.Kind.BELL -> R.drawable.widget_tile_pink
        Controls.Kind.POWER -> R.drawable.widget_tile_power
    }
}

@Composable
private fun WidgetContent(s: HomeState) {
    val size = LocalSize.current
    val columns = if (size.width >= 250.dp) 2 else 1
    Column(
        modifier = GlanceModifier.fillMaxSize().background(ImageProvider(R.drawable.widget_bg)).padding(12.dp),
    ) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().clickable(actionStartActivity<MainActivity>()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = GlanceModifier.size(28.dp).background(ImageProvider(R.drawable.widget_badge)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    ImageProvider(R.drawable.ic_home), contentDescription = null,
                    modifier = GlanceModifier.size(17.dp), colorFilter = ColorFilter.tint(ColorProvider(Color.White)),
                )
            }
            Spacer(GlanceModifier.width(8.dp))
            Column(GlanceModifier.defaultWeight()) {
                Text(
                    s.houseName, maxLines = 1,
                    style = TextStyle(color = OnSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium),
                )
                Text(summary(s), maxLines = 1, style = TextStyle(color = OnSurfaceVariant, fontSize = 12.sp))
            }
        }
        Spacer(GlanceModifier.height(8.dp))

        when {
            s.isAway || s.phase == Phase.NEEDS_LOGIN -> Notice(s)
            else -> {
                val refs = s.favouriteRefs
                if (refs.isEmpty()) {
                    Text(
                        if (s.phase == Phase.READY) "Long-press any switch in the app to add a favourite."
                        else "Connecting…",
                        style = TextStyle(color = OnSurfaceVariant, fontSize = 12.sp),
                        modifier = GlanceModifier.clickable(actionStartActivity<MainActivity>()),
                    )
                } else {
                    LazyVerticalGrid(gridCells = GridCells.Fixed(columns), modifier = GlanceModifier.fillMaxSize()) {
                        items(refs, itemId = { it.id.hashCode().toLong() }) { ref -> FavouriteCell(s, ref) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FavouriteCell(s: HomeState, ref: ControlRef) {
    val value = s.value(ref.device.id, ref.fn.code)
    val on = Controls.isOn(ref.fn, value)
    val block = s.block(ref)
    // Protected / locked controls need the app (confirm, password); the rest toggle right here.
    val opensApp = ref.fn.protected || (block != Block.NONE && block != Block.OFFLINE)
    val click = if (opensApp) actionStartActivity<MainActivity>()
    else actionRunCallback<ToggleAction>(actionParametersOf(KeyParam to ref.id))
    Box(GlanceModifier.padding(vertical = 2.dp, horizontal = 2.dp)) {
        Row(
            modifier = GlanceModifier.fillMaxWidth().height(44.dp)
                .background(ImageProvider(tileBackground(ref, on)))
                .padding(horizontal = 10.dp)
                .clickable(click),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                ImageProvider(Controls.iconRes(ref.fn)), contentDescription = null,
                modifier = GlanceModifier.size(18.dp),
                colorFilter = ColorFilter.tint(if (on) ColorProvider(Color(Controls.tint(ref.fn))) else OnSurfaceVariant),
            )
            Spacer(GlanceModifier.width(8.dp))
            Column {
                Text(
                    ref.fn.name, maxLines = 1,
                    style = TextStyle(color = OnSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium),
                )
                // The room disambiguates the many controls simply called "Fan".
                val state = if (block == Block.OFFLINE) "Offline" else Controls.valueLabel(ref.fn, value)
                Text("$state · ${ref.room.name}", maxLines = 1, style = TextStyle(color = OnSurfaceVariant, fontSize = 11.sp))
            }
        }
    }
}

@Composable
private fun Notice(s: HomeState) {
    val away = s.isAway
    Column(
        modifier = GlanceModifier.fillMaxWidth().background(ImageProvider(R.drawable.widget_tile_off)).padding(10.dp)
            .clickable(if (away) actionRunCallback<RefreshAction>() else actionStartActivity<MainActivity>()),
    ) {
        Text(
            if (away) "Away from home" else "Sign in to Chandrabindu",
            style = TextStyle(color = OnSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium),
        )
        Text(
            if (away) "Works on your home Wi-Fi. Tap to try again." else "Tap to open the app.",
            style = TextStyle(color = OnSurfaceVariant, fontSize = 11.sp),
        )
    }
}

private fun summary(s: HomeState): String = when {
    s.isAway -> "Away from home"
    s.phase == Phase.NEEDS_LOGIN -> "Signed out"
    s.phase != Phase.READY && s.rooms.isEmpty() -> "Connecting…"
    s.appLocked -> "App locked"
    !s.statusKnown -> "Reading switches…"
    s.onCount == 0 -> "Everything is off"
    else -> "${s.onCount} on"
}

/** One tap on a favourite: toggle it (protected / blocked ones open the app instead). */
class ToggleAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val key = parameters[KeyParam] ?: return
        val repo = App.repo
        withTimeoutOrNull(6_000) { repo.ensureFresh(60_000) }
        val s = repo.current
        val ref = s.findRef(key)
        if (s.phase == Phase.READY && ref != null) {
            if (!ref.fn.protected && s.block(ref) == Block.NONE) {
                repo.ensureDeviceStatus(ref.device.id)
                repo.primaryValue(ref)?.let { repo.setValueNow(ref, it) }
            }
        }
        HomeWidget().updateAll(context)
    }
}

/** Away: tap to check again. */
class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        withTimeoutOrNull(8_000) { App.repo.checkAndLoad() }
        HomeWidget().updateAll(context)
    }
}
