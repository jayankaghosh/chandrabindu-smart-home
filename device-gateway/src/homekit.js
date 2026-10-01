// Apple HomeKit bridge. Publishes the hub's switches, fans, dimmers and
// routines to the Home app, so every iPhone in the house gets Control Center,
// Lock Screen controls, widgets, StandBy, Siri and Apple Watch with nothing to
// install. It runs inside the gateway: state comes from the live connection
// caches and every command goes through gateway.command(), so the loop-guard
// lock and the super-protected rule still apply.
//
// Layout: one accessory per room (the user assigns ~10 rooms once in Home, not
// every switch), each control a service inside it, and one accessory per
// routine (a momentary switch), so each routine keeps its own name in Home.
//
// Left out on purpose, because HomeKit has no admin role: protected and
// super-protected controls, panel child locks, password-locked rooms and
// Bluetooth devices. Writes are refused while the app is locked or setup is
// incomplete, like the web app.
//
// Opt-in via config.json#homekit.enabled (Settings > Apple Home). The bridge
// identity and pairings live in data/homekit/ (gitignored with all of data/).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const hap = require("hap-nodejs");
const { buildModel, loadRoutines, readConfig, controlFlags, PATHS } = require("./model");
const { logAction } = require("./actionlog");

const { Bridge, Accessory, Service, Characteristic, uuid, HAPStorage, HapStatusError, HAPStatus, Categories } = hap;

const HK_DIR = path.join(__dirname, "..", "..", "data", "homekit");
const IDENTITY_PATH = path.join(HK_DIR, "identity.json");
const PERSIST_DIR = path.join(HK_DIR, "persist");
const PORT = Number(process.env.HOMEKIT_PORT || 51826);
const CHILD_LOCK = "child_lock";

// HomeKit rejects these well-known setup codes.
const TRIVIAL_PINS = new Set([
  ...Array.from({ length: 10 }, (_, i) => `${i}${i}${i}-${i}${i}-${i}${i}${i}`),
  "123-45-678",
  "876-54-321",
]);

// ── Bridge identity (MAC-style username, setup code, setup id) ──────────────

function randomPin() {
  for (;;) {
    const d = Array.from(crypto.randomBytes(8), (b) => String(b % 10)).join("");
    const pin = `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5, 8)}`;
    if (!TRIVIAL_PINS.has(pin)) return pin;
  }
}

function randomMac() {
  const b = crypto.randomBytes(6);
  b[0] = (b[0] | 0x02) & 0xfe; // locally administered, unicast
  return Array.from(b, (x) => x.toString(16).padStart(2, "0").toUpperCase()).join(":");
}

function randomSetupId() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
}

function readIdentity() {
  try {
    const id = JSON.parse(fs.readFileSync(IDENTITY_PATH, "utf8"));
    if (id.username && id.pincode && id.setupID) return id;
  } catch {
    /* none yet */
  }
  return null;
}

function loadOrCreateIdentity() {
  const existing = readIdentity();
  if (existing) return existing;
  const id = { username: randomMac(), pincode: randomPin(), setupID: randomSetupId(), createdAt: Date.now() };
  fs.mkdirSync(HK_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(id, null, 2), { encoding: "utf8", mode: 0o600 });
  return id;
}

// ── Control → HomeKit service mapping ───────────────────────────────────────

function kindOf(fn) {
  const s = `${fn.name} ${fn.code}`.toLowerCase();
  if (/fan/.test(s)) return "fan";
  if (/sock|plug|outlet|modem|alexa|speaker|\btv\b|fire tv|playstation/.test(s)) return "outlet";
  if (/light|lamp|bulb|strip|chandelier|led|spot|deco|elevation|ambient/.test(s)) return "light";
  return "switch";
}

/** Numeric fan levels above "0", ascending (e.g. 25/50/75/100), or null. */
function fanLevels(fn) {
  const opts = (fn.range || []).filter((o) => /^\d+$/.test(o));
  if (opts.length < 2 || !opts.includes("0")) return null;
  return opts.filter((o) => o !== "0").sort((a, b) => Number(a) - Number(b));
}

function specFor(fn) {
  if (fn.type === "Boolean") {
    const kind = kindOf(fn);
    return { kind: kind === "fan" ? "fanSwitch" : kind };
  }
  if (fn.type === "Integer") return { kind: "dimmer" };
  if (fn.type === "Enum") {
    const levels = fanLevels(fn);
    return levels ? { kind: "fanLevels", levels } : null; // other enums (modes) aren't exposed
  }
  return null;
}

