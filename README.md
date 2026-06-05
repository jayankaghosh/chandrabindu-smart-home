# Chandrabindu Smart Home

A password-protected dashboard to control your Tuya / SmartLife devices
**locally over your Wi-Fi** (via [tuyapi](https://github.com/codetheweb/tuyapi)).
The Tuya cloud is used only once, during setup, to discover your devices,
rooms and local keys. After that the app talks directly to the devices on your
LAN — no cloud dependency for day-to-day control.

It lists your **rooms → devices → actions** with your own device/switch names.

---

## Setup (all in the browser — no `.env` needed)

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. On first run you'll see the **onboarding wizard**:

1. **Create an admin password.** Used to log in from then on (stored hashed).
2. **Connect Tuya cloud (one-time sync).** Enter your Access ID / Secret and
   pick your region → the app pulls your rooms, devices and local keys.
   - If the credentials fail, you'll get a **manual device form** instead —
     add devices by ID + local key + name + type + room.

That's it. From then on the app logs in with your password and controls
everything locally.

### Prerequisites in platform.tuya.com (for the cloud sync)

The sync needs an active cloud project:

1. **Subscribe to IoT Core** — Cloud → your project → *Service API* →
   *Go to Authorize* → subscribe to **IoT Core** (free trial is fine). Renew it
   if it has expired (otherwise the sync returns a "subscription expired" error).
2. **Link your SmartLife app account** — Cloud → *Devices* → *Link App Account*
   → scan the QR with your SmartLife app. Otherwise the sync returns 0 devices.
3. Make sure the project's **Data Center** matches the region you pick in setup.

You can skip the cloud entirely and add everything via the manual form.

---

## Using it

- **Rooms → devices → actions.** Expand a device to toggle its switches, set
  fan speed, dim, etc. Controls use your custom names from the app.
- **Rename / move** a device to another room — local edits that survive re-syncs.
- **Settings → Advanced** (gear icon): re-sync from cloud, edit Tuya
  credentials, and add devices manually.
- Status polls every ~10s while a device is expanded.

> **The machine running this must be on the same Wi-Fi as the devices.**
> tuyapi discovers and controls devices over the LAN (UDP broadcast + TCP).
> If a device shows **Unreachable**, see Troubleshooting.

---

## How it works

- `lib/tuya.ts` — cloud client used only at sync time (HMAC signing, token
  cache). Pulls devices, rooms, and per-device functions joined with their
  local **dp ids** and custom names (from `shadow/properties`).
- `lib/local.ts` — tuyapi control: one discovery pass caches device IPs, a
  keep-alive connection pool, protocol auto-detect (3.4→3.3→3.5→3.1),
  per-device serialization, and operation timeouts.
- `lib/config.ts` — `data/config.json`: hashed admin password, session secret,
  Tuya creds (written `0600`).
- `lib/store.ts` — `data/catalog.json` (synced devices) + `data/overrides.json`
  (your local edits), merged into the room → device model.
- `lib/auth.ts` — signed session cookie; every page and API route verifies it
  server-side.

### API routes (all session-guarded except onboarding/login)

| Route | Purpose |
|---|---|
| `POST /api/onboarding/password` | first-run: set admin password |
| `POST /api/auth/login` · `POST /api/auth/logout` | session |
| `POST /api/sync` | cloud → local catalog (creds in body or stored) |
| `GET`/`PUT /api/credentials` | view (masked) / update Tuya creds |
| `GET /api/rooms` · `POST /api/rooms` · `PATCH /api/rooms/[id]` | rooms model / create / rename |
| `GET /api/devices/[id]/functions` | controllable actions |
| `GET /api/devices/[id]/status` | live LAN status |
| `POST /api/devices/[id]/commands` | send a validated command (LAN) |
| `PATCH /api/devices/[id]` | rename / move device |
| `POST /api/devices/manual` | add a device by hand (+ LAN discovery) |

---

## Troubleshooting

- **Device shows "Searching network…":** the app couldn't hear the device's
  discovery broadcast (commonly blocked by mesh routers / band-steering /
  "AP isolation" / guest networks), so it's **automatically scanning** the LAN
  to find it by direct TCP. It heals itself within ~30–60s, then shows
  "On network". No action needed.
  - You can force it immediately with **Settings → Scan LAN for devices**.
  - For permanence, set **DHCP reservations** in your router so device IPs never
    change (then no scanning is ever needed).
  - Make sure this computer is on the **same Wi-Fi** as the devices (2.4 GHz).
- **Sync: "subscription expired" / permission denied:** renew IoT Core in the
  Tuya console; check the region matches.
- **Sync returns 0 devices:** link your SmartLife account (prerequisite 2).
- **Start onboarding over:** delete `data/config.json` (or the whole `data/`).
