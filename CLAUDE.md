# CLAUDE.md — Chandrabindu Smart Home knowledge base

Reference for AI agents working on this repo. Read this first. It documents what
exists, how the pieces fit, and the non-obvious constraints that will bite you.

---

## 1. What this is

A **local-first** smart-home app that controls Tuya / SmartLife Wi-Fi devices
(switches, fans, dimmers) **directly over the LAN** via [tuyapi](https://github.com/codetheweb/tuyapi).
The Tuya cloud is used **only once**, during onboarding, to discover devices,
rooms and per-device local keys. After that, day-to-day control is 100% local —
no cloud dependency.

The house it runs is "Chandrabindu" (~15 physical devices across ~10 rooms). It
is deployed on a home hub (referenced as `192.168.68.68` in several places) and
accessed from phones/tablets on the same Wi-Fi.

**Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Tailwind ·
lucide-react · framer-motion · tuyapi · OpenRouter SDK (LLM + audio).

There is **no database**. All state is JSON files under `data/` (gitignored),
read/written with synchronous or promise `fs`. This is deliberate — a
single-hub, single-house deployment.

---

## 2. Sub-projects (each is its own npm package)

| Path | What | Runtime |
|------|------|---------|
| `/` (root) | The Next.js web app — the whole UI + REST API | Next 14 |
| `device-gateway/` | Daemon owning one persistent LAN connection per device | Node (CommonJS) |
| `telegram-bot/` | Standalone grammY bot controlling the house via the REST API | tsx/ESM |
| `mobile-app/` | Thin Expo/React-Native Android WebView wrapper around the hub | Expo 51 |

The web app is the source of truth. The gateway, bot, and mobile app are all
**optional** satellites that talk to it (or, for the gateway, that the app talks
to). Everything degrades gracefully if a satellite is absent.

---

## 3. Local device control — the core, and its constraints

### The hard constraint: Tuya allows ONE local client per device
A Tuya panel accepts a single LAN client at a time and is flaky about freeing
that slot. Two consequences that shaped the whole architecture:

- Holding keep-alive connections leaks dead sockets until the device stops
  answering.
- Two things connecting at once → contention → connect-then-instant-disconnect
  (the classic "disconnects a few ms after connecting" symptom).

### Two control paths

**A) `lib/local.ts` — ephemeral connections (default / fallback).**
Each read or command opens a tuyapi connection, runs, and disconnects
immediately. Per-device serialization (`queues` map) guarantees at most one
short-lived connection per device at a time. Caches: `ipCache` (skip UDP
discovery), `confirmedVersion` (once a device answers at a protocol version, stop
cycling `["3.4","3.3","3.5","3.1"]`). Cold start across many devices is slow
(~20s) — hence the heartbeat (§8) to keep caches warm.

**B) `device-gateway/` — one persistent connection per device (opt-in, preferred).**
When `GATEWAY_URL` is set, `lib/local.ts` routes status reads + commands through
the gateway via `lib/gateway.ts`. The gateway becomes the **sole** local client
per device: no contention, warm-cache reads (~5–10ms vs ~20s cold), and — its
reason for existing — **real-time change events** (see §7). If the gateway is
unreachable, `lib/gateway.ts` throws `GatewayUnavailable` and callers fall back
to direct ephemeral connections. A down gateway holds no connections, so the
fallback can't contend with it. `lib/gateway.ts` has a 15s circuit breaker
(`downUntil`) so a dead gateway doesn't add a timeout to every request.

> **Key operational gotcha:** the app only uses the gateway if `GATEWAY_URL` is
> exported in the app's environment. A common "still polling / not instant"
> report = gateway is running but the app process doesn't have `GATEWAY_URL`
> set, so it's silently using the direct path.

---

## 4. The device gateway daemon (`device-gateway/`)

CommonJS, no build step (`npm start` → `node src/index.js`). Files:

