# Chandrabindu for macOS (menu bar app)

A native menu bar client for the Chandrabindu hub. It lives in the top bar and is
built for **speed**: the glance, the open and the toggle should each cost as
little as possible.

| Task | Cost |
|------|------|
| See how many switches are on | 0 clicks (the count sits next to the icon) |
| Open the panel | 1 click, or **⌃⌥H** from any app |
| Toggle a switch / fan level by keyboard | ⌃⌥H, type a few letters, **Return** |
| Toggle a favourite / run a routine | 1 click |
| Turn a whole room off | 1 click (power button on the room row) |
| Everything off / on | 2 clicks (click, then confirm) |

## What's in the panel

- **Search** (focused the moment the panel opens): matches rooms, panels,
  controls and routines. ↑/↓ move, Return toggles a switch, steps a fan, flips a
  dimmer, or runs a routine.
- **Favourites**: your starred controls as one-click tiles (right-click any
  control to add or remove).
- **Routines**: one-click chips with the result shown inline.
- **Rooms**: expand inline (no page changes), with switches, fan levels as
  one-click segments and dimmer sliders. Each panel shows its **physical button
  lock** (admins can toggle it).
- **Automations**: enable or disable (admin).
- **All off / All on**, with a confirm click.
- **Open the full app** (window icon): the complete web app in a native window,
  already signed in, for builders, switch groups, usage, insights, screensaver,
  voice and settings. File uploads, downloads (backups) and confirm dialogs work.

The app follows the same rules as the web UI and the hub enforces them anyway:
protected controls are admin-only (with a confirm click), the super-protected
lifeline switch is shown as "Always on", locked rooms ask for their password,
and the app lock and the setup gate pause all control.

Updates are **live** when the hub runs the device gateway (SSE). Without it the
panel reads device states when you open it and every 20 seconds while it's open.

## Away from home

The hub is only reachable on the home LAN. When it can't be reached the panel
says so plainly ("Can't reach your home") instead of erroring, the menu bar icon
dims, and the app reconnects by itself when the network changes or the Mac
wakes. If something else answers at the address, it says that isn't your hub.

## Build and install

Requires macOS 14+ and the Xcode command line tools.

```bash
cd experiences/macos-app
scripts/build-app.sh            # -> build/Chandrabindu.app
scripts/build-app.sh --install  # also copies it to ~/Applications and opens it
```

The first launch asks to **find devices on your local network**: allow it, or
the app can't talk to the hub. Sign in with your web app account. Turn on
**Open at login** in the panel's settings to keep it in the menu bar.

Settings (gear icon): hub address (default `http://192.168.68.68`), open at
login, sign out.

### Notes

- The session token is stored in the login **Keychain**. Builds are ad-hoc
  signed unless `CODESIGN_IDENTITY` is set, so after a rebuild macOS may ask once
  to let the new build read it ("Always Allow").
- `--snapshot <file.png>` renders the panel offscreen and quits (used to check
  the UI without screen recording). Extra flags: `--delay`, `--appearance
  light|dark`, `--expand <room>`, `--query <text>`, `--settings`, and
  `-serverURL <url>` to point at another hub for that run.

## Code map

| File | Role |
|------|------|
| `AppDelegate.swift` | Entry point, status item, popover, ⌃⌥H hotkey, full-app window, snapshot mode |
| `AppState.swift` | All state + actions: reachability, sign-in, loading, live events, polling fallback, commands |
| `HubClient.swift` | REST (Bearer token) + the `/api/events` SSE stream |
| `Models.swift` / `Controls.swift` | Hub types and control semantics (mirror `lib/types.ts`, `labels.ts`, `icons.ts`, `panelLock.ts`) |
| `FullAppWindow.swift` | WKWebView window with the session cookie, downloads, file pickers, dialogs |
| `Views/` | Panel, home sections, control rows, unreachable / sign-in / settings screens |
