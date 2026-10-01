import SwiftUI

/// Everything inside the menu bar popover.
struct PanelView: View {
    @EnvironmentObject var state: AppState

    static let size = CGSize(width: 380, height: 600)

    var body: some View {
        Group {
            if state.showingSettings {
                SettingsView()
            } else {
                switch state.phase {
                case .checking: CheckingView()
                case .unreachable(let notHub): UnreachableView(notHub: notHub)
                case .needsLogin: LoginView()
                case .ready: HomeView()
                }
            }
        }
        .frame(width: PanelView.size.width, height: PanelView.size.height)
        .overlay(alignment: .bottom) { ToastView().padding(.bottom, 38) }
    }
}

private struct CheckingView: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
            Text("Connecting to your home…").font(.system(size: 12.5)).foregroundStyle(.secondary)
            Text(state.client.host).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Shown whenever the hub can't be reached: it only lives on the home LAN, so
/// this is normal when away, and it should read that way.
private struct UnreachableView: View {
    @EnvironmentObject var state: AppState
    let notHub: Bool
    @State private var retrying = false

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            ZStack {
                Circle().fill(Color.orange.opacity(0.13)).frame(width: 74, height: 74)
                Image(systemName: notHub ? "questionmark.circle" : "wifi.exclamationmark")
                    .font(.system(size: 30, weight: .medium))
                    .foregroundStyle(.orange)
            }
            VStack(spacing: 6) {
                Text(notHub ? "That isn't your home hub" : "Can't reach your home")
                    .font(.system(size: 16, weight: .semibold))
                Text(notHub
                     ? "Something answered at \(state.client.host), but it isn't Chandrabindu. You may be on a different network."
                     : "Chandrabindu runs on your home network, so it only works when this Mac is on your home Wi-Fi. Connect to it and you're back in control.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 30)
            }
            HStack(spacing: 8) {
                Button {
                    retrying = true
                    Task {
                        await state.checkAndLoad()
                        retrying = false
                    }
                } label: {
                    HStack(spacing: 6) {
                        if retrying { ProgressView().controlSize(.small) }
                        Text("Try again")
                    }
                    .frame(minWidth: 90)
                }
                .buttonStyle(.borderedProminent)
                .tint(brand)
                .keyboardShortcut(.defaultAction)
                Button("Change address") { state.showingSettings = true }
            }
            .controlSize(.regular)
            VStack(spacing: 3) {
                Text("Looking for \(state.client.host)")
                    .font(.system(size: 10.5, design: .monospaced))
                    .foregroundStyle(.tertiary)
                Text("We'll reconnect by ourselves when your network changes.")
                    .font(.system(size: 10.5))
                    .foregroundStyle(.tertiary)
            }
            Spacer()
            HStack {
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
                    .buttonStyle(.plain)
                    .font(.system(size: 10.5))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }
}

private struct LoginView: View {
    @EnvironmentObject var state: AppState
    @State private var username = ""
    @State private var password = ""
    @FocusState private var focus: Field?
    private enum Field { case username, password }

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "house.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 58, height: 58)
                .background(RoundedRectangle(cornerRadius: 15).fill(brand.gradient))
            VStack(spacing: 3) {
                Text("Sign in to Chandrabindu").font(.system(size: 16, weight: .semibold))
                Text("Use the same account as the web app.").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            VStack(spacing: 8) {
                TextField("Username", text: $username)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.username)
                    .focused($focus, equals: .username)
                    .onSubmit { focus = .password }
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .onSubmit(submit)
                if let error = state.loginError {
                    Text(error).font(.system(size: 11)).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading)
                }
                Button(action: submit) {
                    HStack(spacing: 6) {
                        if state.signingIn { ProgressView().controlSize(.small) }
                        Text("Sign in").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(brand)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
                .disabled(username.isEmpty || password.isEmpty || state.signingIn)
            }
            .frame(width: 260)
            Spacer()
            HStack(spacing: 4) {
                Text(state.client.host).font(.system(size: 10.5, design: .monospaced)).foregroundStyle(.tertiary)
                Button("Change") { state.showingSettings = true }
                    .buttonStyle(.plain)
                    .font(.system(size: 10.5))
                    .foregroundStyle(brand)
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }
                    .buttonStyle(.plain)
                    .font(.system(size: 10.5))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .onAppear { focus = .username }
        .onReceive(NotificationCenter.default.publisher(for: .panelDidOpen)) { _ in
            focus = username.isEmpty ? .username : .password
        }
    }

    private func submit() {
        guard !username.isEmpty, !password.isEmpty, !state.signingIn else { return }
        let u = username.trimmingCharacters(in: .whitespaces)
        let p = password
        Task {
            await state.signIn(username: u, password: p)
            if state.session != nil { password = "" }
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @State private var address = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Button { state.showingSettings = false } label: {
                    Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
                Text("Settings").font(.system(size: 13.5, weight: .semibold))
                Spacer()
            }
            .padding(12)
            Divider().opacity(0.5)

            Form {
                Section("Home hub") {
                    HStack {
                        TextField("Address", text: $address, prompt: Text(AppState.defaultServer))
                            .textFieldStyle(.roundedBorder)
                            .onSubmit(save)
                        Button("Connect", action: save)
                            .disabled(HubClient.normalize(address) == state.serverAddress && state.phase == .ready)
                    }
                    Text("Your hub is only reachable on your home network.")
                        .font(.system(size: 10.5)).foregroundStyle(.secondary)
                }
                Section("General") {
                    Toggle("Open at login", isOn: Binding(get: { state.launchAtLogin },
                                                          set: { state.setLaunchAtLogin($0) }))
                    LabeledContent("Open this panel", value: "⌃⌥H")
                    Button("Open the full app…") { state.openFullApp() }
                }
                if let session = state.session {
                    Section("Account") {
                        LabeledContent("Signed in as", value: "\(session.username)\(session.isAdmin ? " (admin)" : "")")
                        Button("Sign out", role: .destructive) { state.signOut() }
                    }
                }
                Section {
                    Button("Quit Chandrabindu") { NSApp.terminate(nil) }
                }
            }
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
        }
        .onAppear { address = state.serverAddress }
    }

    private func save() {
        guard !address.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        state.changeServer(address)
    }
}

private struct ToastView: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        if let toast = state.toast {
            HStack(spacing: 6) {
                Image(systemName: toast.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .foregroundStyle(toast.isError ? Color.orange : Color.green)
                Text(toast.text).font(.system(size: 11.5)).lineLimit(2)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(Capsule().fill(.regularMaterial).shadow(color: .black.opacity(0.18), radius: 6, y: 2))
            .padding(.horizontal, 14)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .onTapGesture { state.toast = nil }
        }
    }
}
