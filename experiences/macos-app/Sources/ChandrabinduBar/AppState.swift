import AppKit
import Network
import ServiceManagement
import SwiftUI

extension Notification.Name {
    static let panelDidOpen = Notification.Name("ChandrabinduPanelDidOpen")
}

/// One control in context (its room and panel), as rows and search hits use it.
struct ControlRef: Hashable, Identifiable {
    let room: Room
    let device: UiDevice
    let fn: DeviceFunction
    var id: String { device.id + "::" + fn.code }
}

enum SearchHit: Identifiable, Hashable {
    case routine(Routine)
    case control(ControlRef)

    var id: String {
        switch self {
        case .routine(let r): return "r:" + r.id
        case .control(let c): return "c:" + c.id
        }
    }
}

struct Toast: Equatable {
    let id = UUID()
    let text: String
    let isError: Bool
}

/// Why a control can't be operated right now (shown as a hint, never an error).
enum Block: Equatable {
    case none, appLocked, setup, roomLocked, offline, bluetooth, superProtected, adminOnly
}

@MainActor
final class AppState: ObservableObject {
    enum Phase: Equatable { case checking, unreachable(notHub: Bool), needsLogin, ready }

    static let defaultServer = "http://192.168.68.68"

    @Published var phase: Phase = .checking
    @Published var showingSettings = false
    @Published private(set) var serverAddress: String
    @Published private(set) var session: StoredSession?

    @Published private(set) var rooms: [Room] = []
    @Published private(set) var houseName = "Home"
    @Published private(set) var values: [String: [String: JSONValue]] = [:]
    @Published private(set) var offline: Set<String> = []
    @Published private(set) var favourites: [Favourite] = []
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var automations: [Automation] = []
    @Published private(set) var appLocked = false
    @Published private(set) var lockReason: String?
    @Published private(set) var setupIncomplete = false
    @Published private(set) var live = false
    @Published private(set) var statusLoadedAt: Date?

    @Published var toast: Toast?
    @Published private(set) var pending: Set<String> = []
    @Published private(set) var routineResult: [String: String] = [:]
    @Published var expandedRooms: Set<String> = []
    @Published var automationsExpanded = false
    @Published var query = "" { didSet { if query != oldValue { selection = 0 } } }
    @Published var selection = 0
    @Published private(set) var signingIn = false
    @Published var loginError: String?

    let client: HubClient
    var openFullApp: () -> Void = {}

    private var eventsTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var pathMonitor: NWPathMonitor?
    private var lastLoad: Date?
    private var checking = false
    private var ephemeral = false
    private(set) var panelOpen = false

    init() {
        let stored = UserDefaults.standard.string(forKey: "serverURL") ?? AppState.defaultServer
        let normalized = HubClient.normalize(stored)
        serverAddress = normalized
        client = HubClient(base: normalized)
    }

    // MARK: - Lifecycle

