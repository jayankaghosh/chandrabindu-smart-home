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
| In the app: favourite / routine / room off | 1 tap |
| In the app: All off / All on | 2 taps (tap, then confirm) |
| In the app: find anything | Type a few letters in search, tap the result |

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
- **The app**. Header with Live/Updated status, search (rooms, panels, controls,
  routines), favourite tiles, routine chips with an inline result, rooms that
  expand in place with a one-tap "room off", fan levels as segments, dimmer
  sliders that send on release, and automations (admins can switch them on and
  off). Long-press any control to add or remove it from Favourites. The open-in-new
  icon opens the **full web app**, already signed in.

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
| `ui/` | Compose screens: home panel, controls, unreachable, sign-in, settings, full-app WebView |
| `controls/HomeControlsService.kt` | Device controls provider |
| `tiles/Tiles.kt` | Quick Settings tiles |
| `widget/HomeWidget.kt` | Glance widget |
