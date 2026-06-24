# Chandrabindu Smart Home — Android Wrapper

A thin **Android** app that wraps the Chandrabindu web app (served from your home
hub) in a WebView.

## How it works
On launch (and whenever you tap **Try again**) the app:

1. Fetches `http://192.168.68.68/api/metadata`.
2. If that request fails, or the returned `name` isn't `"Chandrabindu Smart Home"`,
   it shows an error: *"Oops — can't find your home server. Make sure you're
   connected to your home Wi-Fi network and the hub is on."*
3. Otherwise it loads the full site at `http://192.168.68.68` inside a WebView.

The Android hardware **back** button navigates within the site; if the page goes
unreachable mid-session, it drops back to the error screen.

## Configuration
Edit [`config.ts`](./config.ts):

```ts
export const BASE_URL = "http://192.168.68.68";   // your hub's address
export const EXPECTED_NAME = "Chandrabindu Smart Home"; // must match /api/metadata
```

`EXPECTED_NAME` must equal the `name` field returned by the server endpoint at
[`app/api/metadata/route.ts`](../app/api/metadata/route.ts):

```json
{ "name": "Chandrabindu Smart Home", "description": "...", "version": "1.0.0" }
```

Plain-HTTP LAN traffic is allowed via the `expo-build-properties` plugin
(`usesCleartextTraffic: true`) in [`app.json`](./app.json).

## Run / test (no build)
```bash
cd mobile-app
npm install
npm start          # press "a" or scan the QR with Expo Go on Android
```

## Build the APK (EAS, cloud)
```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # produces an installable .apk
```
Download the APK from the URL EAS prints, transfer it to the phone, and install
(allow "install from unknown sources"). `--profile production` produces an
`.aab` for the Play Store instead.

## Note on `@babel/runtime`
`@babel/runtime` is pinned to `7.24.0` (via `dependencies` + `overrides`).
`react-native-webview` ships its TypeScript source, and newer `@babel/runtime`
(7.26+) versions have an `exports` map that Metro 0.80 / Expo SDK 51 mis-resolves
while transpiling it — pinning avoids the "Unable to resolve module
@babel/runtime/helpers/…" bundle failure.

### Local APK (needs JDK 17 + Android SDK)
```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```
