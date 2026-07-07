// One persistent, self-healing LAN connection to a single Tuya device — the
// gateway holds exactly one of these per device so it is the sole local client.
//
// Responsibilities:
//   • connect with version detection (verified by a real get()), reconnect w/ backoff
//   • keep a live status cache (code -> value), updated from every packet
//   • emit "change" events on proactive dp-refresh (the automation signal)
//   • serve get()/set() over the SAME socket (serialized) so nothing else needs
//     to open a competing connection
//   • always disconnect cleanly (never leak a socket that would wedge the device)

const TuyAPI = require("tuyapi");
const EventEmitter = require("events");

const CONNECT_TIMEOUT_MS = 8000;
const OP_TIMEOUT_MS = 6000;
const RETRY_MS = 4000;
const VERSIONS = ["3.4", "3.3", "3.5", "3.1"];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(p, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

class DeviceConnection extends EventEmitter {
  constructor(meta) {
    super();
    this.meta = meta;
    this.byDp = new Map(meta.functions.map((f) => [f.dpId, f]));
    this.byCode = new Map(meta.functions.map((f) => [f.code, f]));
    this.status = {}; // code -> value (mapped functions only)
    this.connected = false;
    this.goodVersion = null;
    this.dev = null;
    this.stopped = false;
    this.queue = Promise.resolve(); // serialize ops on the live socket
    this.lastChangeAt = 0;
    this.lastSeenAt = 0;
    // Until the first snapshot has primed the cache, absorb datapoints silently
    // (the initial values aren't "changes"). Set true once connected.
    this.ready = false;
  }

  versionOrder() {
    return [this.meta.version, ...VERSIONS].filter((v, i, a) => v && a.indexOf(v) === i);
  }

  // Fold a raw {dpId: value} map into the status cache; return the changed codes.
  applyDps(dps) {
    const changed = [];
    for (const [dp, v] of Object.entries(dps)) {
      const f = this.byDp.get(Number(dp));
      if (!f) continue;
      if (this.status[f.code] !== v) changed.push({ code: f.code, name: f.name, value: v });
      this.status[f.code] = v;
    }
    this.lastSeenAt = Date.now();
    return changed;
  }

  ingest(dps, source) {
    const changed = this.applyDps(dps);
    // Before the connection is primed, just fill the cache silently.
    if (!this.ready) return;
    if (changed.length) {
      this.lastChangeAt = Date.now();
      for (const c of changed) {
        this.emit("change", {
          deviceId: this.meta.id,
          deviceName: this.meta.cloudName,
          code: c.code,
          name: c.name,
          value: c.value,
          at: this.lastChangeAt,
          source, // "push" (proactive) | "poll" (our own get/set response)
        });
      }
    }
  }

  attach(dev) {
    dev.on("error", () => { /* swallow; run loop / disconnect handles recovery */ });
    dev.on("data", (data, cb) => {
      if (data && data.dps) this.ingest(data.dps, cb === 8 ? "push" : "poll");
    });
    dev.on("dp-refresh", (data) => {
      if (data && data.dps) this.ingest(data.dps, "push");
    });
  }

  // One connect attempt on a version; only accept it once get() returns data.
  connectOnce(version) {
    return new Promise((resolve) => {
      const dev = new TuyAPI({ id: this.meta.id, key: this.meta.key, ip: this.meta.ip, version });
      this.attach(dev);
      let settled = false;
      const fail = () => { if (settled) return; settled = true; clearTimeout(t); try { dev.disconnect(); } catch {} resolve(null); };
      const ok = () => { if (settled) return; settled = true; clearTimeout(t); resolve(dev); };
      const t = setTimeout(fail, CONNECT_TIMEOUT_MS);
      dev.once("connected", async () => {
        try {
          const st = await dev.get({ schema: true });
          if (st && st.dps && Object.keys(st.dps).length > 0) { this.applyDps(st.dps); ok(); }
          else fail();
        } catch { fail(); }
      });
      (this.meta.ip ? Promise.resolve() : dev.find())
        .then(() => dev.connect())
        .catch(fail);
    });
  }

  async run() {
    while (!this.stopped) {
      const order = this.goodVersion ? [this.goodVersion] : this.versionOrder();
      let dev = null;
      for (const v of order) {
        if (this.stopped) return;
        dev = await this.connectOnce(v);
        if (dev) { this.goodVersion = v; break; }
      }
      if (!dev) {
        this.setConnected(false);
        await delay(RETRY_MS);
        continue;
      }
      this.dev = dev;
      this.ready = true; // cache primed by connectOnce's verify get; changes now count
      this.setConnected(true);
      await new Promise((resolve) => dev.once("disconnected", resolve));
      this.dev = null;
      this.ready = false;
      this.setConnected(false);
      if (this.stopped) return;
      await delay(RETRY_MS);
    }
  }

  setConnected(v) {
    if (this.connected === v) return;
    this.connected = v;
    this.emit("state", { deviceId: this.meta.id, connected: v, version: this.goodVersion });
  }

  // Serialize an op on the live socket (tuyapi tolerates one in-flight request).
  enqueue(fn) {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(() => {}, () => {});
    return next;
  }

  async refresh() {
    if (!this.dev || !this.connected) throw new Error("device not connected");
    return this.enqueue(async () => {
      const st = await withTimeout(this.dev.get({ schema: true }), OP_TIMEOUT_MS, "get");
      if (st && st.dps) this.applyDps(st.dps);
      return this.status;
    });
  }

  async command(commands) {
    if (!this.dev || !this.connected) throw new Error("device not connected");
    const dps = {};
    for (const c of commands) {
      const f = this.byCode.get(c.code);
      if (!f) throw new Error(`unknown control code "${c.code}"`);
      dps[f.dpId] = c.value;
    }
    return this.enqueue(async () => {
      const entries = Object.entries(dps);
      if (entries.length === 1) {
        await withTimeout(this.dev.set({ dps: Number(entries[0][0]), set: entries[0][1] }), OP_TIMEOUT_MS, "set");
      } else {
        const data = {};
        for (const [dp, v] of entries) data[Number(dp)] = v;
        await withTimeout(this.dev.set({ multiple: true, data }), OP_TIMEOUT_MS, "set");
      }
      return true;
    });
  }

  start() { this.run(); }
  stop() { this.stopped = true; try { if (this.dev) this.dev.disconnect(); } catch {} }
}

module.exports = { DeviceConnection };
