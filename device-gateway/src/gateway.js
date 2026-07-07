// Owns one DeviceConnection per catalog device and exposes a small surface the
// HTTP server (and, later, the rule engine) use: status reads, commands, and a
// single "change" event stream aggregated across all devices.

const EventEmitter = require("events");
const { loadDevices } = require("./catalog");
const { DeviceConnection } = require("./connection");

class Gateway extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // deviceId -> DeviceConnection
  }

  // Build a fresh connection per catalog device. Reused by start() and reinit().
  _spawn() {
    const devices = loadDevices();
    for (const meta of devices) {
      if (!meta.key || (meta.key || "").length !== 16) continue; // can't control without a valid key
      const conn = new DeviceConnection(meta);
      conn.on("change", (evt) => this.emit("change", evt));
      conn.on("state", (evt) => this.emit("state", evt));
      this.connections.set(meta.id, conn);
      conn.start();
    }
  }

  start() {
    this._spawn();
    console.log(`Gateway managing ${this.connections.size} device connection(s).`);
  }

  /**
   * Tear down every connection cleanly and rebuild from a freshly-read catalog.
   * Call after catalog.json changes (new IP/key/version, added/removed devices).
   * The Gateway instance itself persists, so subscribers (rule engine, SSE) stay
   * wired. Connections reconnect over the next few seconds.
   */
  reinit() {
    this.stop(); // clean-disconnect all existing connections
    this.connections.clear();
    this._spawn();
    console.log(`Gateway re-initialized: ${this.connections.size} device connection(s).`);
    return this.health();
  }

  get(id) {
    return this.connections.get(id) || null;
  }

  // Cached status (instant). Optionally force a live refresh.
  async status(id, { fresh = false } = {}) {
    const conn = this.get(id);
    if (!conn) throw new Error("unknown device");
    if (fresh && conn.connected) {
      try { await conn.refresh(); } catch { /* fall back to cache */ }
    }
    return {
      connected: conn.connected,
      version: conn.goodVersion,
      lastSeenAt: conn.lastSeenAt,
      status: conn.status,
    };
  }

  async command(id, commands) {
    const conn = this.get(id);
    if (!conn) throw new Error("unknown device");
    return conn.command(commands);
  }

  health() {
    const devices = [];
    let connected = 0;
    for (const conn of this.connections.values()) {
      if (conn.connected) connected++;
      devices.push({
        id: conn.meta.id,
        name: conn.meta.cloudName,
        connected: conn.connected,
        version: conn.goodVersion,
        lastSeenAt: conn.lastSeenAt,
        lastChangeAt: conn.lastChangeAt,
      });
    }
    return { total: this.connections.size, connected, devices };
  }

  stop() {
    for (const conn of this.connections.values()) conn.stop();
  }
}

module.exports = { Gateway };
