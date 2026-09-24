# Chandrabindu — mobile app

A native iOS/Android app (Expo + React Native) for the Chandrabindu smart home.
It talks to the hub's REST + Realtime API exactly like the web Sleek theme, minus
the admin/settings surface (those stay on the website).

**Features:** username/password login · rooms & live device control (switches,
fans, dimmers) · favourites · routines · automations (view) · insights (view) ·
hands-free **voice** (OpenAI Realtime over WebRTC).

## Configure

The hub address lives in [`.env`](.env):

```
EXPO_PUBLIC_SERVER_URL=http://192.168.68.68
```

Change it if your hub's LAN address differs. Your phone must be on the **same
Wi-Fi** as the hub. Plain-HTTP LAN is allowed (iOS ATS exception + Android
cleartext are set in `app.json`).

## Run it

Voice uses `react-native-webrtc`, a native module, so this app runs in a
**custom dev build / standalone build — not the stock Expo Go app.** Everything
else would work in Expo Go, but voice needs the native build.

### Option A — build locally (needs Xcode / Android Studio)

```bash
cd mobile-app
npm install
npx expo run:ios        # or: npx expo run:android
```

This prebuilds the native project, installs the app on a simulator/device, and
starts Metro with fast refresh.

### Option B — EAS build (no local native toolchain)

```bash
npm i -g eas-cli
eas login
eas build --profile development --platform ios     # or android
# install the resulting build on your phone, then:
npx expo start --dev-client
```

### Install on your phone for real use

```bash
eas build --profile preview --platform ios     # or android (produces an .apk)
```

Then sign in with your hub username and password.

## iOS 26 note

iOS 26 fatally requires apps to adopt the UIScene lifecycle, which the current
Expo/RN template doesn't do (it still creates the window in the app delegate) —
without the fix the app crashes at launch (`NoSceneLifecycleAdoption`) or shows a
black screen. [`plugins/withIOSSceneLifecycle.js`](plugins/withIOSSceneLifecycle.js)
is a config plugin (wired in `app.json`) that adds a `SceneDelegate` and the
Info.plist scene manifest. It applies automatically on `expo prebuild` /
`expo run:ios` — no manual step. Verified launching to the login screen on an
iPhone 18 Pro (iOS 26) simulator.

## Structure

```
src/
  config.ts          server URL from EXPO_PUBLIC_SERVER_URL
  api.ts             fetch wrapper — attaches the bearer token, typed errors
  auth.tsx           login + token (expo-secure-store), restores session on launch
  tokenStore.ts      in-memory + persisted bearer token
  queries.ts         React Query hooks (rooms, status polling, favourites, routines, …)
  types.ts           shapes mirrored from the server
  theme.ts           light/dark palette
  lib/format.ts      on/off + value labels, favKey
  components/        ControlTile (Boolean/Enum/Integer, protected gray-out), ui bits
  voice/             useRealtimeVoice — WebRTC + Realtime tool loop
  screens/           Login, Rooms, RoomDetail, Favourites, Routines, Voice, More, Automations, Insights
App.tsx              providers + tab/stack navigation
```

Live status is polled via `POST /api/voice/status` (one request for many
devices) rather than SSE. Auth is a bearer token from `/api/auth/login`, stored
encrypted in SecureStore and sent on every request. Protected controls are
enforced **server-side**; the app also greys them out.
