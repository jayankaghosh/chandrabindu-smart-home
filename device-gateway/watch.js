// PoC: watch ONE device over a persistent LAN connection and log every state
// change in real time — no polling. Toggle a switch physically or from the
// Smart Life app and you should see the event within a second.
//
// This proves the push mechanism (tuyapi emits `dp-refresh`/`data` with
// commandByte 8 = "proactive update from device") works on your network.
//
// IMPORTANT operational notes (learned the hard way):
//   • A Tuya device allows ~one local client. Do NOT run this while the web app
//     is actively hitting the same device (dashboard open on it, or a heartbeat
//     mid-run) — they'll fight over the slot. Run it when the app is idle.
//   • This script ALWAYS disconnects cleanly on exit. If a process ever dies
//     without disconnecting, the device may refuse new connections for a minute
//     or two until it reaps the stale session (power-cycle it to fix instantly).
//
// Run from the repo root (reuses the app's tuyapi + reads its catalog):
//   node device-gateway/watch.js                 # defaults to FBR Main
//   node device-gateway/watch.js "FBR Main"      # by name (substring)
//   node device-gateway/watch.js d7edc2df5529393fddirvl   # by device id
//
// Stop with Ctrl-C.

const path = require("path");
const fs = require("fs");
const TuyAPI = require("tuyapi");

const DEFAULT_TARGET = "FBR Main";
const CATALOG_PATH = path.join(__dirname, "..", "data", "catalog.json");
const CONNECT_TIMEOUT_MS = 8000;
const RETRY_MS = 4000;
const VERSIONS = ["3.4", "3.3", "3.5", "3.1"];

function ts() {
  return new Date().toLocaleString("en-GB", { hour12: false });
}
function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDevice(target) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const t = target.toLowerCase();
  const d =
    catalog.devices.find((x) => x.id === target) ||
    catalog.devices.find((x) => (x.cloudName || "").toLowerCase().includes(t));
  if (!d) {
    console.error(`No device matching "${target}" in ${CATALOG_PATH}`);
    process.exit(1);
  }
  return d;
}

const target = process.argv[2] || DEFAULT_TARGET;
const meta = loadDevice(target);

const byDp = new Map(
  meta.functions.map((f) => [f.dpId, { code: f.code, name: f.name, type: f.type }]),
);
function label(dp) {
  const f = byDp.get(Number(dp));
  return f ? `${f.name} (${f.code})` : `dp ${dp}`;
}
function pretty(dp, value) {
  const f = byDp.get(Number(dp));
  if (f && f.type === "Boolean") return value === true ? "ON" : "OFF";
  return String(value);
}

log(`Watching "${meta.cloudName}" (${meta.id}) ip=${meta.ip || "(discover)"} version=${meta.version}`);
log(`Toggle a switch (physically or in Smart Life) to see events. Ctrl-C to stop.\n`);

// Ordered versions to try: the catalog's first, then the rest.
const versionOrder = [meta.version, ...VERSIONS].filter(
  (v, i, a) => v && a.indexOf(v) === i,
);

let stopped = false;
let current = null; // the live TuyAPI instance
let goodVersion = null; // remembered once a version connects

function attach(dev) {
  dev.on("error", (err) => {
    // Swallowed — the connect loop / disconnect handler drives recovery.
    if (process.env.VERBOSE) log(`⚠️  ${err && err.message ? err.message : err}`);
  });
  dev.on("data", (data, commandByte) => {
    const dps = data && data.dps;
    if (!dps) return;
    const src = commandByte === 8 ? "PUSH" : "snapshot";
    const parts = Object.entries(dps).map(([dp, v]) => `${label(dp)}=${pretty(dp, v)}`);
    log(`📦 ${src}: ${parts.join(", ")}`);
  });
  dev.on("dp-refresh", (data) => {
    const dps = data && data.dps;
    if (!dps) return;
    for (const [dp, v] of Object.entries(dps)) {
      log(`🔔 CHANGED: ${label(dp)} → ${pretty(dp, v)}`);
    }
  });
}

// One connect attempt on a specific version, with a hard timeout so a stalled
// handshake never hangs. Crucially, a version is only accepted once a get()
// actually returns datapoints — tuyapi fires "connected" on mere TCP-open for
// 3.3, which false-matches devices that really speak 3.4/3.5. Always cleans up
// on failure so no stale socket is left holding the device's single slot.
function connectWithVersion(version) {
  return new Promise((resolve) => {
    const dev = new TuyAPI({ id: meta.id, key: meta.key, ip: meta.ip, version });
    attach(dev);
    let settled = false;
    const fail = (why) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (why) log(`v${version}: ${why}`);
      try {
        dev.disconnect();
      } catch {}
      resolve(null);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(dev);
    };
    const timer = setTimeout(() => fail("handshake timed out (slot busy or wrong version)"), CONNECT_TIMEOUT_MS);
    dev.once("connected", async () => {
      // Verify the version REALLY works: it must return datapoints.
      try {
        const st = await dev.get({ schema: true });
        if (st && st.dps && Object.keys(st.dps).length > 0) succeed();
        else fail("connected but returned no datapoints");
      } catch (e) {
        fail(`connected but get() failed: ${e.message}`);
      }
    });
    (meta.ip ? Promise.resolve() : dev.find())
      .then(() => dev.connect())
      .catch(() => fail("connect rejected"));
  });
}

async function loop() {
  while (!stopped) {
    const order = goodVersion ? [goodVersion] : versionOrder;
    let dev = null;
    for (const v of order) {
      if (stopped) return;
      log(`connecting (v${v})…`);
      dev = await connectWithVersion(v);
      if (dev) {
        goodVersion = v;
        break;
      }
      log(`v${v} did not connect`);
    }
    if (!dev) {
      log(`could not connect on any version — retrying in ${RETRY_MS / 1000}s`);
      await delay(RETRY_MS);
      continue;
    }
    current = dev;
    log(`✅ connected on v${goodVersion} — listening for changes`);
    // Block until this connection drops, then reconnect.
    await new Promise((resolve) => dev.once("disconnected", resolve));
    current = null;
    if (stopped) return;
    log(`🔌 disconnected — reconnecting in ${RETRY_MS / 1000}s`);
    await delay(RETRY_MS);
  }
}

function shutdown() {
  if (stopped) return;
  stopped = true;
  log("stopping — disconnecting cleanly…");
  try {
    if (current) current.disconnect();
  } catch {}
  // Give the socket a moment to close before exiting.
  setTimeout(() => process.exit(0), 300);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Optional clean auto-stop (used for supervised test runs) so we never rely on
// an external kill that could leave a stale socket.
if (process.env.WATCH_SECONDS) {
  const secs = Number(process.env.WATCH_SECONDS);
  if (Number.isFinite(secs) && secs > 0) {
    setTimeout(() => {
      log(`(auto-stop after ${secs}s)`);
      shutdown();
    }, secs * 1000);
  }
}

loop();
