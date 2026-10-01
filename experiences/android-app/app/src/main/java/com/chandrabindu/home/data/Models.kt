package com.chandrabindu.home.data

import org.json.JSONArray
import org.json.JSONObject

// Mirrors the hub's UI types (lib/types.ts), only the fields this app uses.
// Parsed with org.json: device values are loosely typed (bool / string / number).

/** A loosely typed JSON scalar: switches are booleans, fan levels strings, dimmers numbers. */
sealed class JsonValue {
    data class Bool(val value: Boolean) : JsonValue()
    data class Num(val value: Double) : JsonValue()
    data class Str(val value: String) : JsonValue()
    data object Null : JsonValue()

    val bool: Boolean? get() = (this as? Bool)?.value

    val number: Double?
        get() = when (this) {
            is Num -> value
            is Str -> value.toDoubleOrNull()
            else -> null
        }

    val string: String
        get() = when (this) {
            is Str -> value
            is Num -> if (value == Math.rint(value)) value.toLong().toString() else value.toString()
            is Bool -> if (value) "true" else "false"
            Null -> ""
        }

    /** Value for a JSON request body. */
    val json: Any
        get() = when (this) {
            is Bool -> value
            is Num -> if (value == Math.rint(value) && Math.abs(value) < 1e15) value.toLong() else value
            is Str -> value
            Null -> JSONObject.NULL
        }

    companion object {
        fun of(raw: Any?): JsonValue = when (raw) {
            null, JSONObject.NULL -> Null
            is Boolean -> Bool(raw)
            is Number -> Num(raw.toDouble())
            is String -> Str(raw)
            else -> Null
        }
    }
}

data class DeviceFunction(
    val code: String,
    val name: String,
    val type: String,
    val range: List<String>,
    val min: Double?,
    val max: Double?,
    val step: Double?,
    val unit: String?,
    val protected: Boolean,
    val superProtected: Boolean,
)

data class UiDevice(
    val id: String,
    val name: String,
    val category: String?,
    val bluetooth: Boolean,
    val functions: List<DeviceFunction>,
)

data class Room(
    val id: String,
    val name: String,
    val devices: List<UiDevice>,
    val locked: Boolean,
    val unlocked: Boolean,
) {
    /** True when the room has a password lock this session hasn't unlocked. */
    val isBlocked: Boolean get() = locked && !unlocked
}

data class Favourite(val deviceId: String, val code: String) {
    val key: String get() = "$deviceId::$code"
}

data class Routine(val id: String, val name: String, val actionCount: Int)

data class Automation(
    val id: String,
    val name: String,
    val enabled: Boolean,
    val conditionCount: Int,
    val actionCount: Int,
)

data class RoomsResponse(
    val rooms: List<Room>,
    val houseName: String?,
    val locked: Boolean,
    val lockReason: String?,
    val setupConfigured: Boolean,
)

data class LoginResult(val username: String, val role: String, val token: String)

data class Counts(val ok: Int, val failed: Int, val ignoredLocked: Int)

/** One control in context (its room and panel), as rows, tiles and search hits use it. */
data class ControlRef(val room: Room, val device: UiDevice, val fn: DeviceFunction) {
    val id: String get() = "${device.id}::${fn.code}"
}

/** Why a control can't be operated right now (shown as a hint, never an error). */
enum class Block { NONE, APP_LOCKED, SETUP, ROOM_LOCKED, OFFLINE, BLUETOOTH, SUPER_PROTECTED, ADMIN_ONLY }

