import SwiftUI

// Control semantics, mirroring the web app (components/sleek/labels.ts,
// lib/icons.ts, lib/panelLock.ts) so both clients agree on what "on" means.
enum Controls {
    static let controllable: Set<String> = ["Boolean", "Enum", "Integer"]
    static let childLockCode = "child_lock"

    static func isChildLock(_ fn: DeviceFunction) -> Bool { fn.code == childLockCode }

    /// A control shown as a normal row (the panel lock gets its own button).
    static func isListed(_ fn: DeviceFunction) -> Bool {
        controllable.contains(fn.type) && !isChildLock(fn)
    }

    /// Counts toward "N on": a plain switch that is not protected or a lock.
    static func countsAsOn(_ fn: DeviceFunction, _ value: JSONValue?) -> Bool {
        fn.type == "Boolean" && fn.protected != true && !isChildLock(fn) && value?.bool == true
    }

    static func isOn(_ fn: DeviceFunction, _ value: JSONValue?) -> Bool {
        guard let value else { return false }
        switch fn.type {
        case "Boolean": return value.bool == true
        case "Enum": let s = value.string; return s != "0" && !s.isEmpty
        case "Integer": return (value.number ?? 0) > (fn.min ?? 0)
        default: return false
        }
    }

    static let fanLabels = ["0": "Off", "25": "Low", "50": "Med", "75": "High", "100": "Max"]

    static func enumLabel(_ option: String, _ fn: DeviceFunction) -> String {
        if Int(option) != nil { return fanLabels[option] ?? "\(option)\(fn.unit ?? "%")" }
        return option.capitalized
    }

    static func valueLabel(_ fn: DeviceFunction, _ value: JSONValue?) -> String {
        guard let value else { return "-" }
        switch fn.type {
        case "Boolean": return value.bool == true ? "On" : "Off"
        case "Enum": return enumLabel(value.string, fn)
        case "Integer":
            let n = value.number ?? 0
            return n <= (fn.min ?? 0) ? "Off" : "\(Int(n))\(fn.unit ?? "")"
        default: return value.string
        }
    }

    enum Kind { case light, fan, socket, lock, tv, bell, power }

    static func kind(_ fn: DeviceFunction) -> Kind {
        let s = "\(fn.name) \(fn.code)".lowercased()
        if s.contains("fan") { return .fan }
        if s.contains("doorbell") || s.contains("bell") { return .bell }
        if s.range(of: #"\btv\b|fire tv|playstation"#, options: .regularExpression) != nil { return .tv }
        if s.range(of: "sock|plug|outlet|modem|alexa|speaker", options: .regularExpression) != nil { return .socket }
        if s.contains("lock") { return .lock }
        if s.range(of: "light|lamp|bulb|strip|chandelier|led|spot|deco|elevation|ambient", options: .regularExpression) != nil { return .light }
        return .power
    }

    static func symbol(_ fn: DeviceFunction, on: Bool) -> String {
        switch kind(fn) {
        case .light: return on ? "lightbulb.fill" : "lightbulb"
        case .fan: return "fan.fill"
        case .socket: return on ? "powerplug.fill" : "powerplug"
        case .lock: return "lock.fill"
        case .tv: return on ? "tv.fill" : "tv"
        case .bell: return on ? "bell.fill" : "bell"
        case .power: return "power"
        }
    }

    static func tint(_ fn: DeviceFunction) -> Color {
        switch kind(fn) {
        case .light: return .orange
        case .fan: return .cyan
        case .socket, .tv: return .green
        case .lock, .bell: return .pink
        case .power: return .indigo
        }
    }

    static func roomSymbol(_ name: String) -> String {
        let s = name.lowercased()
        if s.range(of: #"bed|\bmbr\b|\bgbr\b|\bfbr\b"#, options: .regularExpression) != nil { return "bed.double.fill" }
        if s.contains("living") { return "sofa.fill" }
        if s.contains("kitchen") { return "fork.knife" }
        if s.contains("drawing") || s.contains("tv") { return "tv.fill" }
        if s.contains("pooja") { return "sparkles" }
        if s.contains("balcony") || s.contains("garden") { return "sun.max.fill" }
        if s.contains("bar") { return "cup.and.saucer.fill" }
        if s.contains("park") || s.contains("garage") { return "car.fill" }
        if s.contains("bath") { return "shower.fill" }
        if s.contains("study") || s.contains("office") { return "desktopcomputer" }
        return "house.fill"
    }
}
