import AppKit
import Carbon
import Combine
import SwiftUI

@main
enum ChandrabinduBarMain {
    @MainActor private static var delegate: AppDelegate?

    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        self.delegate = delegate
        app.delegate = delegate
        app.setActivationPolicy(.accessory) // menu bar only, no Dock icon
        app.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate {
    let state = AppState()
    private var statusItem: NSStatusItem?
    private let popover = NSPopover()
    private var cancellables = Set<AnyCancellable>()
    private var hotKey: HotKey?
    private var fullApp: FullAppWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = AppDelegate.makeMainMenu()
        if let snapshot = Snapshot.fromArguments() {
            snapshot.run(state: state)
            return
        }

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.target = self
        item.button?.action = #selector(togglePanel)
        item.button?.imagePosition = .imageLeading
        statusItem = item

        popover.behavior = .transient
        popover.contentSize = PanelView.size
        popover.delegate = self
        popover.contentViewController = NSHostingController(rootView: PanelView().environmentObject(state))

        state.openFullApp = { [weak self] in self?.openFullApp() }
        state.objectWillChange
            .debounce(for: .milliseconds(80), scheduler: RunLoop.main)
            .sink { [weak self] _ in self?.refreshStatusItem() }
            .store(in: &cancellables)
        refreshStatusItem()

        // ⌃⌥H toggles the panel from anywhere: keyboard-only control in two keystrokes.
        hotKey = HotKey(keyCode: kVK_ANSI_H, modifiers: controlKey | optionKey) { [weak self] in
            self?.togglePanel()
        }
        state.start()
    }

    /// Menu bar glyph + the number of switches on (glanceable, zero clicks).
    private func refreshStatusItem() {
        guard let button = statusItem?.button else { return }
        let ready = state.phase == .ready
        let symbol = state.appLocked ? "lock.fill" : (ready && state.onCount > 0 ? "house.fill" : "house")
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: "Chandrabindu")?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 13.5, weight: .semibold))
        image?.isTemplate = true
        button.image = image
        let count = state.onCount
        let showCount = ready && state.statusKnown && count > 0 && !state.appLocked
        button.attributedTitle = NSAttributedString(
            string: showCount ? " \(count)" : "",
            attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: 12.5, weight: .semibold)])
        button.appearsDisabled = !ready
        switch state.phase {
        case .ready:
            button.toolTip = state.appLocked ? "\(state.houseName): app is locked"
                : "\(state.houseName): \(count) switch\(count == 1 ? "" : "es") on"
        case .unreachable: button.toolTip = "Chandrabindu: not on your home network"
        case .needsLogin: button.toolTip = "Chandrabindu: sign in"
        case .checking: button.toolTip = "Chandrabindu: connecting…"
        }
    }

    @objc func togglePanel() {
        if popover.isShown {
            popover.performClose(nil)
            return
        }
        guard let button = statusItem?.button else { return }
        NSApp.activate()
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        popover.contentViewController?.view.window?.makeKey()
        state.panelOpened()
    }

    func popoverDidClose(_ notification: Notification) {
        state.panelClosed()
    }

    func openFullApp() {
        popover.performClose(nil)
        if fullApp == nil {
            let controller = FullAppWindowController(base: state.client.base, token: state.session?.token,
                                                     title: state.houseName)
            controller.onClose = { [weak self] in
                self?.fullApp = nil
                NSApp.setActivationPolicy(.accessory)
            }
            fullApp = controller
        }
        // A real app while the window is open, so it shows up in ⌘Tab and the Dock.
        NSApp.setActivationPolicy(.regular)
        NSApp.activate()
        fullApp?.showWindow(nil)
        fullApp?.window?.makeKeyAndOrderFront(nil)
    }

    @objc func reloadFullApp() { fullApp?.reload() }

    /// Hidden for an accessory app, but its key equivalents are what make
    /// ⌘C / ⌘V / ⌘A work in the panel's text fields and the web window.
    private static func makeMainMenu() -> NSMenu {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Chandrabindu", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let windowItem = NSMenuItem()
        let window = NSMenu(title: "Window")
        window.addItem(withTitle: "Reload", action: #selector(AppDelegate.reloadFullApp), keyEquivalent: "r")
        window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        window.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = window
        main.addItem(windowItem)
        return main
    }
}

/// `--snapshot <file.png>`: render the panel offscreen and save it, then quit.
/// The app draws its own view, so this needs no Screen Recording permission.
/// Options: --delay <s>, --appearance light|dark, --expand <room,room>,
/// --query <text>, --settings. A token in CHANDRABINDU_TOKEN signs in for the
/// run only (never written to the Keychain).
@MainActor
struct Snapshot {
    let path: String
    let delay: Double
    let appearance: String?
    let expand: [String]
    let query: String?
    let settings: Bool

    static func fromArguments() -> Snapshot? {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count else { return nil }
        func value(_ flag: String) -> String? {
            guard let j = args.firstIndex(of: flag), j + 1 < args.count else { return nil }
            return args[j + 1]
        }
        return Snapshot(path: args[i + 1],
                        delay: Double(value("--delay") ?? "") ?? 6,
                        appearance: value("--appearance"),
                        expand: value("--expand")?.split(separator: ",").map(String.init) ?? [],
                        query: value("--query"),
                        settings: args.contains("--settings"))
    }

    func run(state: AppState) {
        let env = ProcessInfo.processInfo.environment
        if let token = env["CHANDRABINDU_TOKEN"] {
            state.useEphemeralSession(token: token, username: env["CHANDRABINDU_USER"] ?? "admin",
                                      role: env["CHANDRABINDU_ROLE"] ?? "admin")
        } else {
            state.disableKeychain()
        }
        state.start()

        let host = NSHostingView(rootView: PanelView().environmentObject(state)
            .background(Color(nsColor: .windowBackgroundColor)))
        host.frame = NSRect(origin: .zero, size: PanelView.size)
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        if let appearance {
            window.appearance = NSAppearance(named: appearance == "dark" ? .darkAqua : .aqua)
        }
        window.setFrameOrigin(NSPoint(x: -6000, y: -6000))
        window.orderFrontRegardless()

        let expand = self.expand
        let query = self.query
        let settings = self.settings
        let delay = self.delay
        let path = self.path
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(delay * 0.6 * 1_000_000_000))
            if !expand.isEmpty {
                state.expandedRooms = Set(state.rooms.filter { room in
                    expand.contains { room.name.lowercased().contains($0.lowercased()) }
                }.map(\.id))
            }
            if let query { state.query = query }
            if settings { state.showingSettings = true }
            try? await Task.sleep(nanoseconds: UInt64(delay * 0.4 * 1_000_000_000))
            host.layoutSubtreeIfNeeded()
            guard let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { exit(2) }
            host.cacheDisplay(in: host.bounds, to: rep)
            guard let png = rep.representation(using: .png, properties: [:]) else { exit(3) }
            do {
                try png.write(to: URL(fileURLWithPath: path))
                print("snapshot: \(path)")
                exit(0)
            } catch {
                exit(4)
            }
        }
    }
}