/** A light for the "Any light on" sensor: a light-named switch or any dimmer. */
function isLight(device, fn) {
  if (device.bluetooth || fn.code === CHILD_LOCK || fn.protected || fn.superProtected) return false;
  return (fn.type === "Boolean" && kindOf(fn) === "light") || fn.type === "Integer";
}

function typeKey(want) {
  if (want.routineId) return "routine";
  if (want.sensor) return `sensor:${want.sensor}`;
  const s = want.spec;
  if (s.kind === "fanLevels") return `fanLevels:${s.levels.join(",")}`;
  if (s.kind === "dimmer") return `dimmer:${want.fn.min ?? 0}-${want.fn.max ?? 100}`;
  return s.kind;
}

function setInfo(accessory, model, id) {
  accessory
    .getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, "Chandrabindu")
    .setCharacteristic(Characteristic.Model, model)
    .setCharacteristic(Characteristic.SerialNumber, id.replace(/-/g, "").slice(0, 12).toUpperCase())
    .setCharacteristic(Characteristic.FirmwareRevision, "1.0.0");
}

/**
 * A name HomeKit accepts: letters, numbers, spaces, apostrophes, hyphens,
 * commas and periods, starting and ending with a letter or number. Anything
 * else (e.g. "&") makes the Home app reject the name and fall back to a
 * generic one like "Switch 2".
 */
