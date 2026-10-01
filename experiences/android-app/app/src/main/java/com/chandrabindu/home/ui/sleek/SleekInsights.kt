package com.chandrabindu.home.ui.sleek

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chandrabindu.home.data.HomeState
import com.chandrabindu.home.data.InsightMeta
import com.chandrabindu.home.data.InsightReport
import com.chandrabindu.home.data.InsightResult
import com.chandrabindu.home.data.InsightsIndex
import com.chandrabindu.home.data.RecommendedRoutine
import com.chandrabindu.home.data.SleekApi
import com.chandrabindu.home.ui.WebAppActivity
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale

private val DAY_OPTIONS = listOf(1, 2, 3, 7, 14, 30, 60, 90)

private fun fmtDate(d: String): String = try {
    val p = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(d)
    SimpleDateFormat("MMM d", Locale.getDefault()).format(p!!)
} catch (_: Exception) {
    d
}

private data class Chip(val icon: ImageVector, val fg: Color, val bg: Color)

private fun sectionChip(icon: String, dark: Boolean): Chip {
    fun c(i: ImageVector, light: Color) = Chip(i, if (dark) Tw.slate200 else light, if (dark) Color.White.copy(alpha = 0.1f) else light.copy(alpha = 0.15f))
    return when (icon) {
        "activity" -> c(Lucide.Activity, Tw.indigo600)
        "device" -> c(Lucide.ToggleRight, Tw.sky600)
        "room" -> c(Lucide.House, Tw.violet600)
        "clock" -> c(Lucide.Clock, Tw.amber600)
        "trend" -> c(Lucide.TrendingUp, Tw.cyan600)
        "forecast" -> c(Lucide.Telescope, Tw.blue600)
        "good" -> c(Lucide.ThumbsUp, Tw.emerald600)
        "bad" -> c(Lucide.ThumbsDown, Tw.rose600)
        "alert" -> c(Lucide.TriangleAlert, Tw.rose600)
        "suggestion" -> c(Lucide.Lightbulb, Tw.indigo600)
        "routine" -> c(Lucide.WandSparkles, Tw.fuchsia600)
        "energy" -> c(Lucide.Leaf, Tw.emerald600)
        else -> c(Lucide.Info, Tw.slate600)
    }
}

