package com.chandrabindu.home.data

import com.chandrabindu.home.R

// Control semantics, mirroring the web app (components/sleek/labels.ts,
// lib/icons.ts, lib/panelLock.ts) and the macOS app, so every client agrees on
// what "on" means.
object Controls {
    private val controllable = setOf("Boolean", "Enum", "Integer")
    const val CHILD_LOCK_CODE = "child_lock"

    fun isChildLock(fn: DeviceFunction) = fn.code == CHILD_LOCK_CODE

    /** A control shown as a normal row (the panel lock gets its own pill). */
    fun isListed(fn: DeviceFunction) = fn.type in controllable && !isChildLock(fn)

    /** Counts toward "N on": a plain switch that is not protected or a lock. */
    fun countsAsOn(fn: DeviceFunction, value: JsonValue?) =
        fn.type == "Boolean" && !fn.protected && !isChildLock(fn) && value?.bool == true

    fun isOn(fn: DeviceFunction, value: JsonValue?): Boolean {
        value ?: return false
        return when (fn.type) {
            "Boolean" -> value.bool == true
            "Enum" -> value.string.let { it != "0" && it.isNotEmpty() }
            "Integer" -> (value.number ?: 0.0) > (fn.min ?: 0.0)
            else -> false
        }
    }

    private val fanLabels = mapOf("0" to "Off", "25" to "Low", "50" to "Med", "75" to "High", "100" to "Max")

    fun enumLabel(option: String, fn: DeviceFunction): String {
        if (option.toIntOrNull() != null) return fanLabels[option] ?: "$option${fn.unit ?: "%"}"
        return option.replaceFirstChar { it.uppercase() }
    }

    fun valueLabel(fn: DeviceFunction, value: JsonValue?): String {
        value ?: return "-"
        return when (fn.type) {
            "Boolean" -> if (value.bool == true) "On" else "Off"
            "Enum" -> enumLabel(value.string, fn)
            "Integer" -> {
                val n = value.number ?: 0.0
                if (n <= (fn.min ?: 0.0)) "Off" else "${n.toInt()}${fn.unit ?: ""}"
            }
            else -> value.string
        }
    }

    /** True when every Enum option is a number (fan levels like 0/25/50/75/100). */
    fun numericLevels(fn: DeviceFunction): List<Double>? {
        if (fn.type != "Enum" || fn.range.size < 2) return null
        val nums = fn.range.map { it.toDoubleOrNull() ?: return null }
        return nums
    }

    /** The Enum option closest to a slider position. */
    fun nearestOption(fn: DeviceFunction, v: Double): String? {
        val nums = numericLevels(fn) ?: return null
        val i = nums.indices.minByOrNull { Math.abs(nums[it] - v) } ?: return null
        return fn.range[i]
    }

    enum class Kind { LIGHT, FAN, SOCKET, LOCK, TV, BELL, POWER }

    private val tvRe = Regex("""\btv\b|fire tv|playstation""")
    private val socketRe = Regex("sock|plug|outlet|modem|alexa|speaker")
    private val lightRe = Regex("light|lamp|bulb|strip|chandelier|led|spot|deco|elevation|ambient")

    fun kind(fn: DeviceFunction): Kind {
        val s = "${fn.name} ${fn.code}".lowercase()
        return when {
            "fan" in s -> Kind.FAN
            "doorbell" in s || "bell" in s -> Kind.BELL
            tvRe.containsMatchIn(s) -> Kind.TV
            socketRe.containsMatchIn(s) -> Kind.SOCKET
            "lock" in s -> Kind.LOCK
            lightRe.containsMatchIn(s) -> Kind.LIGHT
            else -> Kind.POWER
        }
    }

    /** Drawable for surfaces outside Compose (tiles, Device Controls, widget). */
    fun iconRes(fn: DeviceFunction): Int = when (kind(fn)) {
        Kind.LIGHT -> R.drawable.ic_lightbulb
        Kind.FAN -> R.drawable.ic_fan
        Kind.SOCKET -> R.drawable.ic_plug
        Kind.TV -> R.drawable.ic_tv
        Kind.BELL -> R.drawable.ic_bell
        Kind.LOCK -> R.drawable.ic_lock
        Kind.POWER -> R.drawable.ic_power
    }

    /** Tint as ARGB (orange lights, cyan fans, green sockets, ...). */
    fun tint(fn: DeviceFunction): Long = when (kind(fn)) {
        Kind.LIGHT -> 0xFFFF9500
        Kind.FAN -> 0xFF32ADE6
        Kind.SOCKET, Kind.TV -> 0xFF34C759
        Kind.LOCK, Kind.BELL -> 0xFFFF2D55
        Kind.POWER -> 0xFF6661F2
    }
}