function hkName(raw, fallback = "Switch") {
  const s = String(raw || "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N} '\-,.]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
  return (s || fallback).slice(0, 64);
}

/** Name a service so each tile in Home shows the control's own name. */
function setNames(service, name) {
  service.setCharacteristic(Characteristic.Name, name);
  if (!service.testCharacteristic(Characteristic.ConfiguredName)) {
    service.addOptionalCharacteristic(Characteristic.ConfiguredName);
  }
  service.setCharacteristic(Characteristic.ConfiguredName, name);
}

// ── The bridge ──────────────────────────────────────────────────────────────

class HomeKitBridge {
  constructor(gateway, { runRoutine } = {}) {
    this.gateway = gateway;
    this.runRoutine = runRoutine;
    this.bridge = null;
    this.running = false;
    this.lastError = null;
    this.accessories = new Map(); // accessory UUID -> { accessory, services: Map(subtype -> entry) }
    this.byControl = new Map(); // "deviceId::code" -> entry
    this.lastLevel = new Map(); // "deviceId::code" -> last non-off value (fans, dimmers)
    this.lightRefs = []; // every light, for the "Any light on" sensor
    this.lightKeys = new Set();
    this.lightSensor = null;
    this.chain = Promise.resolve();
    this.syncTimer = null;
  }

  start() {
    HAPStorage.setCustomStoragePath(PERSIST_DIR);
    this.gateway.on("change", (e) => this.onChange(e));
    // Names, rooms, protection and routines all live in these files; any edit
    // in the web app re-syncs what Home shows.
    for (const p of [PATHS.config, PATHS.catalog, PATHS.overrides, PATHS.routines]) {
      fs.watchFile(p, { interval: 2000 }, () => this.scheduleSync());
    }
    this.enqueue(() => this.apply());
  }

  enabled() {
    const c = readConfig();
    return Boolean(c.homekit && c.homekit.enabled);
  }

  /** Re-read everything soon (debounced), e.g. after a file change or re-init. */
  scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.enqueue(() => this.apply()), 800);
  }

  enqueue(task) {
    this.chain = this.chain.then(task).catch((e) => {
      this.lastError = e.message;
      console.log(`[homekit] ${e.message}`);
    });
    return this.chain;
  }

  async apply() {
    if (this.enabled()) {
      if (this.running) this.sync();
      else await this.publish();
    } else if (this.running) {
      await this.unpublish();
      console.log("[homekit] Apple Home bridge turned off.");
    }
  }

  async publish() {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
    const identity = loadOrCreateIdentity();
    const bridge = new Bridge("Chandrabindu", uuid.generate(`chandrabindu.bridge.${identity.username}`));
    setInfo(bridge, "Hub", identity.username);
    bridge.on("paired", () => console.log("[homekit] paired with a Home"));
    bridge.on("unpaired", () => console.log("[homekit] removed from Home"));
    this.bridge = bridge;
    this.accessories.clear();
    this.byControl.clear();
    this.sync();
    await bridge.publish({
      username: identity.username,
      pincode: identity.pincode,
      setupID: identity.setupID,
      port: PORT,
      category: Categories.BRIDGE,
    });
    this.running = true;
    this.lastError = null;
    console.log(`[homekit] Apple Home bridge on port ${PORT}: ${this.byControl.size} control(s) in ${this.accessories.size} accessory(ies). Pair it from Settings > Apple Home.`);
  }

  async unpublish() {
    const bridge = this.bridge;
    this.running = false;
    this.bridge = null;
    this.accessories.clear();
    this.byControl.clear();
    if (bridge) await bridge.unpublish();
  }

  /** Forget every pairing and make a new setup code (removes it from all Homes). */
  reset() {
    return this.enqueue(async () => {
      const bridge = this.bridge;
      this.running = false;
      this.bridge = null;
      this.accessories.clear();
      this.byControl.clear();
      if (bridge) await bridge.destroy(); // unpublish + drop its pairing data
      fs.rmSync(PERSIST_DIR, { recursive: true, force: true });
      fs.rmSync(IDENTITY_PATH, { force: true });
      console.log("[homekit] pairing reset");
      if (this.enabled()) await this.publish();
    });
  }

  status() {
    const identity = readIdentity();
    let routines = 0;
    for (const { services } of this.accessories.values()) {
      for (const entry of services.values()) if (entry.routineId) routines++;
    }
    return {
      enabled: this.enabled(),
      running: this.running,
      paired: Boolean(this.bridge && this.bridge._accessoryInfo && this.bridge._accessoryInfo.paired()),
      setupCode: identity ? identity.pincode : null,
      setupURI: this.running && this.bridge ? this.bridge.setupURI() : null,
      port: PORT,
      rooms: [...this.accessories.values()].filter((a) => !a.isRoutines && !a.isSensor).length,
      controls: this.byControl.size,
      routines,
      error: this.lastError,
    };
  }

  eligible(room, device, fn) {
    return (
      !room.locked &&
      !device.bluetooth &&
      Boolean(this.gateway.get(device.id)) &&
      fn.code !== CHILD_LOCK &&
      !fn.protected &&
      !fn.superProtected &&
      specFor(fn) !== null
    );
  }

  /** Make the published accessories match the current model (add/remove/rename). */
  sync() {
    const bridge = this.bridge;
    if (!bridge) return;
    const live = this.running; // before publish, config updates are folded into publish()
    const model = buildModel();

    const desired = new Map();
    const lightRefs = [];
    for (const room of model.rooms) {
      const entries = [];
      for (const device of room.devices) {
        for (const fn of device.functions) {
          if (isLight(device, fn)) lightRefs.push({ deviceId: device.id, code: fn.code, type: fn.type, min: fn.min ?? 0 });
          if (!this.eligible(room, device, fn)) continue;
          entries.push({ subtype: `${device.id}:${fn.code}`, name: hkName(fn.name), spec: specFor(fn), deviceId: device.id, code: fn.code, fn, deviceName: device.name, roomName: room.name });
        }
      }
      if (entries.length) desired.set(uuid.generate(`chandrabindu.room.${room.id}`), { name: hkName(room.name, "Room"), model: "Room", entries });
    }
    // "Any light on": one read-only sensor for the whole house, so a Shortcut
    // or Home automation can ask "are all the lights off?" in a single check.
    // Counts lights in every room (locked ones too; reading is harmless).
    this.lightRefs = lightRefs;
    this.lightKeys = new Set(lightRefs.map((r) => `${r.deviceId}::${r.code}`));
    if (lightRefs.length) {
      desired.set(uuid.generate("chandrabindu.sensor.lights"), {
        name: "House lights",
        model: "Status",
        isSensor: true,
        entries: [{ subtype: "sensor:lights", name: "Any light on", sensor: "lights" }],
      });
    }

    // Each routine is its own accessory: Home ignores per-service names when
    // many same-type switches share one accessory ("Switch", "Switch 2", …),
    // but always shows an accessory's own name. It also makes every routine a
    // separate tile for Control Center, scenes and Siri.
    for (const r of loadRoutines()) {
      const name = hkName(r.name, "Routine");
      desired.set(uuid.generate(`chandrabindu.routine.${r.id}`), {
        name,
        model: "Routine",
        isRoutines: true,
        entries: [{ subtype: `routine:${r.id}`, name, routineId: r.id }],
      });
    }

    for (const [id, acc] of this.accessories) {
      if (desired.has(id)) continue;
      bridge.removeBridgedAccessory(acc.accessory, !live);
      if (acc.isSensor) this.lightSensor = null;
      for (const entry of acc.services.values()) if (entry.deviceId) this.byControl.delete(`${entry.deviceId}::${entry.code}`);
      this.accessories.delete(id);
    }

    for (const [id, want] of desired) {
      let acc = this.accessories.get(id);
      const isNew = !acc;
      if (isNew) {
        acc = { accessory: new Accessory(want.name, id), services: new Map(), isRoutines: Boolean(want.isRoutines), isSensor: Boolean(want.isSensor) };
        setInfo(acc.accessory, want.model, id);
        this.accessories.set(id, acc);
      }
      if (!isNew && acc.name !== want.name) {
        acc.accessory.getService(Service.AccessoryInformation).updateCharacteristic(Characteristic.Name, want.name);
      }
      acc.name = want.name;
      const wanted = new Map(want.entries.map((e) => [e.subtype, e]));
      for (const [subtype, entry] of acc.services) {
        const w = wanted.get(subtype);
        if (w && typeKey(w) === entry.typeKey) continue;
        acc.accessory.removeService(entry.service);
        acc.services.delete(subtype);
        if (entry.deviceId) this.byControl.delete(`${entry.deviceId}::${entry.code}`);
      }
      for (const w of want.entries) {
        const existing = acc.services.get(w.subtype);
        if (existing) {
          existing.ref = w;
          if (existing.name !== w.name) {
            setNames(existing.service, w.name);
            existing.name = w.name;
          }
          continue;
        }
        const entry = this.createService(acc.accessory, w);
        acc.services.set(w.subtype, entry);
        if (entry.deviceId) this.byControl.set(`${entry.deviceId}::${entry.code}`, entry);
      }
      if (isNew) bridge.addBridgedAccessory(acc.accessory, !live);
    }
  }

  // ── Reads, writes, live updates ──

  read(entry) {
    const conn = this.gateway.get(entry.deviceId);
    if (!conn || !conn.connected) throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    return conn.status[entry.code];
  }

  guardWrite(entry) {
    const config = readConfig();
    // App lock (loop protection) and the setup gate pause all control, as in the app.
    if (config.locked === true || this.gateway.locked || !config.superProtected) {
      throw new HapStatusError(HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }
    if (entry && entry.deviceId) {
      const flags = controlFlags(config, entry.deviceId, entry.code);
      if (flags.protected || flags.superProtected) throw new HapStatusError(HAPStatus.INSUFFICIENT_PRIVILEGES);
    }
  }

  async command(entry, value) {
    this.guardWrite(entry);
    const ref = entry.ref;
    try {
      await this.gateway.command(entry.deviceId, [{ code: entry.code, value }]);
    } catch (e) {
      console.log(`[homekit] command failed ${entry.deviceId} ${entry.code}: ${e.message}`);
      logAction("COMMAND_FAILED", { user: "Apple Home", room: ref.roomName, device: ref.deviceName, code: entry.code, value, error: e.message });
      throw new HapStatusError(/locked|super-protected/.test(e.message)
        ? HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE
        : HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    logAction("COMMAND", { user: "Apple Home", room: ref.roomName, device: ref.deviceName, control: ref.name, code: entry.code, value, ok: true });
  }

  onChange(e) {
    const key = `${e.deviceId}::${e.code}`;
    const entry = this.byControl.get(key);
    if (entry && entry.push) entry.push(e.value);
    if (this.lightKeys.has(key)) this.pushLightSensor();
  }

  anyLightOn() {
    for (const r of this.lightRefs) {
      const conn = this.gateway.get(r.deviceId);
      if (!conn) continue;
      const v = conn.status[r.code];
      if (r.type === "Integer" ? Number(v) > r.min : v === true) return true;
    }
    return false;
  }

  pushLightSensor() {
    if (!this.lightSensor) return;
    this.lightSensor.updateCharacteristic(
      Characteristic.OccupancyDetected,
      this.anyLightOn()
        ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
        : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
    );
  }

  createService(accessory, w) {
    if (w.routineId) return this.routineService(accessory, w);
    if (w.sensor === "lights") {
      const svc = accessory.addService(Service.OccupancySensor, w.name, w.subtype);
      svc.getCharacteristic(Characteristic.OccupancyDetected).onGet(() =>
        this.anyLightOn()
          ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
          : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
      );
      setNames(svc, w.name);
      this.lightSensor = svc;
      return { service: svc, typeKey: typeKey(w), name: w.name, ref: w };
    }
    const key = `${w.deviceId}::${w.code}`;
    const entry = { service: null, typeKey: typeKey(w), deviceId: w.deviceId, code: w.code, ref: w, name: w.name, push: null };
    const fn = w.fn;

    switch (w.spec.kind) {
      case "light":
      case "outlet":
      case "switch":
      case "fanSwitch": {
        const type = { light: Service.Lightbulb, outlet: Service.Outlet, switch: Service.Switch, fanSwitch: Service.Fan }[w.spec.kind];
        const svc = accessory.addService(type, w.name, w.subtype);
        svc.getCharacteristic(Characteristic.On)
          .onGet(() => this.read(entry) === true)
          .onSet((v) => this.command(entry, Boolean(v)));
        const outlet = w.spec.kind === "outlet";
        if (outlet) svc.getCharacteristic(Characteristic.OutletInUse).onGet(() => this.read(entry) === true);
        entry.push = (value) => {
          svc.updateCharacteristic(Characteristic.On, value === true);
          if (outlet) svc.updateCharacteristic(Characteristic.OutletInUse, value === true);
        };
        entry.service = svc;
        break;
      }

      case "dimmer": {
        const lo = fn.min ?? 0;
        const hi = fn.max ?? 100;
        const span = Math.max(hi - lo, 1);
        const step = fn.step && fn.step > 0 ? fn.step : 1;
        const toPct = (v) => Math.max(0, Math.min(100, Math.round(((Number(v) - lo) / span) * 100)));
        const fromPct = (p) => Math.min(hi, Math.max(lo, lo + Math.round(((p / 100) * span) / step) * step));
        const svc = accessory.addService(Service.Lightbulb, w.name, w.subtype);
        svc.getCharacteristic(Characteristic.On)
          .onGet(() => Number(this.read(entry)) > lo)
          .onSet((v) => this.command(entry, v ? this.lastLevel.get(key) ?? hi : lo));
        svc.getCharacteristic(Characteristic.Brightness)
          .onGet(() => {
            const v = Number(this.read(entry));
            return v > lo ? Math.max(1, toPct(v)) : toPct(this.lastLevel.get(key) ?? hi);
          })
          .onSet((p) => this.command(entry, Number(p) <= 0 ? lo : fromPct(Number(p))));
        entry.push = (value) => {
          const v = Number(value);
          if (v > lo) this.lastLevel.set(key, v);
          svc.updateCharacteristic(Characteristic.On, v > lo);
          if (v > lo) svc.updateCharacteristic(Characteristic.Brightness, Math.max(1, toPct(v)));
        };
        entry.service = svc;
        break;
      }

      case "fanLevels": {
        const levels = w.spec.levels;
        const m = levels.length;
        const middle = levels[Math.floor((m - 1) / 2)];
        const toPct = (v) => {
          const i = levels.indexOf(String(v));
          return i < 0 ? 0 : Math.round(((i + 1) / m) * 100);
        };
        const svc = accessory.addService(Service.Fanv2, w.name, w.subtype);
        svc.getCharacteristic(Characteristic.Active)
          .onGet(() => (String(this.read(entry) ?? "0") !== "0" ? 1 : 0))
          .onSet((v) => this.command(entry, v ? this.lastLevel.get(key) ?? middle : "0"));
        svc.getCharacteristic(Characteristic.RotationSpeed)
          .setProps({ minValue: 0, maxValue: 100, minStep: 100 / m })
          .onGet(() => toPct(this.read(entry)))
          .onSet((p) => {
            const pct = Number(p);
            if (pct <= 0) return this.command(entry, "0");
            const k = Math.min(m, Math.max(1, Math.round((pct / 100) * m)));
            return this.command(entry, levels[k - 1]);
          });
        entry.push = (value) => {
          const v = String(value ?? "0");
          if (v !== "0") this.lastLevel.set(key, v);
          svc.updateCharacteristic(Characteristic.Active, v !== "0" ? 1 : 0);
          if (v !== "0") svc.updateCharacteristic(Characteristic.RotationSpeed, toPct(v));
        };
        entry.service = svc;
        break;
      }

      default:
        throw new Error(`no HomeKit mapping for ${w.spec.kind}`);
    }

    setNames(entry.service, w.name);
    return entry;
  }

  /** A routine as a momentary switch: turning it on runs it, then it flips back off. */
  routineService(accessory, w) {
    const svc = accessory.addService(Service.Switch, w.name, w.subtype);
    const on = svc.getCharacteristic(Characteristic.On);
    on.onGet(() => false).onSet((v) => {
      if (!v) return;
      this.guardWrite(null);
      logAction("ROUTINE_RUN", { user: "Apple Home", routine: w.name, id: w.routineId });
      Promise.resolve(this.runRoutine && this.runRoutine(w.routineId)).catch((e) =>
        console.log(`[homekit] routine ${w.routineId} failed: ${e.message}`),
      );
      setTimeout(() => on.updateValue(false), 1000);
    });
    setNames(svc, w.name);
    return { service: svc, typeKey: "routine", routineId: w.routineId, name: w.name, ref: w };
  }
}

module.exports = { HomeKitBridge };
