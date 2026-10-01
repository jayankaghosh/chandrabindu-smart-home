# Chandrabindu for Android

A native Android client (Kotlin, Jetpack Compose, Material 3) for the Chandrabindu
hub. Like the macOS menu bar app, it's built for **speed**. The best path is
controlling the house **without opening the app at all**.

| Task | Cost |
|------|------|
| See how many switches are on | 0 taps (home-screen widget, or the "All off" tile subtitle) |
| Toggle a favourite | 1 tap on the widget, a Quick Settings tile, or Device controls |
| Set a fan level or dimmer without opening the app | Drag its Device control (fan levels snap to Off/Low/Med/High/Max) |
| Toggle any switch | 1 tap in Device controls (power menu / shade, works from the lock screen) |
| Everything off | 2 taps (the "All off" tile, then confirm) |
| In the app: a favourite or a routine | 1 tap from the home grid's section |
| In the app: All off / All on | 2 taps on the floating power button, then confirm |

## Surfaces

- **Device controls** (Android 11+). Android's built-in smart-home panel. House =
  structure, room = zone, control = title, panel = subtitle. Switches are toggles,
  dimmers and fan regulators are sliders (fan levels snap to the nearest option, and a
  tap turns a fan off or back to its last level). Updates are live. Protected
  switches, panel button locks, the super-protected "lifeline" switch, locked rooms
  and Bluetooth panels are left out on purpose. Use the app for those.
- **Quick Settings tiles**. "All off" (asks before acting; the subtitle shows how
  many are on), plus **three favourite tiles**. By default they follow your first
  three favourites. Pick specific controls in the app under Settings, Quick Settings
  tiles. Each tile shows on/off, the control name and its room.
- **Home-screen widget**. "N on" plus your favourites as one-tap toggles (one column
  when narrow, two when wide). Protected or locked favourites open the app instead.
- **The app**: a native Compose copy of the web app's **Sleek** mobile view, in light
  and dark, over the hub's own background photo (`/background/sleek.jpg`, falling back to
  `/background.jpg`) and logo (`/logo.png`), cached so they show while away.
  - Home: greeting and house name, sun/moon theme toggle (defaults to the system,
    remembered), settings, log out, the "N on" pill, and the section tiles
    (Favourites, Rooms, Routines, Automations, Shortcuts, Switch Groups, Usage, Insights).
  - Inner screens have Back / title / theme / Home, and slide like the web's nav stack
    (the stack is restored on relaunch).
  - Rooms: cards with "N on" badges. A room: switcher pills with on-count badges,
    per-panel sections with the "Buttons locked/unlocked" pill (admins toggle), and the
    web's control tiles (lit gradient per kind, white in dark mode, fan levels as
    segments, dimmer sliders that send on release, favourite star, switch-group link).
  - Routines and Shortcuts run with the result inline ("Conditions not met" when a
    shortcut's IF fails), automations show IF/THEN with an admin enable toggle, switch
    groups are listed read-only, Usage shows on/off time and toggles per switch over a
    range, and Insights loads or generates the AI report.
  - Everywhere: the All On / All Off button (bottom-left, with a confirm), the AI
    assistant (bottom-right, when the hub has AI on; proposed actions need your OK),
    the protected-off popup on launch, the app-lock overlay and the setup gate.
  - The gear opens the app's own settings (hub address, appearance, Quick Settings tile
    bindings, account, a link to the full web app for building routines, automations
    and groups).

The app follows the web app's rules, and the hub enforces them anyway. Protected
controls are admin-only and need a second tap. The lifeline switch shows "Always
on". Locked rooms ask for their password. The panel lock pill ("Buttons
locked/free") is admin-only. The app lock banner (admins can Unlock) and the setup
gate pause all control.

Updates are **live** over the hub's event stream when the device gateway runs.
Without it, the app reads states when it opens and every 20 seconds while it's on
screen, and never in the background.

## Away from home

The hub only answers on the home Wi-Fi. When it can't be reached, the app says so
plainly ("Can't reach your home"), not as an error. It retries every 20 seconds
while on screen and immediately when the phone joins a network. The widget, tiles
and controls show "Away from home" instead of failing.

## Install

1. Get `build/Chandrabindu.apk` (build it below, or copy it from whoever built it).
2. Either:
   - **Sideload.** Copy the APK to the phone and open it. Android asks once to allow
     "Install unknown apps" for your file manager or browser. Allow it and install.
   - **adb.** With USB debugging on: `adb install -r build/Chandrabindu.apk`.
3. Open Chandrabindu. If your hub isn't at `http://192.168.68.68`, tap **Change
   address**. Sign in with your web app account.

Then add the shortcuts you want (each one is a one-time setup):

- **Device controls.** Hold power (or open Quick Settings, then Device controls), add
  controls, choose Chandrabindu and tick your switches. To use them without
  unlocking, turn on "Control from locked device" (Android 12+:
  Settings, Display, Lock screen).
- **Quick Settings tiles.** Swipe the shade down twice, tap the pencil, and drag in
  "All off", "Favourite 1", "Favourite 2" and "Favourite 3".
- **Widget.** Long-press the home screen, then Widgets, Chandrabindu.

## Build

Requirements: JDK 21 and the Android SDK (platform 36, build-tools). The script
looks for JDK 21 under Homebrew or `/usr/libexec/java_home`, and for the SDK at
`$ANDROID_HOME` (default `/opt/homebrew/share/android-commandlinetools`).

```bash
cd experiences/android-app
scripts/build-apk.sh        # -> build/Chandrabindu.apk (signed release)
```

### The signing key: keep it

The first run creates a release keystore in `keystore/`, with a random password in
`keystore/keystore.properties`. Both are gitignored and never committed. **Back up
the whole `keystore/` folder** (a password manager or an encrypted drive). Android
only installs an update over the existing app if it's signed with the same key. If
the key is lost, you have to uninstall first, which also removes its tiles, Device
controls and widget, and you sign in again.

## Code map

| Path | Role |
|------|------|
| `data/HubClient.kt` | OkHttp REST (Bearer token, persisted cookie jar) and the `/api/events` SSE stream |
| `data/HomeRepository.kt` | All state and actions, shared by every surface: reachability, sign-in, loading, live events, polling fallback, commands |
| `data/HomeState.kt` | Immutable state plus derived rules (blocks, counts, search, favourites, tile bindings) |
| `data/Models.kt`, `data/Controls.kt` | Hub types and control semantics (mirror the web app and the macOS app) |
| `data/Storage.kt` | Keystore-encrypted token and cookies, plain prefs (address, tile choices, a names-only cache) |
| `ui/sleek/` | The Sleek screens (port of `components/sleek/`): style tokens, backdrop, nav, tiles, rooms, lists, usage, insights, assistant, overlays, settings; `Lucide.kt` is generated from lucide-react so icons match the web |
| `ui/` | `MainActivity` (theme + routing) and the full-app WebView |
| `data/SleekApi.kt` | Endpoints only the Sleek screens use (shortcuts, switch groups, usage, insights, assistant, setup gate) |
| `controls/HomeControlsService.kt` | Device controls provider |
| `tiles/Tiles.kt` | Quick Settings tiles |
| `widget/HomeWidget.kt` | Glance widget |
