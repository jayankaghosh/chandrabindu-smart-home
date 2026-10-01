import SwiftUI

struct HomeView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(spacing: 0) {
            HeaderView()
            Divider().opacity(0.5)
            if state.appLocked { LockBanner() }
            if state.setupIncomplete { SetupBanner() }
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if state.query.isEmpty {
                            FavouritesSection()
                            RoutinesSection()
                            RoomsSection()
                            AutomationsSection()
                        } else {
                            SearchResults()
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                }
                .onChange(of: state.selection) { _, index in
                    let hits = state.searchHits
                    if hits.indices.contains(index) { proxy.scrollTo(hits[index].id) }
                }
                // Bring a newly expanded room's controls into view.
                .onChange(of: state.expandedRooms) { old, new in
                    guard let added = new.subtracting(old).first else { return }
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("room-" + added, anchor: .top) }
                }
            }
            Divider().opacity(0.5)
            FooterView()
        }
    }
}

// MARK: - Header

private struct HeaderView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        VStack(spacing: 9) {
            HStack(spacing: 9) {
                Image(systemName: "house.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 26, height: 26)
                    .background(RoundedRectangle(cornerRadius: 7).fill(brand.gradient))
                VStack(alignment: .leading, spacing: 0) {
                    Text(state.houseName).font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
                    HStack(spacing: 4) {
                        Circle().fill(state.live ? Color.green : Color.secondary.opacity(0.6)).frame(width: 6, height: 6)
                        Text(statusLine).font(.system(size: 10.5)).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                IconButton(systemImage: "macwindow", help: "Open the full app (automations, usage, insights, settings)") {
                    state.openFullApp()
                }
                IconButton(systemImage: "gearshape", help: "Settings") { state.showingSettings = true }
            }
            SearchField()
            HStack(spacing: 6) {
                Text(onSummary).font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                if state.isPending("master") { ProgressView().controlSize(.mini) }
                ConfirmButton(title: "All off", systemImage: "power", tint: .secondary) { state.master(on: false) }
                ConfirmButton(title: "All on", systemImage: "sun.max.fill", tint: .orange) { state.master(on: true) }
            }
            .disabled(state.appLocked || state.setupIncomplete)
        }
        .padding(.horizontal, 12)
        .padding(.top, 11)
        .padding(.bottom, 9)
    }

    private var statusLine: String {
        if state.live { return "Live" }
        if let at = state.statusLoadedAt {
            let secs = Int(Date().timeIntervalSince(at))
            return secs < 60 ? "Updated just now" : "Updated \(secs / 60)m ago"
        }
        return "Connected"
    }

    private var onSummary: String {
        guard state.statusKnown || state.statusLoadedAt != nil else { return "Reading switches…" }
        let n = state.onCount
        return n == 0 ? "Everything is off" : "\(n) switch\(n == 1 ? "" : "es") on"
    }
}

struct IconButton: View {
    let systemImage: String
    let help: String
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 12.5, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 7).fill(Color.primary.opacity(hovering ? 0.09 : 0.0)))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(help)
    }
}

private struct SearchField: View {
    @EnvironmentObject var state: AppState
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass").font(.system(size: 11.5)).foregroundStyle(.secondary)
            TextField("Search a switch, room or routine", text: $state.query)
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))
                .focused($focused)
                .onSubmit { state.activateSelection() }
                .onKeyPress(.downArrow) { state.moveSelection(1); return .handled }
                .onKeyPress(.upArrow) { state.moveSelection(-1); return .handled }
                .onKeyPress(.escape) {
                    guard !state.query.isEmpty else { return .ignored }
                    state.query = ""
                    return .handled
                }
            if !state.query.isEmpty {
                Text("↩ toggle").font(.system(size: 10)).foregroundStyle(.tertiary)
                Button { state.query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(0.06)))
        .onAppear { focused = true }
        .onReceive(NotificationCenter.default.publisher(for: .panelDidOpen)) { _ in focused = true }
    }
}

// MARK: - Banners

private struct LockBanner: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        Banner(icon: "lock.fill", tint: .red, title: "App is locked",
               message: state.lockReason ?? "A runaway switch loop was detected, so all control is paused.") {
            if state.isAdmin {
                Button("Unlock") { state.unlockApp() }.controlSize(.small)
            }
        }
    }
}

private struct SetupBanner: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        Banner(icon: "bolt.trianglebadge.exclamationmark.fill", tint: .orange, title: "Setup incomplete",
               message: state.isAdmin
                   ? "Choose the switch that powers your internet before controlling anything."
                   : "Ask your administrator to finish setting up the app.") {
            if state.isAdmin {
                Button("Finish setup") { state.openFullApp() }.controlSize(.small)
            }
        }
    }
}

private struct Banner<Accessory: View>: View {
    let icon: String
    let tint: Color
    let title: String
    let message: String
    @ViewBuilder var accessory: Accessory

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon).foregroundStyle(tint).font(.system(size: 13))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 12, weight: .semibold))
                Text(message).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            accessory
        }
        .padding(10)
        .background(tint.opacity(0.1))
    }
}

// MARK: - Sections