- `src/index.js` — entry: starts `Gateway`, `RuleEngine`, and the HTTP server.
  Port `GATEWAY_PORT` (default 4000), host `GATEWAY_HOST` (default `127.0.0.1`,
  localhost-only).
- `src/catalog.js` — loads devices from the app's `data/catalog.json`.
- `src/connection.js` — **`DeviceConnection`**: one persistent, self-healing
  socket per device. Version detection (verified by a real `get()`), reconnect
  with backoff, live status cache (`code -> value`), emits `change` on proactive
  dp-refresh (the automation signal) and `state` on connect/disconnect. Serves
  `get()`/`set()` over the same socket (serialized). Always disconnects cleanly.
- `src/gateway.js` — **`Gateway`**: owns one `DeviceConnection` per catalog
  device; aggregates all `change`/`state` events; exposes status/command;
  `reinit()` tears down and respawns all connections. Skips devices without a
  valid 16-char key.
- `src/server.js` — localhost HTTP API the app calls. Endpoints: status read,
  command, `/events` (SSE: `snapshot` on connect + `change`/`state`), `/reinit`.
  Auth: optional `GATEWAY_SECRET` via `x-gateway-secret` header. Sends an SSE
  keepalive comment every 20s (beats nginx's 60s read timeout).
- `src/rules.js` — **`RuleEngine`**: watches `data/automations.json`, evaluates
  rules against live status caches on every real state change. **Edge-triggered**
  (fires on false→true, not repeatedly), **primed to current state on load** (so
  saving an already-true rule does NOT retro-fire), per-rule cooldown (3s),
  and **never auto-actuates protected controls** (reads `data/config.json`).
- `src/protect.js` — **`ProtectedGuard`**: when `config.json#autoRestoreProtected`
  is on, turns a protected control back ON the moment it goes off (any source),
  logs `PROTECT_RESTORE` to the app's `logs/`. Cooldown + circuit breaker so it
  never fights a stuck device; watches `config.json` (live enable/disable). See §8.

App-side glue: `lib/gateway.ts` (client), `app/api/events/route.ts` (SSE proxy
to the browser), `app/api/gateway/route.ts` + `app/api/gateway/reinit/route.ts`
(status + the Settings "Re-initialize" button).

---

## 5. Data directory (`data/`, gitignored — the entire app state)

| File / dir | Contents | Written by |
|------------|----------|------------|
| `config.json` | Admin `passwordHash`/`Salt`, auto-generated `sessionSecret`, `houseName`, `users[]` (standard users), room locks, Tuya creds, insights model, **protected controls**, `location` (lat/lng), app `locked`+`lockInfo`, `loopGuard` thresholds | onboarding, Settings, `lib/config.ts` (+ gateway `loopguard.js` writes `locked`) |
| `catalog.json` | Synced device catalog: `rooms[]` + `devices[]` (id, **key**, version, category, cloudName, functions with dpId/type/name/range) | cloud sync, `lib/store.ts` |
| `overrides.json` | Local edits that survive re-sync: `deviceRoom`, `deviceName`, `roomName`, `controlName`, `extraRooms` | Settings/rename, `lib/store.ts` |
| `automations.json` | `automations[]` (match all/any, conditions[] incl. time/sun triggers, actions[] incl. run-routine) | web UI, `lib/automations.ts` |
| `switchGroups.json` | `groups[]` (name + member switches kept in sync) | web UI, `lib/switchGroups.ts` |
| `suntimes.json` / `automationFired.json` | Cached daily sun times / per-trigger fired dates | `lib/sunTimes.ts`, `lib/automationScheduler.ts` |
| `history/YYYY-MM-DD.jsonl` | Boolean on/off transitions `{deviceId,code,value,at}` for the Usage report | **gateway** `device-gateway/src/history.js` |
| `screensaver/<id>.<ext>` | Admin-uploaded screensaver images | `/api/screensaver/images` |
| `routines.json` | Routines (named lists of actions) | web UI, `lib/store.ts` |
| `favourites/<username>.json` | Per-user starred controls (`{deviceId, code}[]`) | `lib/favourites.ts` |
| `insights/<days>d_<date>.json` | Cached LLM insight reports | `lib/insights.ts` |
| `pairing.json` | Short-lived pairing codes | `lib/pairing.ts` |
| `chatbot/memory` | Assistant long-term memory | `lib/chatMemory.ts` |

`catalog.json` holds **secret local keys** — never commit, never log, never send
off-device. `config.json` holds password hashes and the session-signing secret.

---

## 6. Auth model (`lib/auth.ts` + `lib/config.ts`)

- **Cookie:** `shc_session` = a standard **HS256 JWT** (`base64url(header).
  base64url(payload).base64url(sig)`) with claims `{sub, role, cs, iat, exp}`,
  signed with `sessionSecret`. **1-year lifetime** (`exp` + cookie `maxAge`,
  `SESSION_MAX_AGE`). `cs` is a credential stamp = `sha256(passwordHash).slice(0,16)`,
  so changing/deleting the account's password invalidates outstanding tokens.
  Because `sessionSecret` is persisted on disk (never regenerated on boot),
  sessions survive server restarts. Legacy `base64url(payload).hex(hmac)` tokens
  (payload `{u,r,t,cs}`) are still accepted by `readSessionToken` for a seamless
  upgrade. Also accepts `Authorization: Bearer <token>` (bot + paired devices).
- **`isSecureRequest()`** decides the cookie `secure` flag from
  `x-forwarded-proto` / URL protocol — **not** from `NODE_ENV` (a `secure`
  cookie over plain-HTTP LAN would be dropped by the browser).
- **Roles:** `admin` (the onboarding superadmin, reserved username `admin`,
  read+write+manage) and `user` (standard users added by admin; read + execute
  only). Guards: `guard()` (any session) and `guard({ admin: true })`.
- **Room locks:** admins can password-lock a room; unlocks are recorded
  per-session in the `shc_unlocks` cookie.
- **Pairing (`lib/pairing.ts`):** a signed-in user mints a 6-digit code
  (`POST /api/pairing/code`); an external client exchanges it for a session
  token (`POST /api/pairing/token`). Single-use, 5-min TTL. This is how the
  Telegram bot (and future TV/POS clients) authenticate **without ever seeing a
  password**.

---

## 7. Real-time updates (SSE)

`components/useHomeData.ts` (Sleek) and the Classic `Dashboard` both open an
`EventSource("/api/events")`. That route proxies the gateway's SSE stream:
`snapshot` (full state on connect) → sets `live=true`; `change` (a dp value
changed) and `state` (device connect/disconnect) patch `statusByDevice`. When
`live` is false (no gateway), a **20s polling fallback** kicks in per device.
Result: a switch toggled by one user (or physically) reflects on all clients in
real time when the gateway is up.

---

## 8. Feature reference

- **Favourites** (`lib/favourites.ts`, `/api/favourites`, `components/Favourites.tsx`,
  `SleekFavourites.tsx`): per-user starred individual controls. Toggled via a
  long-press / right-click **context menu** ("Change state" + "Add/Remove
  favourite"), not a persistent star. `favKey.ts` builds the `deviceId:code` key.
- **Routines** (`routines.json`, `/api/routines`, `Routines.tsx`,
  `SleekRoutines.tsx`): named lists of actions run in one tap (`/api/routines/[id]/run`).
- **Automations** (`lib/automations.ts`, `/api/automations`, `Automations.tsx`,
  `SleekAutomations.tsx`): admin-authored IF/THEN rules (conditions with
  AND/OR = match all/any; actions set on/off/fan values). Non-admins can view.
  Conditions have a `type` (`AutomationCondition` in `lib/types.ts`):
  - `device` (default; also matches legacy rules with no `type`) — a device
    control equals a value. A **guard** ("IF"). **Executed by the gateway's
    `RuleEngine`** on device-change edges, as before.
  - `time` (`{time:"HH:MM"}`) and `sun` (`{event, offsetMin}`) — **triggers**
    ("WHEN"), fired once/day by the **app-side scheduler**
    (`lib/automationScheduler.ts`), NOT the gateway. A rule reads as "WHEN a
    trigger is due, IF the device guards pass (per match), THEN run actions".
  - **Ownership split (no double-fire):** any rule that contains a trigger is
    evaluated solely by the app scheduler; `device-gateway/src/rules.js`
    `loadAutomations()` skips those rules. Device-only rules stay in the gateway.
- **Automation scheduler** (`lib/automationScheduler.ts`): an in-process 30s
  loop started once per server from `app/layout.tsx` (a Node server component —
  NOT via `instrumentation.ts`, whose Edge compile can't resolve `crypto`/`net`).
  Each tick fires due time/sun triggers, checks guards via `getStatusLocal`, and
  runs actions with `setCommandLocal` (skipping protected controls, like the
  gateway). Fired-state is persisted to `data/automationFired.json` so a restart
  within a trigger's 5-min grace window doesn't re-fire. Sun times come from
  `lib/sunTimes.ts` (fetches `api.sunrisesunset.io` once/day using the config
  `location` lat/lng, cached to `data/suntimes.json`; no location → sun triggers
  are skipped). Location is set in Settings → **Location** (`/api/location`,
  `getLatLng`/`setLatLng` in `lib/config.ts`).
- **Insights** (`lib/insights.ts`, `/api/insights`, `Insights.tsx`): feeds
  recent action logs (`logs/`) to an LLM via OpenRouter, caches per timeframe.
  On-demand, not real-time. Default model `qwen/qwen3-coder:free`.
- **AI Assistant** (`lib/chat.ts`, `/api/ai/chat`, `Assistant.tsx`): NL Q&A about
  the home + translates requests into validated device actions the UI confirms
  before running. Has long-term memory (see below).
- **Shared assistant memory** (`lib/chatMemory.ts`) — **one store used by both
  the chat and voice agents**, two tiers:
  - **Personal** — `data/chatbot/memory/<username>.json`, private to that user.
  - **Core (house)** — `data/chatbot/core-memory.json`, read by *every* user's
    agent. **Only the superadmin writes it, and only on explicit intent**
    (`scope:"core"` — "remember for everyone / in core memory"). A non-admin's
    core request is **downgraded to personal server-side** in `applyMemoryUpdate`.
  Everyone reads core + their own personal. The model proposes
  `memory.{add,remove,scope}` (chat, in its JSON) or calls the `remember` tool
  (voice → `POST /api/voice/memory`); both route through the same
  `applyMemoryUpdate(username, update, {isAdmin})`. Existing `admin.json` stays
  the admin's personal memory (no migration; core starts empty).
- **Run-routine automation action** (`lib/types.ts` `RunRoutineAction`): a THEN
  action can be `{type:"routine", routineId}` instead of a device set. Executed
  by both evaluators — the app scheduler via `lib/runRoutine.ts` (`runRoutineActions`,
  session-less, skips protected, honors delays) and the gateway `RuleEngine.runRoutine()`
  (loads `routines.json`). Authored via a Device/Routine toggle in both builders.
- **Switch Groups** (`lib/switchGroups.ts`, `data/switchGroups.json`,
  `/api/switch-groups`, `components/sleek/SleekSwitchGroups.tsx`): named sets of
  Boolean switches kept in sync — any member on → all on, any off → all off.
  Synced by the **gateway** `GroupSyncEngine` (`device-gateway/src/groups.js`) on
  the `change` stream; loop-safe because it only commands a member whose cached
  value differs from the target (the fan-out self-terminates), and skips protected
  members. Sleek-only authoring (admin + Edit Mode), a home section + `switchGroups`
  screen.
- **Loop-protection kill switch / app lock** (`config.json#locked`+`lockInfo`,
  `device-gateway/src/loopguard.js`, `components/LockedOverlay.tsx`,
  `/api/lock`, `/api/loop-guard`): the gateway `LoopGuard` counts real toggles per
  switch in a sliding window; if one switch toggles more than `maxToggles` times
  within `windowSec` seconds (config `loopGuard`, **default 20/20**, set in
  Settings → Loop protection), it **TRIPS**: writes `locked:true` to `config.json`
  (read-merge-write), emits a `lock` SSE event, logs `LOOP_LOCK`. On trip it does
  **NOT** touch devices — it just halts. Enforcement: the gateway's
  `gateway.command()` refuses while `gateway.locked`, and the app's single choke
  point `setCommandLocal()` throws `AppLockedError` (blocks manual/routines/voice/
  AI/scheduler at once → `/api/rooms` also returns `locked`). Every client shows the
  non-dismissible `LockedOverlay` ("APP IS LOCKED", polls `/api/lock`); **admins get
  Unlock** (`PUT /api/lock {locked:false}`), which the gateway sees via its config
  watch and resets its counters. Getters/setters: `isAppLocked`/`setAppLocked`/
  `getLockInfo`, `getLoopGuard`/`setLoopGuard` in `lib/config.ts`.
- **Master on/off** (`/api/master`, `components/sleek/SleekMasterControl.tsx`): a
  persistent floating power button on **every** Sleek screen (rendered in
  `SleekApp` outside the screen switch) → expands to **All On / All Off**, each
  behind a confirm dialog. The endpoint enumerates every controllable Boolean via
  `getModel`, **skips protected + Bluetooth + locked rooms**, and `setCommandLocal`s
  each (master-off leaves protected on). Blocked by the app lock like any command.
- **Usage report** (`/api/usage`, `lib/history.ts`, `components/sleek/SleekUsage.tsx`,
  Sleek "Usage" section): per-control **on-duration / off-duration / toggle count**
  over a range (1h/3h/12h/1d/3d/7d/custom), grouped by room. Data is the **gateway's**
  history store (`data/history/*.jsonl`, written by `device-gateway/src/history.js`
  from the `change` stream — Boolean only, **forward-only**, needs the gateway
  running). `aggregateUsage(from,to)` reconstructs intervals; the state before the
  first in-window event is inferred as the opposite of that event's value.
- **Screensaver** (`config.json#screensaver` = `{idleSec, images}`, `/api/screensaver`,
  overlay `components/sleek/SleekScreensaver.tsx`, screen `SleekScreensaverSettings.tsx`):
  after `idleSec` of no input, a Sleek idle overlay (`z-[80]`, below the lock) fades
  in a fullscreen clock + cross-fading images; any input dismisses. Managed from a
  **home "Screensaver" section** (not Settings): the **enable toggle is per-device**
  (`localStorage["sleek-screensaver-on"]`; the overlay listens for the
  `sleek-screensaver-change` event); **admins** set the idle delay and manage the
  shared images. Image add is **drag-and-drop of files, multiple, or whole folders
  (recursed)** via `components/sleek/screensaverUpload.ts` (`collectImageFiles` uses
  `webkitGetAsEntry`), and every image is **downscaled client-side** (canvas → ≤1920px
  JPEG) before upload to dodge proxy body limits (the 413). Images upload to
  `data/screensaver/` via `POST /api/screensaver/images` (admin, multipart) and serve
  from `GET /api/screensaver/images/[id]`. GIFs upload as-is (bump nginx
  `client_max_body_size` for large ones).
- **Backup / restore** (`lib/backup.ts`, `/api/backup`, `/api/restore`, Settings →
  Backup & restore): `GET /api/backup` (admin) bundles the state JSON files
  **including secrets** (config, catalog, overrides, routines, automations,
  switchGroups, favourites/, chatbot/) into a `.cnbdu` JSON envelope downloaded as
  `<timestamp>.cnbdu`. `POST /api/restore` (admin, multipart or raw body) validates
  and writes them back (path-traversal-guarded), then `gatewayReinit()`. The file
  holds password hashes + keys — treat as a credential; a restore can end sessions
  if the session secret changes.
- **Protected controls** (`config.json`, `/api/devices/[id]/protect`,
  `/api/protected`): controls that should stay ON (e.g. a modem). `/api/protected`
  (admin-only) reports live state. **Both themes** show the intrusive popup
  (`components/ProtectedAlert.tsx`, shared) on every load when a protected control
  is off, dismissible until next load (in-memory `protDismissed` flag in
  `SleekApp.tsx` / `Dashboard.tsx`); Classic also keeps its inline red banner as
  the after-dismiss reminder. The gateway rule engine never auto-actuates a
  protected control as an automation *action*.
- **Auto-restore protected controls** (superadmin toggle, default OFF):
  `config.json#autoRestoreProtected` (getter/setter in `lib/config.ts`, toggle
  API `/api/protected/auto-restore` GET/PUT admin-only, UI switch in Settings →
  "Protected controls"). When ON, the **gateway** (`device-gateway/src/protect.js`,
  `ProtectedGuard`) turns a protected control back on the instant it goes off —
  from any source — and logs `PROTECT_RESTORE` to the app's `logs/` (so Insights
  sees it). It watches `config.json` (live toggle, no restart), only acts on
  false→ transitions (restore→true echo can't loop), and has a per-control
  cooldown (2s) + circuit breaker (5 attempts/60s → `PROTECT_GIVEUP`) so it never
  fights a stuck/held-off device forever. **Requires the gateway running**; with
  no gateway the popup is the only signal.
- **Heartbeat** (`/api/heartbeat`, `lib/local.ts#heartbeat`): meant for a cron
  (~every 15 min) to read every device, warming IP/version caches so a human
  opening the dashboard afterwards gets fast reads. Optional `HEARTBEAT_SECRET`
  (header `x-heartbeat-secret` or `?key=`); open if unset. Always returns HTTP
  200 with `{ok,status: ok|degraded|down, reachable,total,durationMs,timestamp,devices}`.
- **Voice mode** (Sleek only, `SleekVoice.tsx`, `lib/voice.ts`, `/api/voice/*`):
  **hands-free speech-to-speech via OpenAI `gpt-realtime` over WebRTC** (NOT
  OpenRouter — Realtime is OpenAI-only). Tap Connect → mic → the browser mints a
  ~120s ephemeral token (`POST /api/voice/session`, which server-side builds the
  session: persona + a compact device/routine **catalog** + the hard "never
  actuate protected controls" rule + tool schemas), does a WebRTC SDP exchange
  with `POST https://api.openai.com/v1/realtime/calls`, and talks over the
  `oai-events` data channel. The model calls tools it maps itself from the
  catalog: `set_controls` → `POST /api/voice/execute`, `get_status` →
  `POST /api/voice/status`, `run_routine` → `POST /api/routines/[id]/run`,
  `remember` → `POST /api/voice/memory` (shared assistant memory — see above).
  The session instructions also include the house name + device count + the
  user's core+personal memory, so voice knows everything the chat agent does.
  Config in Settings → **Voice (Realtime)** (`config.json#openaiRealtime`:
  key/model/voice/enabled; getters in `lib/config.ts`; admin API
  `GET/PUT /api/voice/config`). Default model `gpt-realtime`, voice `marin`.
  - ⚠️ **Protection is enforced server-side, not by the model.**
    `/api/voice/execute` re-validates every action against the catalog and
    **always skips protected controls (for every role)** + locked rooms — the
    model's instruction to avoid protected controls is only the soft first layer.
  - The raw OpenAI key never leaves the server; the browser holds only the
    ephemeral token. Old OpenRouter `/api/voice/transcribe` + `/speak` were
    removed. Live audio can't be tested headlessly (no mic in the Browser pane);
    the WebRTC + tool loop was verified end-to-end by driving the data channel
    with a text message.

---

## 9. Themes — Classic vs Sleek

Two full UIs, per-device selectable in Settings (Appearance). Persisted in
`localStorage` per browser, **not** server-side.

- **`components/uiTheme.ts` `readUiTheme()` defaults to `"sleek"`** — Classic
  only if explicitly chosen. `app/layout.tsx` inline script stamps
  `document.documentElement.dataset.ui`. `HomeRoot.tsx` branches:
  `sleek` → `SleekApp`, `classic` → `Dashboard`.
- **Classic** (`Dashboard.tsx`, `RoomCard.tsx`, `ControlTile.tsx`, …): the
  original tabbed dashboard.
- **Sleek** (`components/sleek/`): guided, POS-style, big-button, touch-first,
  framer-motion animated. Home = section tiles (Favourites, Rooms, Routines,
  Automations, Insights, **Voice**). `SleekApp.tsx` is a nav-stack navigator; the
  stack persists to `localStorage["sleek-nav"]` so a refresh lands on the same
  screen (e.g. Kitchen under Rooms). `useHomeData.ts` is the shared live-data
  hook (rooms, `statusByDevice`, SSE, `sendCommand`, favourites, `protectedOff`).
  - **Phase A (touch) is done.** Phase B (TV remote / d-pad focus nav) and
    Phase C (smartwatch subset) are **deferred** — do not start without explicit
    user confirmation.
- **Sleek Edit Mode** (`components/sleek/editMode.ts`, `SleekModeToggle.tsx`):
  an **admin-only** Run/Edit toggle in the Sleek home header, remembered per
  device (`localStorage["sleek-edit-mode"]`, read after mount). Run Mode is the
  lightweight control-only surface; Edit Mode reveals the management features
  Sleek otherwise hides. A persistent "Edit" pill shows in the header on
  sub-screens while active. `SleekApp` holds `editMode` and threads it (with
  `isAdmin`) to children; every affordance gates on `isAdmin && editMode`. The
  APIs are already `guard({admin:true})`, so this is purely a UI gate. Features:
  - **Naming/move/protect** — room rename bar + per-device `SleekDeviceEditSheet`
    (rename, move room, relabel controls, toggle protected) in `SleekRoomDetail`.
  - **Room lock admin** — `SleekRoomLockSheet` (lock / set-password / remove).
  - **Routines authoring** — `SleekRoutines` New/Edit/Delete + `SleekRoutineBuilder`.
  - **Automations authoring** — `SleekAutomations` New/Edit/Delete + `SleekAutomationBuilder`
    (IF match all/any → THEN); keeps the existing view + enable/disable.
  - **Cloud Sync** button in the home header (`POST /api/sync`).
  - **`SleekActionPicker`** is the shared big-button device→control→value picker
    reused by both builders.
  - ⚠️ **The two builders are MODAL overlays, not nav-stack screens.** A nav-stack
    builder deadlocked `AnimatePresence mode="wait"` (exit never completed). The
    modal pattern (like the sheets) avoids the screen transition entirely — keep
    new full-screen editors as modals.
- **Bluetooth devices:** `lib/store.ts` sets `UiDevice.bluetooth` when the cloud
  name matches `/\b(ble|bluetooth)\b/i`. Both themes show "This is a BT device,
  cannot control from here" instead of controls (can't reach BLE over the LAN).
- **Backgrounds** (`app/globals.css`, `body::before`): theme-specific,
  `html[data-ui="classic"]` → `/background/classic.jpg`, `sleek` →
  `/background/sleek.jpg`, both falling back to `/background.jpg` (a missing
  image 404s → transparent layer → lower layer shows). ⚠️ `public/background/sleek.jpg`
  is currently MISSING (it was accidentally overwritten and lost; falls back to
  `background.jpg` until re-added).

---

## 10. Telegram bot (`telegram-bot/`)

Standalone grammY bot (tsx/ESM), controls the house via the app's REST API +
Bearer token. Guided menus: rooms → switchboards → switches, plus natural
language routed through the app's existing OpenRouter LLM. Auth via the **generic
pairing-code** flow (§6) — designed to be reusable for TV/POS clients, not
Telegram-specific. Config via env (`TELEGRAM_BOT_TOKEN`, app base URL, shared
secret). See `telegram-bot/README.md`.

---

## 11. Mobile app (`mobile-app/`)

Thin Expo Android WebView wrapper. On launch it GETs `/api/metadata`, checks
`name === "Chandrabindu Smart Home"`, then loads the hub in a WebView (else a
"can't find your home server" error). Config in `mobile-app/config.ts`
(`BASE_URL`, `EXPECTED_NAME`). `EXPECTED_NAME` must match `app/api/metadata/route.ts`.

---

## 12. Environment variables

| Var | Used by | Purpose |
|-----|---------|---------|
| `OPENROUTER_API_KEY` | app | LLM chat, insights, voice STT/TTS (also settable in-app) |
| `GATEWAY_URL` | app | Enables routing device I/O through the gateway. **Unset = direct path.** |
| `GATEWAY_SECRET` | app + gateway | Shared secret for gateway HTTP/SSE |
| `GATEWAY_PORT` / `GATEWAY_HOST` | gateway | Default 4000 / 127.0.0.1 |
| `HEARTBEAT_SECRET` | app | Optional heartbeat auth |
| OpenAI Realtime key/model/voice | app | Voice mode — set in Settings → Voice, stored in `config.json#openaiRealtime` (no env var) |
| `TELEGRAM_BOT_TOKEN`, … | bot | See `telegram-bot/README.md` |

There is no required `.env` for the base app — onboarding writes `config.json`.

---

## 13. Build / run

```bash
npm install && npm run dev      # web app (http://localhost:3000)
npm run build                   # production build — must be EXIT 0
```
- `device-gateway/`: `npm start` (run as a service on the hub; set `GATEWAY_URL`
  in the app's env to use it).
- `telegram-bot/`: `npm start`.
- `.claude/launch.json` has `autoPort: true` — the dev preview auto-picks a free
  port (the user runs another project, `qsr_commerce`, on 3000; **do not kill it**).

Verify with the Browser MCP preview tools, not by asking the user to check.

---

## 14. Gotchas & lessons (read before editing)

- **Never chain an existence check with an overwrite in one shell command.** A
  `ls … && mkdir -p … && cp …` once clobbered a user-supplied (untracked, thus
  unrecoverable) `public/background/sleek.jpg`. Check and act in separate steps;
  never `cp`/`mv` over a path you didn't create.
- **`data/` is gitignored and holds secrets + live state.** Don't commit it,
  don't dump keys/hashes into logs or messages.
- **Route files may only export handlers + config.** A `route.ts` exporting a
  non-handler const (e.g. `APP_METADATA`) breaks `next build`. Make it
  module-local. (`app/api/metadata/route.ts` learned this.)
- **Optimistic toggles:** keep state updaters pure and read live values from a
  `ref` (see `liveRef`/`favouritesRef` in `useHomeData.ts`) — a side-effect in a
  `setState` updater or a stale `useCallback` closure sends the wrong value.
- **Cookie `secure` flag** must derive from the actual request protocol, not
  `NODE_ENV` — the hub often serves plain HTTP on the LAN.
- **"Unreachable" is usually the network, not the code.** On this LAN only ~1
  of 6 devices reliably UDP-broadcasts to the dev machine; the hub sees them all.
  Don't chase a code bug when a device is simply not answering.
- **Don't run `next dev` and `next build` at once** — concurrent runs produce
  spurious prerender errors (`/404`, `/500` "Html imported outside _document").
  A clean build with no dev server passes.
- **After changing app code, redeploy the app on the hub** for changes to take
  effect there.
