package com.chandrabindu.home.ui.sleek

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.SleekApi
import com.chandrabindu.home.data.UsageRoom
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private val RANGES = listOf(
    Triple("1h", "1 hour", 3_600_000L),
    Triple("3h", "3 hours", 3 * 3_600_000L),
    Triple("12h", "12 hours", 12 * 3_600_000L),
    Triple("1d", "1 day", 24 * 3_600_000L),
    Triple("3d", "3 days", 3 * 24 * 3_600_000L),
    Triple("7d", "7 days", 7 * 24 * 3_600_000L),
)

fun fmtDur(ms: Long): String {
    val s = Math.round(ms / 1000.0)
    val h = s / 3600
    val m = (s % 3600) / 60
    return when {
        h > 0 -> "${h}h ${m}m"
        m > 0 -> "${m}m"
        else -> "${s}s"
    }
}

/** Per-switch on/off time and toggle counts (SleekUsage.tsx). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SleekUsage(api: SleekApi) {
    val sk = LocalSleek.current
    val context = LocalContext.current
    var range by rememberSaveable { mutableStateOf("1d") }
    var customFrom by rememberSaveable { mutableStateOf<Long?>(null) }
    var customTo by rememberSaveable { mutableStateOf<Long?>(null) }
    var rooms by remember { mutableStateOf<List<UsageRoom>?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    fun load() {
        val (from, to) = if (range == "custom") {
            val f = customFrom ?: run { error = "Pick a start date"; return }
            f to (customTo ?: System.currentTimeMillis())
        } else {
            val to = System.currentTimeMillis()
            (to - (RANGES.firstOrNull { it.first == range }?.third ?: 86_400_000L)) to to
        }
        loading = true
        error = null
        scope.launch {
            try {
                rooms = api.usage(from, to)
            } catch (e: Exception) {
                error = e.message ?: "Failed"
            } finally {
                loading = false
            }
        }
    }
    LaunchedEffect(range, reloadKey) { if (range != "custom") load() }

    fun pick(initial: Long?, set: (Long) -> Unit) {
        val c = Calendar.getInstance().apply { timeInMillis = initial ?: System.currentTimeMillis() }
        DatePickerDialog(context, { _, y, mo, d ->
            TimePickerDialog(context, { _, h, mi ->
                c.set(y, mo, d, h, mi, 0)
                set(c.timeInMillis)
            }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((key, label, _) in RANGES) RangeChip(label, range == key) { range = key }
            RangeChip("Custom", range == "custom") { range = "custom" }
        }
        if (range == "custom") {
            val fmt = remember { SimpleDateFormat("d MMM, HH:mm", Locale.getDefault()) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("From", fontSize = 12.sp, color = sk.muted, modifier = Modifier.padding(bottom = 4.dp))
                    BtnGhost(Modifier.fillMaxWidth(), onClick = { pick(customFrom) { customFrom = it } }) {
                        BtnText(customFrom?.let { fmt.format(Date(it)) } ?: "Pick…")
                    }
                }
                Column(Modifier.weight(1f)) {
                    Text("To", fontSize = 12.sp, color = sk.muted, modifier = Modifier.padding(bottom = 4.dp))
                    BtnGhost(Modifier.fillMaxWidth(), onClick = { pick(customTo) { customTo = it } }) {
                        BtnText(customTo?.let { fmt.format(Date(it)) } ?: "Now")
                    }
                }
                BtnPrimary(onClick = { load() }) { BtnText("Apply") }
            }
        }
        error?.let { Text(it, color = Tw.red500, fontSize = 14.sp) }
        val list = rooms
        when {
            loading -> Loading()
            !list.isNullOrEmpty() -> Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                for (room in list) {
                    Column {
                        Text(
                            room.name.uppercase(), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp,
                            color = sk.faint, modifier = Modifier.padding(start = 4.dp, bottom = 8.dp),
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            for (d in room.devices) for (c in d.controls) {
                                Row(
                                    Modifier.fillMaxWidth()
                                        .glass(sk, Rounded2xl, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.5f))
                                        .padding(horizontal = 16.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Row {
                                            Text(
                                                "${d.name} · ${c.name}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = sk.title,
                                                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                                            )
                                            if (c.protected) Text(" [P]", fontSize = 12.sp, color = Tw.amber500)
                                        }
                                        Text(
                                            if (c.hasData) "${c.toggles} toggle${if (c.toggles == 1) "" else "s"}" else "no activity recorded",
                                            fontSize = 12.sp, color = sk.muted,
                                        )
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                            val g = if (sk.dark) Tw.emerald400 else Tw.emerald600
                                            SIcon(Lucide.Power, 13.dp, g)
                                            Text(fmtDur(c.onMs), fontSize = 14.sp, fontWeight = FontWeight.Medium, color = g)
                                        }
                                        Text("off ${fmtDur(c.offMs)}", fontSize = 14.sp, color = sk.faint)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            else -> Text(
                "No usage data for this range yet. History records going forward once the gateway is running.",
                fontSize = 14.sp, color = sk.muted, textAlign = TextAlign.Center, lineHeight = 20.sp,
                modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
            )
        }
    }
}

@Composable
private fun RangeChip(label: String, active: Boolean, onClick: () -> Unit) {
    val sk = LocalSleek.current
    Text(
        label, fontSize = 14.sp, fontWeight = FontWeight.Medium,
        color = when {
            active -> if (sk.dark) Tw.slate900 else Color.White
            sk.dark -> Tw.slate300
            else -> Tw.slate600
        },
        modifier = Modifier.pressable(onClick = onClick)
            .then(
                if (active) Modifier.clip(CircleShape).background(if (sk.dark) Color.White else Tw.slate900)
                else Modifier.glass(sk, CircleShape, if (sk.dark) sk.glassBg else Color.White.copy(alpha = 0.5f))
            )
            .padding(horizontal = 14.dp, vertical = 6.dp),
    )
}
