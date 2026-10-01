import SwiftUI

let brand = Color(red: 0.40, green: 0.38, blue: 0.95)

/// Small uppercase section label.
struct SectionLabel: View {
    let text: String
    var trailing: String? = nil
    var body: some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 10.5, weight: .semibold))
                .kerning(0.6)
                .foregroundStyle(.secondary)
            Spacer()
            if let trailing {
                Text(trailing).font(.system(size: 10.5)).foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 4)
    }
}

/// A compact on/off pill (the row itself is the click target).
struct SwitchPill: View {
    let on: Bool
    let tint: Color
    var body: some View {
        ZStack(alignment: on ? .trailing : .leading) {
            Capsule().fill(on ? tint : Color.primary.opacity(0.16))
            Circle().fill(.white).shadow(color: .black.opacity(0.2), radius: 1, y: 0.5).padding(2)
        }
        .frame(width: 30, height: 17)
        .animation(.easeOut(duration: 0.12), value: on)
    }
}

/// Fan / mode levels as one-click segments (no dropdown to open first).
struct LevelSegments: View {
    let fn: DeviceFunction
    let current: String
    let tint: Color
    let enabled: Bool
    let pick: (String) -> Void

    var body: some View {
        HStack(spacing: 2) {
            ForEach(fn.range ?? [], id: \.self) { option in
                let selected = option == current
                Button { pick(option) } label: {
                    Text(Controls.enumLabel(option, fn))
                        .font(.system(size: 10.5, weight: selected ? .semibold : .regular))
                        .frame(minWidth: 30)
                        .padding(.vertical, 3)
                        .padding(.horizontal, 3)
                        .foregroundStyle(selected ? Color.white : Color.secondary)
                        .background(RoundedRectangle(cornerRadius: 5).fill(selected ? tint : Color.clear))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!enabled)
            }
        }
        .padding(2)
        .background(RoundedRectangle(cornerRadius: 7).fill(Color.primary.opacity(0.07)))
    }
}

/// Dimmer slider that only sends a command when the drag ends.
struct LevelSlider: View {
    let fn: DeviceFunction
    let current: Double
    let enabled: Bool
    let commit: (Double) -> Void
    @State private var dragValue: Double?

    var body: some View {
        let low = fn.min ?? 0
        let high = Swift.max(fn.max ?? 100, low + 1)
        HStack(spacing: 6) {
            Slider(value: Binding(get: { dragValue ?? current }, set: { dragValue = $0 }),
                   in: low...high, step: Swift.max(fn.step ?? 1, 1)) { editing in
                if !editing, let v = dragValue { commit(v); dragValue = nil }
            }
            .controlSize(.mini)
            .frame(width: 96)
            .disabled(!enabled)
            Text("\(Int(dragValue ?? current))\(fn.unit ?? "")")
                .font(.system(size: 10.5).monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 34, alignment: .trailing)
        }
    }
}

/// One control as a list row. Switches toggle on a single click anywhere on the row.
struct ControlRow: View {
    @EnvironmentObject var state: AppState
    let ref: ControlRef
    var subtitle: String? = nil
    var highlighted = false

    @State private var hovering = false
    @State private var confirming = false

