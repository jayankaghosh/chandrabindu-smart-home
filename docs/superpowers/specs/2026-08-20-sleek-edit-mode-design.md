# Sleek Edit Mode — design spec

Date: 2026-08-20
Status: approved (design), pending implementation plan

## Problem

The Sleek theme is deliberately a lightweight, touch-first surface for *controlling*
the house. Several management capabilities that exist in the Classic theme are
intentionally hidden in Sleek. Admins who prefer Sleek currently have to switch to
Classic (or use `/settings`) to manage the house.

We want a **Run Mode / Edit Mode** toggle on the Sleek home screen. Run Mode is the
current lightweight control-only experience. Edit Mode reveals the hidden management
features in place. The toggle is **admin-only** (all editing is admin-only server-side
already; standard users are read + execute).

## Goals

- Add an admin-only, per-device **Run/Edit** toggle to the Sleek home screen.
- In Edit Mode, expose these Classic-only capabilities, built **Sleek-native**:
  1. Rename devices / rooms / control labels; move a device to another room.
  2. Mark/unmark a control as protected.
  3. Room lock administration: lock / set / change / remove a room password.
  4. Routines authoring: create / edit / delete (Run Mode keeps run-only).
  5. Automations authoring: create / edit / delete via an IF/THEN builder (Run Mode
     keeps the existing view + enable/disable).
  6. A cloud **Sync** button (Classic-only today).
- Remember the mode **per device** (localStorage), like the theme.

## Non-goals

- No change to Classic. No change to the shared `/settings` page (fleet management —
  manual add, LAN scan, pairing, users, gateway — stays there for both themes).
- No change to favourites: the always-visible star stays in both modes (favourites are
  per-user, not admin-gated).
- No server/API changes. Every management endpoint already enforces
  `guard({ admin: true })`; Edit Mode is purely a UI gate. If an endpoint were missing a
  guard that would be a separate bug, but the recon confirmed all are guarded.
