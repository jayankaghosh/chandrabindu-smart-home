package com.chandrabindu.home.data

import org.json.JSONArray
import org.json.JSONObject

// Hub endpoints used only by the Sleek screens (shortcuts, switch groups, usage,
// insights, assistant, setup gate). Shapes mirror the web app's route handlers.

data class Shortcut(
    val id: String,
    val name: String,
    val match: String,
    val conditionCount: Int,
    val actionCount: Int,
    val apiEnabled: Boolean,
)

data class ShortcutResult(val ran: Boolean, val message: String)

data class SwitchGroup(val id: String, val name: String, val members: List<Favourite>)

data class UsageControl(
    val code: String,
    val name: String,
    val protected: Boolean,
    val onMs: Long,
    val offMs: Long,
    val toggles: Int,
    val hasData: Boolean,
)

data class UsageDevice(val id: String, val name: String, val controls: List<UsageControl>)
data class UsageRoom(val id: String, val name: String, val devices: List<UsageDevice>)

data class InsightMeta(val key: String, val days: Int, val date: String, val model: String, val logLines: Int)

data class InsightsIndex(
    val hasKey: Boolean,
    val available: Boolean,
    val today: String,
    val analyses: List<InsightMeta>,
)

data class InsightSection(val icon: String, val title: String, val bullets: List<String>)

data class RecommendedAction(
    val deviceId: String,
    val code: String,
    val value: JsonValue,
    val deviceName: String,
    val controlName: String,
    val valueLabel: String,
)

data class RecommendedRoutine(val name: String, val description: String?, val actions: List<RecommendedAction>)

data class InsightReport(
    val headline: String,
    val sections: List<InsightSection>,
    val recommended: List<RecommendedRoutine>,
)

data class InsightResult(
    val key: String,
    val days: Int,
    val date: String,
    val model: String,
    val logLines: Int,
    val text: String,
    val report: InsightReport?,
)

data class ChatAction(
    val deviceId: String,
    val code: String,
    val value: JsonValue,
    val deviceName: String,
    val roomName: String,
    val controlName: String,
    val valueLabel: String,
    val locked: Boolean,
)

data class ChatRoutine(val routineId: String, val name: String, val actionCount: Int)

data class ChatReply(val reply: String, val actions: List<ChatAction>, val routines: List<ChatRoutine>)

class SleekApi(private val repo: HomeRepository) {
    private val client get() = repo.client

    /** Runs a call; a 401 signs the app out, other failures surface as exceptions. */
    private suspend fun <T> call(block: suspend () -> T): T = try {
        block()
    } catch (e: HubException.Unauthorized) {
        repo.sessionExpired()
        throw e
    }

    private inline fun <T> JSONArray?.objects(f: (JSONObject) -> T?): List<T> {
        if (this == null) return emptyList()
        val out = ArrayList<T>()
        for (i in 0 until length()) optJSONObject(i)?.let { o -> f(o)?.let(out::add) }
        return out
    }

    private fun JSONArray?.strings(): List<String> =
        if (this == null) emptyList() else (0 until length()).map { optString(it) }

    suspend fun shortcuts(): List<Shortcut> = call {
        client.get("/api/shortcuts").optJSONArray("shortcuts").objects { s ->
            Shortcut(
                id = s.optString("id"),
                name = s.optString("name"),
                match = s.optString("match", "all"),
                conditionCount = s.optJSONArray("conditions")?.length() ?: 0,
                actionCount = s.optJSONArray("actions")?.length() ?: 0,
                apiEnabled = s.optBoolean("apiEnabled", false),
            )
        }
    }

    suspend fun runShortcut(id: String): ShortcutResult = call {
        val d = client.send("/api/shortcuts/$id/run", timeoutSec = 180)
        val ran = d.optBoolean("ran", false)
        ShortcutResult(ran, if (ran) d.optString("message", "Done") else "Conditions not met")
    }

    suspend fun switchGroups(): List<SwitchGroup> = call {
        client.get("/api/switch-groups").optJSONArray("groups").objects { g ->
            SwitchGroup(
                id = g.optString("id"),
                name = g.optString("name"),
                members = g.optJSONArray("members").objects { m -> Favourite(m.optString("deviceId"), m.optString("code")) },
            )
        }
    }

    suspend fun usage(from: Long, to: Long): List<UsageRoom> = call {
        client.get("/api/usage?from=$from&to=$to").optJSONArray("rooms").objects { r ->
            UsageRoom(
                id = r.optString("id"),
                name = r.optString("name"),
                devices = r.optJSONArray("devices").objects { d ->
                    UsageDevice(
                        id = d.optString("id"),
                        name = d.optString("name"),
                        controls = d.optJSONArray("controls").objects { c ->
                            UsageControl(
                                code = c.optString("code"),
                                name = c.optString("name"),
                                protected = c.optBoolean("protected", false),
                                onMs = c.optLong("onMs", 0),
                                offMs = c.optLong("offMs", 0),
                                toggles = c.optInt("toggles", 0),
                                hasData = c.optBoolean("hasData", false),
                            )
                        },
                    )
                },
            )
        }
    }