/** "**bold**" spans, like the web's inline(). */
private fun inline(text: String, boldColor: Color) = buildAnnotatedString {
    var i = 0
    val re = Regex("""\*\*([^*]+)\*\*""")
    for (m in re.findAll(text)) {
        append(text.substring(i, m.range.first))
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = boldColor)) { append(m.groupValues[1]) }
        i = m.range.last + 1
    }
    append(text.substring(i))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SleekInsights(api: SleekApi, s: HomeState) {
    val sk = LocalSleek.current
    val context = LocalContext.current
    val isAdmin = s.isAdmin
    var index by remember { mutableStateOf<InsightsIndex?>(null) }
    var days by remember { mutableIntStateOf(7) }
    var current by remember { mutableStateOf<InsightResult?>(null) }
    var loading by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pickOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun refreshIndex(): InsightsIndex? = try {
        api.insightsIndex().also { index = it }
    } catch (e: Exception) {
        error = e.message
        null
    }

    fun view(key: String) {
        viewing = true
        error = null
        scope.launch {
            try {
                val r = api.insight(key)
                current = r
                days = r.days
            } catch (_: Exception) {
                error = "Could not load that analysis"
            } finally {
                viewing = false
            }
        }
    }

    LaunchedEffect(Unit) {
        val idx = refreshIndex()
        idx?.analyses?.firstOrNull()?.let { view(it.key) }
    }

    val idx = index ?: return Loading()

    if (!idx.available) {
        Column(Modifier.fillMaxWidth().glass(sk).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(56.dp).clip(Rounded2xl).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.brand500.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) { SIcon(Lucide.KeyRound, 26.dp, if (sk.dark) Tw.slate200 else Tw.brand600) }
            Spacer(Modifier.height(16.dp))
            Text(
                when {
                    !isAdmin -> "No insights yet"
                    idx.hasKey -> "AI features are turned off"
                    else -> "Add an OpenRouter API key"
                },
                fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = sk.title, textAlign = TextAlign.Center,
            )
            Text(
                when {
                    !isAdmin -> "AI features are off. Ask an admin to enable them, then insights will show up here."
                    idx.hasKey -> "Insights, Assistant and routine suggestions are disabled. Turn them back on in Settings, AI features."
                    else -> "Insights uses an LLM (via OpenRouter) to analyze your action logs. Add your key in Settings, AI features to get started."
                },
                fontSize = 14.sp, color = sk.muted, textAlign = TextAlign.Center, lineHeight = 20.sp,
                modifier = Modifier.widthIn(max = 340.dp).padding(top = 6.dp),
            )
            if (isAdmin) {
                Spacer(Modifier.height(20.dp))
                BtnPrimary(onClick = { context.startActivity(Intent(context, WebAppActivity::class.java)) }) {
                    BtnIcon(Lucide.KeyRound, 16.dp)
                    BtnText("Open settings")
                }
            }
        }
        return
    }

    val freshForSelected = idx.analyses.any { it.days == days && it.date == idx.today }

    fun analyze() {
        loading = true
        error = null
        scope.launch {
            try {
                current = api.generateInsights(days)
                refreshIndex()
            } catch (e: Exception) {
                error = e.message ?: "Analysis failed"
            } finally {
                loading = false
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (isAdmin) "Analyze the last" else "Show the last", fontSize = 14.sp, color = sk.muted)
            Spacer(Modifier.width(8.dp))
            Box {
                Text(
                    "$days day${if (days == 1) "" else "s"}  ▾", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = sk.title,
                    modifier = Modifier.pressable { pickOpen = true }
                        .glass(sk, RoundedXl, if (sk.dark) Color.White.copy(alpha = 0.07f) else Color.White.copy(alpha = 0.55f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                )
                DropdownMenu(expanded = pickOpen, onDismissRequest = { pickOpen = false }) {
                    for (d in DAY_OPTIONS) {
                        DropdownMenuItem(text = { Text("$d day${if (d == 1) "" else "s"}") }, onClick = {
                            pickOpen = false
                            days = d
                            idx.analyses.firstOrNull { it.days == d && it.date == idx.today }?.let { view(it.key) } ?: run { current = null }
                        })
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            if (isAdmin) {
                BtnPrimary(enabled = !loading, onClick = ::analyze) {
                    when {
                        loading -> Spinner(15.dp, LocalContentColor.current)
                        freshForSelected -> BtnIcon(Lucide.RefreshCw)
                        else -> BtnIcon(Lucide.Sparkles)
                    }
                    BtnText(if (loading) "Analyzing…" else if (freshForSelected) "Reanalyze" else "Analyze")
                }
            }
        }

        if (idx.analyses.isNotEmpty()) {
            Column(Modifier.padding(horizontal = 4.dp)) {
                Text("ANALYZED TIMEFRAMES", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp, color = sk.faint, modifier = Modifier.padding(bottom = 8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (a in idx.analyses) AnalysisChip(a, current?.key == a.key, a.date == idx.today) { view(a.key) }
                }
            }
        }

        error?.let {
            Text(
                it, fontSize = 14.sp, color = Tw.red500,
                modifier = Modifier.fillMaxWidth().clip(Rounded2xl).background(Color(0xFFFEF2F2)).border(1.dp, Color(0xFFFECACA), Rounded2xl).padding(16.dp),
            )
        }

        Column(Modifier.fillMaxWidth().glass(sk).padding(24.dp)) {
            val cur = current
            when {
                loading || viewing -> Row(Modifier.fillMaxWidth().padding(vertical = 56.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Spinner(18.dp, sk.faint)
                    Spacer(Modifier.width(8.dp))
                    Text(if (loading) "Analyzing $days day${if (days == 1) "" else "s"} of activity…" else "Loading…", color = sk.faint, fontSize = 14.sp)
                }
                cur != null -> {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(bottom = 12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            val c = if (sk.dark) Tw.slate200 else Tw.brand600
                            SIcon(Lucide.Sparkles, 12.dp, c)
                            Text("Insights", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = c)
                        }
                        for (t in listOf("· last ${cur.days} days", "· ${cur.logLines} log lines", "· ${cur.model}", "· generated ${fmtDate(cur.date)}")) {
                            Text(t, fontSize = 12.sp, color = sk.faint)
                        }
                        if (cur.date != idx.today) {
                            Text(
                                "window has shifted, reanalyze for today", fontSize = 12.sp, fontWeight = FontWeight.Medium,
                                color = if (sk.dark) Tw.slate200 else Tw.amber700,
                                modifier = Modifier.clip(CircleShape).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Color(0xFFFEF3C7)).padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                        }
                    }
                    if (cur.report != null) Report(cur.report) else MarkdownText(cur.text)
                    if (!cur.report?.recommended.isNullOrEmpty()) RecommendedRoutines(api, cur.report!!.recommended, isAdmin)
                }
                else -> Column(Modifier.fillMaxWidth().padding(vertical = 56.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    SIcon(Lucide.Sparkles, 26.dp, if (sk.dark) Tw.slate200 else Tw.brand500)
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "No analysis for the last $days day${if (days == 1) "" else "s"} today", fontWeight = FontWeight.Medium,
                        color = if (sk.dark) Tw.slate200 else Tw.slate700, textAlign = TextAlign.Center,
                    )
                    Text(
                        if (isAdmin) "Tap Analyze to generate it, or pick an earlier one above."
                        else "Ask an admin to generate it, or pick an earlier one above.",
                        fontSize = 14.sp, color = sk.muted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun AnalysisChip(a: InsightMeta, active: Boolean, fresh: Boolean, onClick: () -> Unit) {
    val sk = LocalSleek.current
    Row(
        Modifier.pressable(onClick = onClick)
            .clip(RoundedXl)
            .background(
                when {
                    active -> if (sk.dark) Color.White.copy(alpha = 0.1f) else Tw.brand500.copy(alpha = 0.1f)
                    sk.dark -> Color.White.copy(alpha = 0.06f)
                    else -> Color.White.copy(alpha = 0.45f)
                },
            )
            .border(
                1.dp,
                when {
                    active -> if (sk.dark) Color.White.copy(alpha = 0.25f) else Tw.brand500.copy(alpha = 0.4f)
                    sk.dark -> Color.White.copy(alpha = 0.1f)
                    else -> Color.White.copy(alpha = 0.6f)
                },
                RoundedXl,
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(if (fresh) Tw.emerald500 else Tw.slate300))
        Text(
            "Last ${a.days}d · ${fmtDate(a.date)}", fontSize = 12.sp, fontWeight = FontWeight.Medium,
            color = when {
                active -> if (sk.dark) Color.White else Tw.brand700
                sk.dark -> Tw.slate300
                else -> Tw.slate600
            },
        )
    }
}

@Composable
private fun Report(report: InsightReport) {
    val sk = LocalSleek.current
    val body = if (sk.dark) Tw.slate300 else Tw.slate600
    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        if (report.headline.isNotBlank()) {
            Text(inline(report.headline, sk.title), fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 23.sp, color = if (sk.dark) Tw.slate200 else Tw.slate800)
        }
        for (sec in report.sections) {
            val chip = sectionChip(sec.icon, sk.dark)
            Column {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                    Box(Modifier.size(32.dp).clip(RoundedXl).background(chip.bg), contentAlignment = Alignment.Center) { SIcon(chip.icon, 16.dp, chip.fg) }
                    Spacer(Modifier.width(10.dp))
                    Text(sec.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = sk.title)
                }
                Column(Modifier.padding(start = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (b in sec.bullets) {
                        Row {
                            Box(Modifier.padding(top = 7.dp).size(6.dp).clip(CircleShape).background(if (sk.dark) Color.White.copy(alpha = 0.4f) else Tw.brand500.copy(alpha = 0.7f)))
                            Spacer(Modifier.width(10.dp))
                            Text(inline(b, sk.title), fontSize = 14.sp, lineHeight = 21.sp, color = body)
                        }
                    }
                }
            }
        }
    }
}

/** Minimal markdown (headings, bullets, bold), for reports without structure. */
@Composable
private fun MarkdownText(md: String) {
    val sk = LocalSleek.current
    val body = if (sk.dark) Tw.slate300 else Tw.slate600
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (raw in md.lines()) {
            val line = raw.trimEnd()
            when {
                Regex("^#{1,6}\\s").containsMatchIn(line) -> Text(
                    line.replace(Regex("^#+\\s"), "").uppercase(), fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    color = sk.muted, modifier = Modifier.padding(top = 12.dp),
                )
                Regex("^[-*]\\s").containsMatchIn(line) -> Row {
                    Box(Modifier.padding(top = 8.dp).size(4.dp).clip(CircleShape).background(Tw.brand500))
                    Spacer(Modifier.width(8.dp))
                    Text(inline(line.replace(Regex("^[-*]\\s"), ""), sk.title), fontSize = 14.sp, color = body)
                }
                line.isBlank() -> Unit
                else -> Text(inline(line, sk.title), fontSize = 14.sp, lineHeight = 21.sp, color = body)
            }
        }
    }
}

@Composable
private fun RecommendedRoutines(api: SleekApi, routines: List<RecommendedRoutine>, isAdmin: Boolean) {
    val sk = LocalSleek.current
    val state = remember { mutableStateMapOf<Int, String>() }
    val scope = rememberCoroutineScope()
    Column(Modifier.padding(top = 24.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(if (sk.dark) Color.White.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.5f)))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 20.dp, bottom = 12.dp)) {
            val chip = sectionChip("routine", sk.dark)
            Box(Modifier.size(32.dp).clip(RoundedXl).background(chip.bg), contentAlignment = Alignment.Center) { SIcon(chip.icon, 16.dp, chip.fg) }
            Spacer(Modifier.width(10.dp))
            Text("Recommended Routines", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = sk.title)
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            routines.forEachIndexed { i, r ->
                Column(Modifier.fillMaxWidth().glass(sk, Rounded2xl, if (sk.dark) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.45f)).padding(16.dp)) {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f)) {
                            Text(r.name, fontWeight = FontWeight.SemiBold, color = sk.title, fontSize = 16.sp)
                            r.description?.let { Text(it, fontSize = 14.sp, color = sk.muted, modifier = Modifier.padding(top = 2.dp)) }
                        }
                        if (isAdmin) {
                            Spacer(Modifier.width(8.dp))
                            if (state[i] == "done") {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    SIcon(Lucide.Check, 15.dp, if (sk.dark) Tw.slate200 else Tw.emerald600)
                                    Text(" Created", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.slate200 else Tw.emerald600)
                                }
                            } else {
                                BtnPrimary(enabled = state[i] != "busy", onClick = {
                                    state[i] = "busy"
                                    scope.launch {
                                        state[i] = try {
                                            api.createRoutine(r)
                                            "done"
                                        } catch (e: Exception) {
                                            e.message ?: "Failed to create"
                                        }
                                    }
                                }) {
                                    if (state[i] == "busy") Spinner(14.dp, LocalContentColor.current) else BtnIcon(Lucide.Plus, 14.dp)
                                    BtnText("Create routine")
                                }
                            }
                        }
                    }
                    Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        for (a in r.actions) {
                            Text(
                                buildAnnotatedString {
                                    withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = if (sk.dark) Tw.slate200 else Tw.slate700)) { append(a.deviceName) }
                                    withStyle(SpanStyle(color = sk.faint)) { append("  ${a.controlName}  →  ") }
                                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = sk.title)) { append(a.valueLabel) }
                                },
                                fontSize = 14.sp,
                            )
                        }
                    }
                    val st = state[i]
                    if (st != null && st != "done" && st != "busy") Text(st, color = Tw.red500, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        }
    }
}