- No new "view device functions/IP/version" screen (doesn't exist in either theme today).

## Key decisions

| Decision | Choice |
|---|---|
| Who sees the toggle | Admins only. Non-admins never render it; `editMode` forced off. |
| Feature scope | All four groups above + the Sync button. |
| Editor style | **Sleek-native** big-button builders (not reusing Classic's dense forms). |
| Persistence | Remembered per device in `localStorage` (`"sleek-edit-mode"`). |
| Interaction model | **Inline reveal**: affordances appear in place on existing screens; the two builders are their own nav-stack screens. |
| Safety | Persistent "Edit Mode" indicator in the header on every screen while active. |

## Architecture

### Mode state

- New `components/sleek/editMode.ts`, mirroring `components/uiTheme.ts`:
  - `const KEY = "sleek-edit-mode"`
  - `readEditMode(): boolean` and `setEditMode(on: boolean): void`, both try/catch-guarded.
  - Read **after mount** to avoid SSR hydration mismatch (start `false`, set in a
    `useEffect`), the same pattern `HomeRoot.tsx` uses for the theme.
- `SleekApp` owns `editMode` state. It is only ever `true` when `isAdmin && stored===true`.
  Threaded down as an `editMode` prop next to the existing `isAdmin` prop.
- When `isAdmin` is false the toggle is not rendered and `editMode` stays `false`.

### Toggle & indicator

- `components/sleek/SleekModeToggle.tsx`: a segmented **Run | Edit** control shown in the
  Home header, admin-only. Calls `setEditMode` and updates `SleekApp` state.
- While `editMode` is on, `SleekApp` renders a small "Edit Mode" pill in the header on
  every screen (not just Home) so a wall panel isn't silently left editable.

### Navigation

- `SleekApp`'s `Screen` union gains `{ k: "routine-edit"; id?: string }` and
  `{ k: "automation-edit"; id?: string }`; both added to `SCREEN_KINDS`.
- These builder screens are **excluded from the persisted nav stack** (filtered out when
  writing `"sleek-nav"`), and on load any restored builder screen is dropped if
  `!isAdmin || !editMode`. A refresh therefore never lands mid-build.
- Existing "drop restored screen if invalid" logic (room-not-found) is the pattern to follow.

## Feature designs

Each cites the API (already admin-guarded) and where it slots into the Sleek tree.

### 1. Naming, move & protect — inline on tiles

- `SleekRoomDetail`: in `isAdmin && editMode`, a pencil on the room title opens an inline
  rename input → `PATCH /api/rooms/[id]` (`{ name }`) → `data.reload()`.
- New `components/sleek/SleekDeviceEditSheet.tsx`: a Sleek bottom-sheet/modal opened from an
  edit button on each device in `SleekRoomDetail`. Fields:
  - Device name (text).
  - Room picker (`<select>`/big list of rooms) to **move** the device.
  - Per-control label inputs.
  - A protected on/off toggle per control.
  - Save → `PATCH /api/devices/[id]` (`{ name, roomId, controls }`) and, for protected
    changes, `PUT /api/devices/[id]/protect` per changed control → `data.reload()`.
- `SleekControlTile` already receives `isAdmin`; it will also receive `editMode` so the tile
  can show its edit affordance. Control relabel + protect live in the device edit sheet
  (one editor per device) to keep per-tile UI clean.

### 2. Room lock admin

- New `components/sleek/SleekRoomLockSheet.tsx`, opened from a lock button on the room in
  `SleekRoomList` (tile) and/or `SleekRoomDetail` (header), admin + edit only:
  - Lock an unlocked room (set password) → `PUT /api/rooms/[id]/lock`.
  - Change password → same `PUT`.
  - Remove lock → `DELETE /api/rooms/[id]/lock`.
- Session unlock (`POST /api/rooms/[id]/unlock`) is unchanged and available in both modes.

### 3. Routines authoring — Sleek-native

- `SleekRoutines` gains props: `rooms`, `isAdmin`, `editMode` (it currently takes none).
  In Edit Mode it shows a big **New routine** button and per-routine **Edit** / **Delete**
  (`DELETE /api/routines/[id]`). Run stays available.
- New `components/sleek/SleekRoutineBuilder.tsx` (a `routine-edit` nav screen): name input +
  an ordered action list. Each action is built with the shared `SleekActionPicker`
  (below). Save → `POST /api/routines` (new) or `PUT /api/routines/[id]` (edit).

### 4. Automations authoring — Sleek-native (largest piece)

- `SleekAutomations` (currently view + enable/disable) gains a **New automation** button and
  per-rule **Edit** / **Delete** (`DELETE /api/automations/[id]`) in Edit Mode. Existing
  enable/disable toggle stays.
- New `components/sleek/SleekAutomationBuilder.tsx` (an `automation-edit` nav screen):
  name, **match all/any**, a list of **conditions** and a list of **actions**, each row
  built with `SleekActionPicker`. Save → `POST /api/automations` or
  `PUT /api/automations/[id]`.

### 5. Shared action/condition picker

- New `components/sleek/SleekActionPicker.tsx`: the reusable big-button unit used by both
  builders. Flow: pick device (grouped by room) → pick control → pick value. Value editor
  adapts to the control's `type` from `device.functions`:
  - Boolean → on/off.
  - Enum → one of `range`.
  - Integer → number within `min/max/step`.
  Returns `{ deviceId, code, value }`. Conditions add a comparison (equals) — automations
  conditions are equality checks on a control's value, matching Classic's builder.
- Data source: `useHomeData().rooms` already carries every device and its `functions`
  (code, type, name, range, min/max/step), so no new fetch is needed.

### 6. Sync button

- In Edit Mode, the Home header shows a **Sync from cloud** action → `POST /api/sync` →
  `data.reload()`. Mirror Classic's header Sync, Sleek-styled, with a spinner while running.

## Components

**New**
- `components/sleek/editMode.ts`
- `components/sleek/SleekModeToggle.tsx`
- `components/sleek/SleekDeviceEditSheet.tsx`
- `components/sleek/SleekRoomLockSheet.tsx`
- `components/sleek/SleekActionPicker.tsx` (shared by both builders)
- `components/sleek/SleekRoutineBuilder.tsx`
- `components/sleek/SleekAutomationBuilder.tsx`

**Touched**
- `components/sleek/SleekApp.tsx` — mode state, threading, toggle + indicator, new nav screens.
- `components/sleek/SleekHome.tsx` — header toggle + Sync action host (or hosted in SleekApp header).
- `components/sleek/SleekRoomList.tsx` — lock button per room tile (edit mode).
- `components/sleek/SleekRoomDetail.tsx` — room rename, device edit sheet trigger, lock trigger.
- `components/sleek/SleekControlTile.tsx` — receive `editMode` (affordance surfacing).
- `components/sleek/SleekRoutines.tsx` — New/Edit/Delete + open builder.
- `components/sleek/SleekAutomations.tsx` — New/Edit/Delete + open builder.

## Data flow

- All reads come from `useHomeData()` (already provides `rooms`, `statusByDevice`,
  `favourites`, `sendCommand`, `reload`). Mutations call the existing admin APIs, then
  `data.reload()` to refresh rooms/overrides. `SleekRoutines`/`SleekAutomations` keep their
  own list fetches and re-fetch after a mutation.

## Error handling

- Every mutation is wrapped; on failure show an inline error in the sheet/builder and leave
  local state unchanged (no optimistic room/name changes that could desync). Device *control*
  toggles keep their existing optimistic behavior via `sendCommand`.
- A `403` from any endpoint (shouldn't happen for an admin) surfaces the endpoint's error
  message; a `401` follows the app's existing redirect-to-login path.

## Testing / verification

- `npx tsc --noEmit` and `npm run build` clean after each phase.
- Browser verification per phase (admin session): toggle flips and persists across reload;
  Run Mode is visually unchanged; each editor performs its mutation and the change is
  reflected after reload; non-admin never sees the toggle or affordances.
- Do not actuate real protected devices during verification.

## Phasing (implementation order)

1. **Foundation** — `editMode.ts`, `SleekModeToggle`, indicator, threading, nav-screen
   plumbing, Sync button. (No feature editors yet; verify toggle + persistence.)
2. **Naming, move & protect** — `SleekDeviceEditSheet` + room rename.
3. **Room lock admin** — `SleekRoomLockSheet`.
4. **Routines authoring** — `SleekActionPicker` + `SleekRoutineBuilder`.
5. **Automations authoring** — `SleekAutomationBuilder` (reuses `SleekActionPicker`).

Each phase is independently shippable and browser-verifiable.

## Open considerations (non-blocking)

- Placement of the room **lock** button (room list tile vs room detail header) — detail
  header is primary; a tile affordance is optional.
- Whether the Sync button lives in the Home header only, or persists in Edit Mode across
  screens — Home-only is the default.
