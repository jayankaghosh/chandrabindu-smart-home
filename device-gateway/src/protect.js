// Protected-control guard. Watches every real-time change and, when a control
// marked "protected" (in data/config.json) is turned OFF — physically, from the
// SmartLife app, or anywhere — immediately turns it back ON and logs it.
//
// Why the gateway: it's the only always-on component that sees every state
// change (the app only knows state while a browser is open). The web UI's
// protected-off popup is the notification + manual fallback for when the gateway
// isn't running; this is the enforcement.
//
// Anti-fight: a per-control cooldown coalesces bursts, and a circuit breaker
// gives up after a few failed attempts in a rolling window (so a device whose
// relay is stuck / that someone is holding off isn't commanded forever). The
// counter resets the moment the control reports ON again.

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "..", "data", "config.json");
const LOG_DIR = path.join(__dirname, "..", "..", "logs");

const COOLDOWN_MS = 2000; // min gap between restore attempts for one control
const MAX_ATTEMPTS = 5; // attempts within the window before giving up
const ATTEMPT_WINDOW_MS = 60_000; // rolling window for the attempt counter

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

// Read the protected config: the set of "deviceId::code" keys plus whether the
// superadmin has enabled auto-restore at all.
function loadConfig() {
  const cfg = readJson(CONFIG_PATH, {});
  const map = cfg && cfg.protectedControls ? cfg.protectedControls : {};
  const set = new Set();
  for (const [deviceId, codes] of Object.entries(map)) {
    for (const code of codes || []) set.add(`${deviceId}::${code}`);
  }
  return { set, enabled: cfg.autoRestoreProtected === true };
}

// Is this datapoint value "off"? Protected controls are Boolean switches; be
// lenient about how off is represented so we never miss one.
function isOff(v) {
  if (v === false || v === 0) return true;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    return s === "false" || s === "off" || s === "0";
  }
  return false;
}

// Append to the app's per-day action log (logs/YYYY-MM-DD.log), matching
// lib/logger.ts so these events show up in Insights alongside app actions.
function pad(n) {
  return String(n).padStart(2, "0");
}
function logAction(action, details) {
  try {
    const d = new Date();
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = `${day} ${clock}  ${action}  ${JSON.stringify(details)}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${day}.log`), line, "utf8");
  } catch {
    /* logging must never break the guard */
  }
}

class ProtectedGuard {
  constructor(gateway) {
    this.gateway = gateway;
    this.enabled = false;
    this.protectedSet = new Set();
    this.cooldown = new Map(); // key -> last attempt ms
    this.attempts = new Map(); // key -> { count, windowStart }
  }

  start() {
    this.reload();
    // Re-read when the superadmin toggles auto-restore or protects/unprotects a
    // control via the web UI (both live in config.json).
    fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => this.reload());
    this.gateway.on("change", (e) => this.onChange(e));
    console.log(
      `Protected guard started — auto-restore ${this.enabled ? "ON" : "OFF"} (${this.protectedSet.size} protected control(s)).`,
    );
  }

  reload() {
    const { set, enabled } = loadConfig();
    this.protectedSet = set;
    this.enabled = enabled;
  }

  onChange(e) {
    if (!e || !this.enabled) return; // disabled → do nothing
    const key = `${e.deviceId}::${e.code}`;
    if (!this.protectedSet.has(key)) return;
    if (!isOff(e.value)) {
      // Back on (our restore worked, or someone turned it on) — reset the breaker.
      this.attempts.delete(key);
      this.cooldown.delete(key);
      return;
    }
    this.restore(key, e);
  }

  async restore(key, e) {
    const now = Date.now();

    // Cooldown: coalesce rapid repeats into one attempt.
    if (now - (this.cooldown.get(key) || 0) < COOLDOWN_MS) return;

    // Circuit breaker: stop fighting a control that won't stay on.
    let a = this.attempts.get(key);
    if (!a || now - a.windowStart > ATTEMPT_WINDOW_MS) a = { count: 0, windowStart: now };
    if (a.count >= MAX_ATTEMPTS) {
      if (a.count === MAX_ATTEMPTS) {
        a.count++; // bump once so we log the give-up a single time
        this.attempts.set(key, a);
        console.log(`[protect] giving up on ${e.deviceName} · ${e.code} after ${MAX_ATTEMPTS} attempts`);
        logAction("PROTECT_GIVEUP", { device: e.deviceName, deviceId: e.deviceId, code: e.code });
      }
      return;
    }

    this.cooldown.set(key, now);
    a.count++;
    this.attempts.set(key, a);

    console.log(`[protect] ${e.deviceName} · ${e.code} went OFF — restoring ON (attempt ${a.count})`);
    try {
      await this.gateway.command(e.deviceId, [{ code: e.code, value: true }]);
      logAction("PROTECT_RESTORE", {
        device: e.deviceName,
        deviceId: e.deviceId,
        code: e.code,
        source: e.source,
      });
    } catch (err) {
      console.log(`[protect]   FAILED to restore ${e.deviceId} ${e.code}: ${err.message}`);
      logAction("PROTECT_RESTORE_FAILED", {
        device: e.deviceName,
        deviceId: e.deviceId,
        code: e.code,
        error: err.message,
      });
    }
  }
}

module.exports = { ProtectedGuard };