private struct FavouritesSection: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        let refs = state.favouriteRefs
        if !refs.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Favourites")
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    ForEach(refs) { FavouriteTile(ref: $0) }
                }
            }
        }
    }
}

private struct RoutinesSection: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        if !state.routines.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                SectionLabel(text: "Routines")
                FlowLayout(spacing: 6) {
                    ForEach(state.routines) { RoutineChip(routine: $0) }
                }
            }
        }
    }
}

private struct RoutineChip: View {
    @EnvironmentObject var state: AppState
    let routine: Routine
    @State private var hovering = false

    var body: some View {
        let running = state.isPending("routine:" + routine.id)
        let result = state.routineResult[routine.id]
        Button { state.run(routine) } label: {
            HStack(spacing: 5) {
                if running {
                    ProgressView().controlSize(.mini)
                } else {
                    Image(systemName: result == nil ? "play.fill" : (result == "Failed" ? "xmark" : "checkmark"))
                        .font(.system(size: 9, weight: .bold))
                }
                Text(result ?? routine.name).font(.system(size: 11.5, weight: .medium)).lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(result == "Failed" ? Color.red : brand)
            .background(Capsule().fill(brand.opacity(hovering ? 0.2 : 0.11)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(running || state.appLocked || state.setupIncomplete)
        .onHover { hovering = $0 }
        .help("\(routine.actions.count) action\(routine.actions.count == 1 ? "" : "s")")
    }
}

private struct RoomsSection: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            SectionLabel(text: "Rooms", trailing: "\(state.rooms.count)")
            VStack(spacing: 2) {
                ForEach(state.rooms) { RoomRow(room: $0) }
            }
        }
    }
}

private struct RoomRow: View {
    @EnvironmentObject var state: AppState
    let room: Room
    @State private var hovering = false

    var body: some View {
        let expanded = state.expandedRooms.contains(room.id)
        let count = state.onCount(in: room)
        VStack(spacing: 0) {
            HStack(spacing: 9) {
                Image(systemName: Controls.roomSymbol(room.name))
                    .font(.system(size: 12))
                    .foregroundStyle(count > 0 ? Color.orange : Color.secondary)
                    .frame(width: 20)
                Text(room.name).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                if room.isBlocked {
                    Image(systemName: "lock.fill").font(.system(size: 10)).foregroundStyle(.secondary)
                }
                Spacer()
                if count > 0 {
                    Text("\(count) on")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1.5)
                        .background(Capsule().fill(Color.orange.opacity(0.14)))
                    if !room.isBlocked && !state.appLocked && !state.setupIncomplete {
                        Button { state.turnOffRoom(room) } label: {
                            Image(systemName: "power")
                                .font(.system(size: 10.5, weight: .bold))
                                .foregroundStyle(.secondary)
                                .frame(width: 22, height: 20)
                                .background(RoundedRectangle(cornerRadius: 5).fill(Color.primary.opacity(0.07)))
                        }
                        .buttonStyle(.plain)
                        .help("Turn off everything in \(room.name)")
                    }
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 9.5, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(expanded ? 90 : 0))
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.primary.opacity(hovering || expanded ? 0.05 : 0)))
            .contentShape(Rectangle())
            .onHover { hovering = $0 }
            .onTapGesture {
                withAnimation(.easeOut(duration: 0.15)) {
                    if expanded { state.expandedRooms.remove(room.id) } else { state.expandedRooms.insert(room.id) }
                }
            }

            if expanded {
                Group {
                    if room.isBlocked { RoomUnlock(room: room) } else { RoomControls(room: room) }
                }
                .padding(.leading, 12)
                .padding(.top, 2)
                .padding(.bottom, 6)
            }
        }
        .id("room-" + room.id)
    }
}

private struct RoomControls: View {
    @EnvironmentObject var state: AppState
    let room: Room

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(room.devices) { device in
                let listed = device.functions.filter(Controls.isListed)
                if device.bluetooth == true {
                    Label("\(device.name): Bluetooth, use the Smart Life app", systemImage: "dot.radiowaves.left.and.right")
                        .font(.system(size: 10.5))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                } else if !listed.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        DeviceHeader(room: room, device: device)
                        ForEach(listed) { fn in
                            ControlRow(ref: ControlRef(room: room, device: device, fn: fn))
                        }
                    }
                }
            }
        }
    }
}

private struct DeviceHeader: View {
    @EnvironmentObject var state: AppState
    let room: Room
    let device: UiDevice

    var body: some View {
        HStack(spacing: 6) {
            Text(device.name.uppercased())
                .font(.system(size: 9.5, weight: .semibold))
                .kerning(0.5)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
            if state.offline.contains(device.id) {
                Text("OFFLINE").font(.system(size: 9.5, weight: .semibold)).foregroundStyle(.orange)
            }
            Spacer()
            if let lock = device.functions.first(where: Controls.isChildLock) {
                PanelLockButton(ref: ControlRef(room: room, device: device, fn: lock))
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 5)
        .padding(.bottom, 1)
    }
}

/// The panel's physical-button lock (Tuya child lock). Admins toggle; others see it.
private struct PanelLockButton: View {
    @EnvironmentObject var state: AppState
    let ref: ControlRef