    suspend fun insightsIndex(): InsightsIndex = call {
        val d = client.get("/api/insights")
        InsightsIndex(
            hasKey = d.optBoolean("hasKey", false),
            available = d.optBoolean("available", false),
            today = d.optString("today"),
            analyses = d.optJSONArray("analyses").objects { a ->
                InsightMeta(a.optString("key"), a.optInt("days"), a.optString("date"), a.optString("model"), a.optInt("logLines"))
            },
        )
    }

    private fun parseInsight(d: JSONObject): InsightResult {
        val r = d.optJSONObject("report")
        val report = r?.let {
            InsightReport(
                headline = it.optString("headline"),
                sections = it.optJSONArray("sections").objects { s ->
                    InsightSection(s.optString("icon", "info"), s.optString("title"), s.optJSONArray("bullets").strings())
                },
                recommended = it.optJSONArray("recommendedRoutines").objects { rr ->
                    RecommendedRoutine(
                        name = rr.optString("name"),
                        description = rr.optString("description").ifBlank { null },
                        actions = rr.optJSONArray("actions").objects { a ->
                            RecommendedAction(
                                a.optString("deviceId"), a.optString("code"), JsonValue.of(a.opt("value")),
                                a.optString("deviceName"), a.optString("controlName"), a.optString("valueLabel"),
                            )
                        },
                    )
                },
            )
        }
        return InsightResult(
            key = d.optString("key"),
            days = d.optInt("days", 7),
            date = d.optString("date"),
            model = d.optString("model"),
            logLines = d.optInt("logLines"),
            text = d.optString("text"),
            report = report,
        )
    }

    suspend fun insight(key: String): InsightResult = call { parseInsight(client.get("/api/insights/$key")) }

    suspend fun generateInsights(days: Int): InsightResult = call {
        parseInsight(client.send("/api/insights", body = JSONObject().put("days", days), timeoutSec = 180))
    }

    suspend fun createRoutine(r: RecommendedRoutine) = call {
        val actions = JSONArray()
        r.actions.forEach { a -> actions.put(JSONObject().put("deviceId", a.deviceId).put("code", a.code).put("value", a.value.json)) }
        client.send("/api/routines", body = JSONObject().put("name", r.name).put("actions", actions))
        repo.reloadQuietly()
    }

    suspend fun chat(history: List<Pair<String, String>>): ChatReply = call {
        val msgs = JSONArray()
        history.forEach { (role, content) -> msgs.put(JSONObject().put("role", role).put("content", content)) }
        val d = client.send("/api/ai/chat", body = JSONObject().put("messages", msgs), timeoutSec = 120)
        ChatReply(
            reply = d.optString("reply").ifBlank { "…" },
            actions = d.optJSONArray("actions").objects { a ->
                ChatAction(
                    a.optString("deviceId"), a.optString("code"), JsonValue.of(a.opt("value")),
                    a.optString("deviceName"), a.optString("roomName"), a.optString("controlName"),
                    a.optString("valueLabel"), a.optBoolean("locked", false),
                )
            },
            routines = d.optJSONArray("routines").objects { r ->
                ChatRoutine(r.optString("routineId"), r.optString("name"), r.optInt("actionCount"))
            },
        )
    }

    /** Runs confirmed assistant actions + routines. Returns (ok, failed, skippedLocked). */
    suspend fun runConfirmed(actions: List<ChatAction>, routines: List<ChatRoutine>): Triple<Int, Int, Int> = call {
        var ok = 0
        var failed = 0
        var skipped = 0
        if (actions.isNotEmpty()) {
            val arr = JSONArray()
            actions.forEach { a -> arr.put(JSONObject().put("deviceId", a.deviceId).put("code", a.code).put("value", a.value.json)) }
            val d = client.send("/api/ai/execute", body = JSONObject().put("actions", arr), timeoutSec = 300)
            ok += d.optInt("ok")
            failed += d.optInt("failed")
            skipped += d.optInt("ignoredLocked")
        }
        for (r in routines) {
            try {
                val d = client.send("/api/routines/${r.routineId}/run", timeoutSec = 180)
                ok += d.optInt("ok")
                failed += d.optInt("failed")
                skipped += d.optInt("ignoredLocked")
            } catch (e: HubException.Unauthorized) {
                throw e
            } catch (_: Exception) {
                failed += r.actionCount
            }
        }
        if (!repo.current.live) repo.refreshStatuses()
        Triple(ok, failed, skipped)
    }

    suspend fun setSuperProtected(deviceId: String?, code: String?) = call {
        val body = if (deviceId == null || code == null) JSONObject().put("none", true)
        else JSONObject().put("deviceId", deviceId).put("code", code)
        client.send("/api/super-protected", "PUT", body)
        repo.reloadQuietly()
    }
}
