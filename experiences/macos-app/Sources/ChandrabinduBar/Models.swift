import Foundation

// Mirrors the hub's UI types (lib/types.ts), only the fields this app uses.

/// A loosely typed JSON scalar: device values are booleans (switches), strings
/// (fan / enum levels) or numbers (dimmers).
enum JSONValue: Codable, Hashable {
    case bool(Bool)
    case number(Double)
    case string(String)
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        self = .null
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .null: try c.encodeNil()
        }
    }

    var bool: Bool? { if case .bool(let b) = self { return b }; return nil }

    var number: Double? {
        switch self {
        case .number(let n): return n
        case .string(let s): return Double(s)
        default: return nil
        }
    }

    var string: String {
        switch self {
        case .string(let s): return s
        case .number(let n): return n == n.rounded() ? String(Int(n)) : String(n)
        case .bool(let b): return b ? "true" : "false"
        case .null: return ""
        }
    }

    /// Value for JSONSerialization request bodies.
    var any: Any {
        switch self {
        case .bool(let b): return b
        case .number(let n): return n == n.rounded() && abs(n) < 1e15 ? Int(n) : n
        case .string(let s): return s
        case .null: return NSNull()
        }
    }
}

/// Decodes (and discards) any JSON value. Used where only an array's count matters.
struct Ignored: Decodable { init(from decoder: Decoder) throws {} }

struct DeviceFunction: Decodable, Hashable, Identifiable {
    let code: String
    let name: String
    let type: String
    var range: [String]?
    var min: Double?
    var max: Double?
    var step: Double?
    var unit: String?
    var `protected`: Bool?
    var superProtected: Bool?
    var id: String { code }
}

struct UiDevice: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    var category: String?
    var bluetooth: Bool?
    let functions: [DeviceFunction]
}

struct Room: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let devices: [UiDevice]
    var locked: Bool?
    var unlocked: Bool?

    /// True when the room has a password lock this session hasn't unlocked.
    var isBlocked: Bool { locked == true && unlocked != true }
}

struct LockInfo: Decodable, Hashable { var reason: String? }
struct SuperProtectedStatus: Decodable, Hashable { var configured: Bool }

struct RoomsResponse: Decodable {
    let rooms: [Room]
    var houseName: String?
    var locked: Bool?
    var lockInfo: LockInfo?
    var superProtected: SuperProtectedStatus?
}

struct Favourite: Codable, Hashable {
    let deviceId: String
    let code: String
}
struct FavouritesResponse: Decodable { let favourites: [Favourite] }

struct Routine: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let actions: [RoutineAction]
}
struct RoutineAction: Decodable, Hashable {
    var deviceName: String?
    var controlName: String?
    var valueLabel: String?
}
struct RoutinesResponse: Decodable { let routines: [Routine] }

struct Automation: Decodable, Identifiable {
    let id: String
    let name: String
    var enabled: Bool
    let conditions: [Ignored]
    let actions: [Ignored]
}
struct AutomationsResponse: Decodable { let automations: [Automation] }

struct StatusEntry: Decodable { let code: String; let value: JSONValue }
struct StatusResponse: Decodable { let status: [StatusEntry]? }

struct LoginResponse: Decodable {
    let username: String
    let role: String
    let token: String
}

struct CountsResponse: Decodable {
    var ok: Int?
    var failed: Int?
    var skippedProtected: Int?
    var skippedLocked: Int?
    var ignoredLocked: Int?
}

struct ErrorBody: Decodable { let error: String? }
struct Metadata: Decodable { let name: String }

// Server-sent events from /api/events (relayed from the device gateway).
struct SnapshotEvent: Decodable {
    struct Device: Decodable { let id: String; let connected: Bool; let status: [String: JSONValue]? }
    let devices: [Device]
}
struct ChangeEvent: Decodable { let deviceId: String; let code: String; let value: JSONValue }
struct StateEvent: Decodable { let deviceId: String; let connected: Bool }