    func start() {
        if !ephemeral, let saved = SessionStore.load() {
            if HubClient.normalize(saved.server) == client.base {
                session = saved
                client.token = saved.token
            } else {
                SessionStore.clear() // signed in to a different hub address
            }
        }
        watchNetwork()
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.reconnect() }
        }
        reconnect()
    }

    /// Test hook (snapshot mode): sign in with a token without touching the Keychain.
    func useEphemeralSession(token: String, username: String, role: String) {
        ephemeral = true
        session = StoredSession(token: token, username: username, role: role, server: client.base)
        client.token = token
    }

    /// Test hook (snapshot mode): never read or write the Keychain this run.
    func disableKeychain() { ephemeral = true }

    func reconnect() {
        Task { await checkAndLoad() }
    }

    func checkAndLoad() async {
        guard !checking else { return }
        checking = true
        defer { checking = false }

        if phase != .ready { phase = .checking }
        switch await client.ping() {
        case .unreachable: goUnreachable(notHub: false); return
        case .notHub: goUnreachable(notHub: true); return
        case .ok: break
        }
        retryTask?.cancel()
        retryTask = nil

        guard session != nil else { phase = .needsLogin; return }
        do {
            try await loadAll()
            phase = .ready
            if !live { startEvents() }
            // No live stream after a moment (hub without the gateway)? Read states directly.
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if !live { await refreshStatuses() }
            if panelOpen { startPolling() }
        } catch HubError.unauthorized {
            expireSession()
        } catch {
            goUnreachable(notHub: false)
        }
    }

    private func goUnreachable(notHub: Bool) {
        phase = .unreachable(notHub: notHub)
        stopEvents()
        pollTask?.cancel()
        guard retryTask == nil else { return }
        // Keep knocking quietly while away from home; the network monitor also
        // re-checks the moment Wi-Fi changes.
        retryTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                guard let self, !Task.isCancelled else { return }
                guard case .unreachable = self.phase else { self.retryTask = nil; return }
                if await self.client.ping() == .ok {
                    self.retryTask = nil
                    await self.checkAndLoad()
                    return
                }
            }
        }
    }

    private func watchNetwork() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in
                guard let self else { return }
                try? await Task.sleep(nanoseconds: 1_500_000_000) // let DHCP settle
                if self.phase != .ready || !self.live { await self.checkAndLoad() }
            }
        }
        monitor.start(queue: .global(qos: .utility))
        pathMonitor = monitor
    }

    func panelOpened() {
        panelOpen = true
        query = ""
        NotificationCenter.default.post(name: .panelDidOpen, object: nil)
        switch phase {
        case .unreachable, .checking:
            reconnect()
        case .needsLogin:
            break
        case .ready:
            if lastLoad.map({ Date().timeIntervalSince($0) > 20 }) ?? true {
                Task { await reloadQuietly() }
            }
            startPolling()
        }
    }

    func panelClosed() {
        panelOpen = false
        showingSettings = false
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: - Loading

    func loadAll() async throws {
        let response: RoomsResponse = try await client.get("/api/rooms")
        rooms = response.rooms
        if let name = response.houseName, !name.isEmpty { houseName = name }
        appLocked = response.locked == true
        lockReason = response.lockInfo?.reason
        setupIncomplete = response.superProtected.map { !$0.configured } ?? false

        async let favs: FavouritesResponse? = try? client.get("/api/favourites")
        async let rts: RoutinesResponse? = try? client.get("/api/routines")
        async let autos: AutomationsResponse? = try? client.get("/api/automations")
        let (f, r, a) = await (favs, rts, autos)
        if let f { favourites = f.favourites }
        if let r { routines = r.routines }
        if let a { automations = a.automations }
        lastLoad = Date()
    }

    func reloadQuietly() async {
        do {
            try await loadAll()
        } catch {
            handle(error)
        }
    }

    /// Direct status reads (only used when the hub has no live event stream).
    func refreshStatuses(only ids: [String]? = nil) async {
        let targets = ids ?? rooms.flatMap(\.devices).filter { $0.bluetooth != true }.map(\.id)
        let client = self.client
        // A few at a time: without the gateway each read is a LAN round-trip on the hub.
        for start in stride(from: 0, to: targets.count, by: 4) {
            let chunk = Array(targets[start..<min(start + 4, targets.count)])
            let results = await withTaskGroup(of: (String, [String: JSONValue]?).self) { group in
                for id in chunk {
                    group.addTask {
                        guard let r: StatusResponse = try? await client.get("/api/devices/\(id)/status", timeout: 20) else {
                            return (id, nil)
                        }
                        var map: [String: JSONValue] = [:]
                        for entry in r.status ?? [] { map[entry.code] = entry.value }
                        return (id, map)
                    }
                }
                var out: [(String, [String: JSONValue]?)] = []
                for await result in group { out.append(result) }
                return out
            }
            for (id, map) in results {
                if let map {
                    values[id] = map
                    offline.remove(id)
                } else {
                    offline.insert(id)
                }
            }
        }
        statusLoadedAt = Date()
    }

    private func startPolling() {
        pollTask?.cancel()
        guard !live, phase == .ready else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                guard let self, !Task.isCancelled, self.panelOpen, !self.live else { return }
                await self.refreshStatuses()
            }
        }
    }

    // MARK: - Live events

    private func startEvents() {
        eventsTask?.cancel()
        let onEvent: @Sendable (String, Data) async -> Void = { [weak self] name, data in
            await self?.handleEvent(name, data)
        }
        eventsTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let client = self?.client else { return }
                do {
                    let streamed = try await client.streamEvents(onEvent)
                    if !streamed { self?.live = false; return } // no gateway: polling fallback
                } catch HubError.unauthorized {
                    self?.expireSession()
                    return
                } catch is CancellationError {
                    return
                } catch {
                    // dropped; fall through and reconnect
                }
                self?.live = false
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                guard let self, !Task.isCancelled else { return }
                // A dropped stream usually means the network changed.
                if await self.client.ping() != .ok {
                    self.goUnreachable(notHub: false)
                    return
                }
            }
        }
    }

    private func stopEvents() {
        eventsTask?.cancel()
        eventsTask = nil
        live = false
    }

    func handleEvent(_ name: String, _ data: Data) {
        let decoder = JSONDecoder()
        switch name {
        case "snapshot":
            guard let s = try? decoder.decode(SnapshotEvent.self, from: data) else { return }
            for device in s.devices {
                if let status = device.status { values[device.id] = status }
                if device.connected { offline.remove(device.id) } else { offline.insert(device.id) }
            }
            live = true
            statusLoadedAt = Date()
            pollTask?.cancel()
        case "change":
            guard let c = try? decoder.decode(ChangeEvent.self, from: data) else { return }
            values[c.deviceId, default: [:]][c.code] = c.value
            offline.remove(c.deviceId)
        case "state":
            guard let s = try? decoder.decode(StateEvent.self, from: data) else { return }
            if s.connected { offline.remove(s.deviceId) } else { offline.insert(s.deviceId) }
        case "lock":
            appLocked = true
            lockReason = (try? decoder.decode(LockInfo.self, from: data))?.reason
        case "unlock":
            appLocked = false
            lockReason = nil
        default:
            break
        }
    }

    // MARK: - Account

    var isAdmin: Bool { session?.isAdmin == true }

    func signIn(username: String, password: String) async {
        signingIn = true
        loginError = nil
        defer { signingIn = false }
        do {
            let r: LoginResponse = try await client.call(
                "/api/auth/login", body: ["username": username, "password": password])
            let s = StoredSession(token: r.token, username: r.username, role: r.role, server: client.base)
            session = s
            client.token = r.token
            if !ephemeral { SessionStore.save(s) }
            await checkAndLoad()
        } catch HubError.unauthorized {
            loginError = "Wrong username or password."
        } catch HubError.server(_, let message) {
            loginError = message
        } catch {
            loginError = "Can't reach your home hub."
        }
    }

    func signOut() {
        let client = self.client
        Task { try? await client.send("/api/auth/logout") }
        clearSession()
        phase = .needsLogin
        showingSettings = false
    }

    private func expireSession() {
        clearSession()
        phase = .needsLogin
        loginError = "Your session ended. Please sign in again."
    }

    private func clearSession() {
        stopEvents()
        pollTask?.cancel()
        if !ephemeral { SessionStore.clear() }
        session = nil
        client.token = nil
        if let url = URL(string: client.base) {
            for cookie in HTTPCookieStorage.shared.cookies(for: url) ?? [] {
                HTTPCookieStorage.shared.deleteCookie(cookie)
            }
        }
        rooms = []
        values = [:]
        offline = []
        favourites = []
        routines = []
        automations = []
        expandedRooms = []
        statusLoadedAt = nil
    }

    func changeServer(_ address: String) {
        let normalized = HubClient.normalize(address)
        UserDefaults.standard.set(normalized, forKey: "serverURL")
        if normalized != client.base {
            clearSession()
            client.setBase(normalized)
        }
        serverAddress = normalized
        showingSettings = false
        phase = .checking
        reconnect()
    }

    var launchAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            show("Couldn't change the login item: \(error.localizedDescription)", error: true)
        }
        objectWillChange.send()
    }

    // MARK: - Derived state

    func value(_ deviceId: String, _ code: String) -> JSONValue? { values[deviceId]?[code] }

    func onCount(in room: Room) -> Int {
        room.devices.reduce(0) { total, device in
            total + device.functions.filter { Controls.countsAsOn($0, value(device.id, $0.code)) }.count
        }
    }

    var onCount: Int { rooms.reduce(0) { $0 + onCount(in: $1) } }

    /// Whether the menu bar count can be trusted (live stream, or a recent read).
    var statusKnown: Bool {
        live || (statusLoadedAt.map { Date().timeIntervalSince($0) < 300 } ?? false)
    }

    func block(_ ref: ControlRef) -> Block {
        if appLocked { return .appLocked }
        if setupIncomplete { return .setup }
        if ref.device.bluetooth == true { return .bluetooth }
        if ref.room.isBlocked { return .roomLocked }
        if ref.fn.superProtected == true { return .superProtected }
        if (ref.fn.protected == true || Controls.isChildLock(ref.fn)) && !isAdmin { return .adminOnly }
        if offline.contains(ref.device.id) { return .offline }
        return .none
    }

    func isPending(_ key: String) -> Bool { pending.contains(key) }

    var favouriteRefs: [ControlRef] {
        favourites.compactMap { fav in
            for room in rooms {
                if let device = room.devices.first(where: { $0.id == fav.deviceId }),
                   let fn = device.functions.first(where: { $0.code == fav.code }),
                   Controls.isListed(fn), device.bluetooth != true {
                    return ControlRef(room: room, device: device, fn: fn)
                }
            }
            return nil
        }
    }

    var searchHits: [SearchHit] {
        let tokens = query.lowercased().split(separator: " ").map(String.init)
        guard !tokens.isEmpty else { return [] }
        func matches(_ text: String) -> Bool {
            let haystack = text.lowercased()
            return tokens.allSatisfy { haystack.contains($0) }
        }
        var hits: [SearchHit] = routines.filter { matches($0.name + " routine scene") }.map { .routine($0) }
        for room in rooms {
            for device in room.devices where device.bluetooth != true {
                for fn in device.functions where Controls.isListed(fn) {
                    if matches("\(room.name) \(device.name) \(fn.name)") {
                        hits.append(.control(ControlRef(room: room, device: device, fn: fn)))
                    }
                }
            }
        }
        return Array(hits.prefix(40))
    }

    func moveSelection(_ delta: Int) {
        let count = searchHits.count
        guard count > 0 else { return }
        selection = (selection + delta + count) % count
    }

    func activateSelection() {
        let hits = searchHits
        guard hits.indices.contains(selection) else { return }
        activate(hits[selection])
    }

    func activate(_ hit: SearchHit) {
        switch hit {
        case .routine(let r): run(r)
        case .control(let c): primaryAction(c)
        }
    }

    // MARK: - Actions

    /// The one-click action: toggle a switch, step a fan, or flip a dimmer off/full.
    func primaryAction(_ ref: ControlRef) {
        let current = value(ref.device.id, ref.fn.code)
        switch ref.fn.type {
        case "Boolean":
            setValue(ref, .bool(!(current?.bool ?? false)))
        case "Enum":
            let options = ref.fn.range ?? []
            guard !options.isEmpty else { return }
            let index = options.firstIndex(of: current?.string ?? "") ?? -1
            setValue(ref, .string(options[(index + 1) % options.count]))
        case "Integer":
            let low = ref.fn.min ?? 0
            let high = ref.fn.max ?? 100
            setValue(ref, .number(Controls.isOn(ref.fn, current) ? low : high))
        default:
            break
        }
    }

    func setValue(_ ref: ControlRef, _ newValue: JSONValue) {
        guard block(ref) == .none else { return }
        let key = ref.id
        let deviceId = ref.device.id
        let code = ref.fn.code
        let previous = value(deviceId, code)
        values[deviceId, default: [:]][code] = newValue // optimistic
        pending.insert(key)
        Task {
            defer { pending.remove(key) }
            do {
                try await client.send("/api/devices/\(deviceId)/commands",
                                      body: ["commands": [["code": code, "value": newValue.any]]])
                if !live {
                    try? await Task.sleep(nanoseconds: 700_000_000)
                    await refreshStatuses(only: [deviceId])
                }
            } catch {
                values[deviceId, default: [:]][code] = previous
                handle(error)
            }
        }
    }

    /// Turn off everything counted as on in a room: switches and running fans
    /// (never protected ones or locks).
    func turnOffRoom(_ room: Room) {
        guard !appLocked, !setupIncomplete, !room.isBlocked else { return }
        for device in room.devices where device.bluetooth != true && !offline.contains(device.id) {
            let fns = device.functions.filter {
                $0.superProtected != true && Controls.countsAsOn($0, value(device.id, $0.code))
            }
            guard !fns.isEmpty else { continue }
            let deviceId = device.id
            let previous = fns.map { value(deviceId, $0.code) }
            let offValue: (DeviceFunction) -> JSONValue = { $0.type == "Boolean" ? .bool(false) : .string("0") }
            for fn in fns { values[deviceId, default: [:]][fn.code] = offValue(fn) }
            Task {
                do {
                    try await client.send("/api/devices/\(deviceId)/commands",
                                          body: ["commands": fns.map { ["code": $0.code, "value": $0.type == "Boolean" ? false : "0"] as [String: Any] }])
                } catch {
                    for (fn, old) in zip(fns, previous) { values[deviceId, default: [:]][fn.code] = old }
                    handle(error)
                }
                if !live { await refreshStatuses(only: [deviceId]) }
            }
        }
    }

    func master(on: Bool) {
        pending.insert("master")
        Task {
            defer { pending.remove("master") }
            do {
                let r: CountsResponse = try await client.call("/api/master", body: ["on": on], timeout: 180)
                var message = "All \(on ? "on" : "off"): \(r.ok ?? 0) switched"
                if let failed = r.failed, failed > 0 { message += ", \(failed) failed" }
                show(message, error: (r.failed ?? 0) > 0)
                if !live { await refreshStatuses() }
            } catch {
                handle(error)
            }
        }
    }

    func run(_ routine: Routine) {
        guard !appLocked, !setupIncomplete else { return }
        let key = "routine:" + routine.id
        pending.insert(key)
        Task {
            defer { pending.remove(key) }
            do {
                let r: CountsResponse = try await client.call("/api/routines/\(routine.id)/run", timeout: 180)
                var bits = ["\(r.ok ?? 0) done"]
                if let failed = r.failed, failed > 0 { bits.append("\(failed) failed") }
                if let locked = r.ignoredLocked, locked > 0 { bits.append("\(locked) locked") }
                flashRoutine(routine.id, bits.joined(separator: " · "))
                if !live { await refreshStatuses() }
            } catch {
                flashRoutine(routine.id, "Failed")
                handle(error)
            }
        }
    }

    private func flashRoutine(_ id: String, _ text: String) {
        routineResult[id] = text
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if routineResult[id] == text { routineResult[id] = nil }
        }
    }

    /// Unlock a password-locked room for this session. Returns an error message, or nil.
    func unlockRoom(_ room: Room, password: String) async -> String? {
        do {
            try await client.send("/api/rooms/\(room.id)/unlock", body: ["password": password])
            await reloadQuietly()
            if !live { await refreshStatuses(only: room.devices.map(\.id)) }
            return nil
        } catch HubError.server(_, let message) {
            return message
        } catch {
            handle(error)
            return "Couldn't unlock the room."
        }
    }

    func toggleAutomation(_ automation: Automation) {
        guard isAdmin, let index = automations.firstIndex(where: { $0.id == automation.id }) else { return }
        let enabled = !automations[index].enabled
        automations[index].enabled = enabled
        Task {
            do {
                try await client.send("/api/automations/\(automation.id)", method: "PUT", body: ["enabled": enabled])
            } catch {
                if let i = automations.firstIndex(where: { $0.id == automation.id }) { automations[i].enabled = !enabled }
                handle(error)
            }
        }
    }

    func isFavourite(_ ref: ControlRef) -> Bool {
        favourites.contains(Favourite(deviceId: ref.device.id, code: ref.fn.code))
    }

    func toggleFavourite(_ ref: ControlRef) {
        let fav = Favourite(deviceId: ref.device.id, code: ref.fn.code)
        let make = !isFavourite(ref)
        if make { favourites.append(fav) } else { favourites.removeAll { $0 == fav } }
        Task {
            do {
                try await client.send("/api/favourites",
                                      body: ["deviceId": fav.deviceId, "code": fav.code, "favourite": make])
            } catch {
                if make { favourites.removeAll { $0 == fav } } else { favourites.append(fav) }
                handle(error)
            }
        }
    }

    func unlockApp() {
        Task {
            do {
                try await client.send("/api/lock", method: "PUT", body: ["locked": false])
                appLocked = false
                lockReason = nil
                await reloadQuietly()
            } catch {
                handle(error)
            }
        }
    }

    // MARK: - Feedback

    func show(_ text: String, error: Bool = false) {
        let toast = Toast(text: text, isError: error)
        self.toast = toast
        Task {
            try? await Task.sleep(nanoseconds: 3_500_000_000)
            if self.toast == toast { self.toast = nil }
        }
    }

    private func handle(_ error: Error) {
        if error is CancellationError { return }
        if let hub = error as? HubError {
            switch hub {
            case .unauthorized:
                expireSession()
                return
            case .unreachable:
                show("Can't reach your home hub.", error: true)
                reconnect()
                return
            default:
                break
            }
        }
        show(error.localizedDescription, error: true)
    }
}
