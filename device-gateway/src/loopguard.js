// Loop-protection kill switch. Watches the gateway's real state changes and, if
// any single switch toggles more than `maxToggles` times within `windowSec`
// seconds (both from data/config.json#loopGuard, defaults 20/20), it trips an
// app-wide LOCK: writes `locked:true` into config.json and emits a `lock` event.
// While locked, `gateway.command()` refuses everything — nothing is actuated
// (we do NOT turn devices off; we just halt) until an admin unlocks.

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "..", "data", "config.json");
const LOG_DIR = path.join(__dirname, "..", "..", "logs");

const DEFAULT_MAX_TOGGLES = 20;
const DEFAULT_WINDOW_SEC = 20;

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function logAction(action, details) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const line = `${now.toISOString().replace("T", " ").slice(0, 19)}\t${action}\t${JSON.stringify(details)}\n`;
    fs.appendFileSync(path.join(LOG_DIR, `${day}.log`), line, "utf8");
  } catch {
    /* best-effort */
  }
}

class LoopGuard {
  constructor(gateway) {
    this.gateway = gateway;
    this.windows = new Map(); // `${deviceId}::${code}` -> [timestamps]
    this.locked = false;
    this.maxToggles = DEFAULT_MAX_TOGGLES;
    this.windowMs = DEFAULT_WINDOW_SEC * 1000;
  }

  reload() {
    const cfg = readJson(CONFIG_PATH, {}) || {};
    const lg = cfg.loopGuard || {};
    this.maxToggles = Number(lg.maxToggles) > 0 ? Number(lg.maxToggles) : DEFAULT_MAX_TOGGLES;
    this.windowMs = (Number(lg.windowSec) > 0 ? Number(lg.windowSec) : DEFAULT_WINDOW_SEC) * 1000;

    const nowLocked = cfg.locked === true;
    if (this.locked && !nowLocked) {
      // Admin unlocked externally — reset counters and tell clients.
      this.windows.clear();
      this.gateway.locked = false;
      this.gateway.emit("unlock", {});
      console.log("[loopguard] unlocked");
    } else if (!this.locked && nowLocked) {
      this.gateway.locked = true;
      this.gateway.emit("lock", cfg.lockInfo || { at: Date.now() });
    }
    this.locked = nowLocked;
    this.gateway.locked = nowLocked;
  }

  start() {
    this.reload();
    fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => this.reload());
    this.gateway.on("change", (e) => this.onChange(e));
    console.log(`[loopguard] armed: >${this.maxToggles} toggles / ${this.windowMs / 1000}s`);
  }

  onChange(e) {
    if (this.locked || !e || typeof e.value !== "boolean") return;
    const key = `${e.deviceId}::${e.code}`;
    const now = Date.now();
    const times = (this.windows.get(key) || []).filter((t) => now - t < this.windowMs);
    times.push(now);
    this.windows.set(key, times);
    if (times.length > this.maxToggles) this.trip(e, times.length);
  }

  trip(e, count) {
    this.locked = true;
    this.gateway.locked = true;
    this.windows.clear();
    const info = {
      at: Date.now(),
      reason: `${e.name || e.code} toggled ${count} times in ${this.windowMs / 1000}s`,
      deviceId: e.deviceId,
      code: e.code,
    };
    this.writeLock(info);
    logAction("LOOP_LOCK", info);
    this.gateway.emit("lock", info);
    console.log(`[loopguard] TRIPPED — app LOCKED (${info.reason})`);
  }

  // Read-merge-write config.json so we don't drop the app's other keys.
  writeLock(info) {
    try {
      const cfg = readJson(CONFIG_PATH, {}) || {};
      cfg.locked = true;
      cfg.lockInfo = info;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { encoding: "utf8", mode: 0o600 });
    } catch (err) {
      console.log(`[loopguard]   failed to persist lock: ${err.message}`);
    }
  }
}

module.exports = { LoopGuard };