object Parse {
    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) optString(key) else null

    private fun JSONObject.optDoubleOrNull(key: String): Double? =
        if (has(key) && !isNull(key)) optDouble(key).takeUnless { it.isNaN() } else null

    private inline fun <T> JSONArray?.mapObjects(f: (JSONObject) -> T?): List<T> {
        if (this == null) return emptyList()
        val out = ArrayList<T>(length())
        for (i in 0 until length()) {
            val o = optJSONObject(i) ?: continue
            f(o)?.let(out::add)
        }
        return out
    }

    private fun function(o: JSONObject): DeviceFunction? {
        val code = o.optStringOrNull("code") ?: return null
        val range = o.optJSONArray("range")?.let { a -> (0 until a.length()).map { a.optString(it) } } ?: emptyList()
        return DeviceFunction(
            code = code,
            name = o.optStringOrNull("name") ?: code,
            type = o.optString("type"),
            range = range,
            min = o.optDoubleOrNull("min"),
            max = o.optDoubleOrNull("max"),
            step = o.optDoubleOrNull("step"),
            unit = o.optStringOrNull("unit"),
            protected = o.optBoolean("protected", false),
            superProtected = o.optBoolean("superProtected", false),
        )
    }

    private fun device(o: JSONObject): UiDevice? {
        val id = o.optStringOrNull("id") ?: return null
        return UiDevice(
            id = id,
            name = o.optStringOrNull("name") ?: id,
            category = o.optStringOrNull("category"),
            bluetooth = o.optBoolean("bluetooth", false),
            functions = o.optJSONArray("functions").mapObjects(::function),
        )
    }

    fun rooms(o: JSONObject): RoomsResponse {
        val rooms = o.optJSONArray("rooms").mapObjects { r ->
            val id = r.optStringOrNull("id") ?: return@mapObjects null
            Room(
                id = id,
                name = r.optStringOrNull("name") ?: id,
                devices = r.optJSONArray("devices").mapObjects(::device),
                locked = r.optBoolean("locked", false),
                unlocked = r.optBoolean("unlocked", false),
            )
        }
        return RoomsResponse(
            rooms = rooms,
            houseName = o.optStringOrNull("houseName"),
            locked = o.optBoolean("locked", false),
            lockReason = o.optJSONObject("lockInfo")?.optStringOrNull("reason"),
            setupConfigured = o.optJSONObject("superProtected")?.optBoolean("configured", true) ?: true,
        )
    }

    fun favourites(o: JSONObject): List<Favourite> = o.optJSONArray("favourites").mapObjects { f ->
        val d = f.optStringOrNull("deviceId") ?: return@mapObjects null
        val c = f.optStringOrNull("code") ?: return@mapObjects null
        Favourite(d, c)
    }

    fun routines(o: JSONObject): List<Routine> = o.optJSONArray("routines").mapObjects { r ->
        val id = r.optStringOrNull("id") ?: return@mapObjects null
        Routine(id, r.optStringOrNull("name") ?: id, r.optJSONArray("actions")?.length() ?: 0)
    }

    fun automations(o: JSONObject): List<Automation> = o.optJSONArray("automations").mapObjects { a ->
        val id = a.optStringOrNull("id") ?: return@mapObjects null
        Automation(
            id = id,
            name = a.optStringOrNull("name") ?: id,
            enabled = a.optBoolean("enabled", false),
            conditionCount = a.optJSONArray("conditions")?.length() ?: 0,
            actionCount = a.optJSONArray("actions")?.length() ?: 0,
        )
    }

    /** `{status:[{code,value}]}` -> code -> value */
    fun status(o: JSONObject): Map<String, JsonValue> {
        val out = HashMap<String, JsonValue>()
        val arr = o.optJSONArray("status") ?: return out
        for (i in 0 until arr.length()) {
            val e = arr.optJSONObject(i) ?: continue
            val code = e.optStringOrNull("code") ?: continue
            out[code] = JsonValue.of(e.opt("value"))
        }
        return out
    }

    /** `{code: value}` -> code -> value (the SSE snapshot shape). */
    fun statusMap(o: JSONObject?): Map<String, JsonValue> {
        if (o == null) return emptyMap()
        val out = HashMap<String, JsonValue>()
        for (k in o.keys()) out[k] = JsonValue.of(o.opt(k))
        return out
    }

    fun counts(o: JSONObject) = Counts(o.optInt("ok", 0), o.optInt("failed", 0), o.optInt("ignoredLocked", 0))
}