    var body: some View {
        let fn = ref.fn
        let value = state.value(ref.device.id, fn.code)
        let on = Controls.isOn(fn, value)
        let block = state.block(ref)
        let enabled = block == .none
        let tint = Controls.tint(fn)

        HStack(spacing: 10) {
            ZStack {
                Circle().fill(on ? tint.opacity(0.22) : Color.primary.opacity(0.07))
                Image(systemName: Controls.symbol(fn, on: on))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(on ? tint : Color.secondary)
            }
            .frame(width: 26, height: 26)

            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(fn.name).font(.system(size: 12.5, weight: .medium)).lineLimit(1)
                    if state.isPending(ref.id) { ProgressView().controlSize(.mini) }
                }
                if let hint = hintText(block: block) {
                    Text(hint).font(.system(size: 10.5)).foregroundStyle(hintColor(block)).lineLimit(1)
                } else if let subtitle {
                    Text(subtitle).font(.system(size: 10.5)).foregroundStyle(.secondary).lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            trailing(fn: fn, value: value, on: on, enabled: enabled, tint: tint, block: block)
        }
        .padding(.vertical, 5)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(highlighted ? brand.opacity(0.16) : (hovering && enabled ? Color.primary.opacity(0.05) : Color.clear))
        )
        .contentShape(Rectangle())
        .opacity(enabled || block == .superProtected ? 1 : 0.55)
        .onHover { hovering = $0 }
        .onTapGesture { if fn.type == "Boolean" { tap() } }
        .contextMenu {
            Button(state.isFavourite(ref) ? "Remove from Favourites" : "Add to Favourites") {
                state.toggleFavourite(ref)
            }
        }
        .help(helpText(block: block))
    }

    @ViewBuilder
    private func trailing(fn: DeviceFunction, value: JSONValue?, on: Bool, enabled: Bool, tint: Color, block: Block) -> some View {
        if block == .superProtected {
            Label("Always on", systemImage: "lock.shield.fill")
                .font(.system(size: 10.5, weight: .semibold))
                .foregroundStyle(.green)
        } else {
            switch fn.type {
            case "Enum":
                if (fn.range ?? []).count <= 5 {
                    LevelSegments(fn: fn, current: value?.string ?? "", tint: tint, enabled: enabled) { option in
                        guard !needsConfirm() else { return }
                        state.setValue(ref, .string(option))
                    }
                } else {
                    Menu(Controls.valueLabel(fn, value)) {
                        ForEach(fn.range ?? [], id: \.self) { option in
                            Button(Controls.enumLabel(option, fn)) { state.setValue(ref, .string(option)) }
                        }
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                    .disabled(!enabled)
                }
            case "Integer":
                LevelSlider(fn: fn, current: value?.number ?? (fn.min ?? 0), enabled: enabled) { v in
                    state.setValue(ref, .number(v.rounded()))
                }
            default:
                SwitchPill(on: on, tint: tint)
            }
        }
    }

    /// Protected controls (admin) need a second click within 3s.
    private func needsConfirm() -> Bool {
        guard ref.fn.protected == true, !confirming else { confirming = false; return false }
        confirming = true
        Task {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            confirming = false
        }
        return true
    }

    private func tap() {
        guard state.block(ref) == .none, !needsConfirm() else { return }
        state.primaryAction(ref)
    }

    private func hintText(block: Block) -> String? {
        if confirming { return "Protected. Click again to confirm" }
        switch block {
        case .superProtected: return "Powers the whole house"
        case .adminOnly: return "Protected · admin only"
        case .offline: return "Offline"
        case .roomLocked: return "Room locked"
        default: return ref.fn.protected == true ? "Protected" : nil
        }
    }

    private func hintColor(_ block: Block) -> Color {
        if confirming { return .orange }
        switch block {
        case .offline: return .orange
        case .superProtected: return .green
        default: return .secondary
        }
    }

    private func helpText(block: Block) -> String {
        switch block {
        case .superProtected: return "This switch powers your internet and hub, so it can't be turned off."
        case .adminOnly: return "Only an admin can change this."
        case .appLocked: return "The app is locked."
        case .setup: return "Setup isn't finished yet."
        case .offline: return "This panel isn't responding."
        default: return "Right-click to add or remove from Favourites."
        }
    }
}

/// Favourite as a two-column tile: the fastest one-click target in the panel.
struct FavouriteTile: View {
    @EnvironmentObject var state: AppState
    let ref: ControlRef
    @State private var hovering = false

    var body: some View {
        let fn = ref.fn
        let value = state.value(ref.device.id, fn.code)
        let on = Controls.isOn(fn, value)
        let enabled = state.block(ref) == .none
        let tint = Controls.tint(fn)

        Button {
            state.primaryAction(ref)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: Controls.symbol(fn, on: on))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(on ? tint : Color.secondary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 0) {
                    Text(fn.name).font(.system(size: 12, weight: .medium)).lineLimit(1)
                    // The room disambiguates the many controls simply called "Fan".
                    (Text(Controls.valueLabel(fn, value)).foregroundColor(on ? tint : Color.secondary)
                        + Text(" · \(ref.room.name)").foregroundColor(Color.secondary.opacity(0.8)))
                        .font(.system(size: 10.5))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if state.isPending(ref.id) { ProgressView().controlSize(.mini) }
            }
            .padding(.horizontal, 9)
            .frame(height: 40)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 9)
                    .fill(on ? tint.opacity(hovering ? 0.26 : 0.18) : Color.primary.opacity(hovering ? 0.09 : 0.055))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled || fn.protected == true)
        .opacity(enabled ? 1 : 0.55)
        .onHover { hovering = $0 }
        .contextMenu {
            Button("Remove from Favourites") { state.toggleFavourite(ref) }
        }
        .help("\(ref.room.name) · \(ref.device.name)")
    }
}

/// A button that asks for a second click (within 3s) before acting.
struct ConfirmButton: View {
    let title: String
    let systemImage: String
    var tint: Color = brand
    let action: () -> Void
    @State private var armed = false

    var body: some View {
        Button {
            if armed {
                armed = false
                action()
            } else {
                armed = true
                Task {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    armed = false
                }
            }
        } label: {
            Label(armed ? "Confirm?" : title, systemImage: armed ? "checkmark" : systemImage)
                .font(.system(size: 11.5, weight: .semibold))
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .foregroundStyle(armed ? Color.white : tint)
                .background(Capsule().fill(armed ? Color.red : tint.opacity(0.13)))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// Wrapping layout for routine chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? 360
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