    var body: some View {
        let locked = state.value(ref.device.id, ref.fn.code)?.bool == true
        let canToggle = state.isAdmin && state.block(ref) == .none
        Button { state.setValue(ref, .bool(!locked)) } label: {
            Label(locked ? "Buttons locked" : "Buttons free", systemImage: locked ? "lock.fill" : "lock.open")
                .font(.system(size: 9.5, weight: .semibold))
                .foregroundStyle(locked ? Color.orange : Color.secondary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(locked ? Color.orange.opacity(0.14) : Color.primary.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .disabled(!canToggle)
        .help(state.isAdmin
              ? (locked ? "The physical buttons on this panel are locked. Click to unlock." : "Click to lock this panel's physical buttons.")
              : "Only an admin can lock or unlock the panel buttons.")
    }
}

private struct RoomUnlock: View {
    @EnvironmentObject var state: AppState
    let room: Room
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                SecureField("Room password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .controlSize(.small)
                    .onSubmit(unlock)
                Button("Unlock", action: unlock)
                    .controlSize(.small)
                    .disabled(password.isEmpty || busy)
            }
            if let error {
                Text(error).font(.system(size: 10.5)).foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 8)
    }

    private func unlock() {
        guard !password.isEmpty else { return }
        busy = true
        Task {
            error = await state.unlockRoom(room, password: password)
            busy = false
            if error == nil { password = "" }
        }
    }
}

private struct AutomationsSection: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        if !state.automations.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { state.automationsExpanded.toggle() }
                } label: {
                    HStack {
                        SectionLabel(text: "Automations",
                                     trailing: "\(state.automations.filter(\.enabled).count) of \(state.automations.count) on")
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9.5, weight: .semibold))
                            .foregroundStyle(.tertiary)
                            .rotationEffect(.degrees(state.automationsExpanded ? 90 : 0))
                            .padding(.trailing, 8)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if state.automationsExpanded {
                    VStack(spacing: 2) {
                        ForEach(state.automations) { automation in
                            HStack(spacing: 8) {
                                Image(systemName: "bolt.fill")
                                    .font(.system(size: 10.5))
                                    .foregroundStyle(automation.enabled ? Color.yellow : Color.secondary)
                                    .frame(width: 18)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(automation.name).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                                    Text("\(automation.conditions.count) if · \(automation.actions.count) then")
                                        .font(.system(size: 10.5)).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Toggle("", isOn: Binding(get: { automation.enabled },
                                                         set: { _ in state.toggleAutomation(automation) }))
                                    .toggleStyle(.switch)
                                    .controlSize(.mini)
                                    .labelsHidden()
                                    .disabled(!state.isAdmin)
                                    .help(state.isAdmin ? "Enable or disable" : "Only an admin can change automations")
                            }
                            .padding(.vertical, 4)
                            .padding(.horizontal, 8)
                        }
                    }
                }
            }
        }
    }
}

private struct SearchResults: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        let hits = state.searchHits
        VStack(alignment: .leading, spacing: 2) {
            if hits.isEmpty {
                Text("No matches for “\(state.query)”")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 30)
            }
            ForEach(Array(hits.enumerated()), id: \.element.id) { index, hit in
                Group {
                    switch hit {
                    case .routine(let routine):
                        RoutineHitRow(routine: routine, highlighted: index == state.selection)
                    case .control(let ref):
                        ControlRow(ref: ref, subtitle: "\(ref.room.name) · \(ref.device.name)",
                                   highlighted: index == state.selection)
                    }
                }
                .id(hit.id)
            }
        }
    }
}

private struct RoutineHitRow: View {
    @EnvironmentObject var state: AppState
    let routine: Routine
    let highlighted: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "play.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(brand)
                .frame(width: 26, height: 26)
                .background(Circle().fill(brand.opacity(0.14)))
            VStack(alignment: .leading, spacing: 1) {
                Text(routine.name).font(.system(size: 12.5, weight: .medium))
                Text(state.routineResult[routine.id] ?? "Routine · \(routine.actions.count) actions")
                    .font(.system(size: 10.5)).foregroundStyle(.secondary)
            }
            Spacer()
            if state.isPending("routine:" + routine.id) { ProgressView().controlSize(.mini) }
        }
        .padding(.vertical, 5)
        .padding(.horizontal, 8)
        .background(RoundedRectangle(cornerRadius: 8).fill(highlighted ? brand.opacity(0.16) : Color.clear))
        .contentShape(Rectangle())
        .onTapGesture { state.run(routine) }
    }
}

private struct FooterView: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        HStack(spacing: 6) {
            let name = state.session?.username ?? ""
            Text(state.isAdmin && name.lowercased() != "admin" ? "\(name) · admin" : name)
                .font(.system(size: 10.5)).foregroundStyle(.secondary)
            Text("⌃⌥H opens this anywhere").font(.system(size: 10.5)).foregroundStyle(.tertiary)
            Spacer()
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain)
                .font(.system(size: 10.5))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
    }
}
