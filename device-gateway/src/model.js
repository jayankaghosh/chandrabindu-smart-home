// The effective room → device → control model, as the app shows it: the cloud
// catalog merged with local overrides (renames, room moves, local rooms), plus
// the rule flags from config.json. Mirrors lib/store.ts getModel() so the
// gateway's HomeKit bridge uses exactly the names and rooms the user set.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const PATHS = {
  catalog: path.join(DATA_DIR, "catalog.json"),
  overrides: path.join(DATA_DIR, "overrides.json"),
  config: path.join(DATA_DIR, "config.json"),
  routines: path.join(DATA_DIR, "routines.json"),
};
const UNASSIGNED_ID = "__unassigned";

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function readConfig() {
  return readJson(PATHS.config, {});
}

/** Rule flags for one control, read from a config object. */
function controlFlags(config, deviceId, code) {
  const protectedCodes = (config.protectedControls && config.protectedControls[deviceId]) || [];
  const sp = config.superProtected;
  return {
    protected: protectedCodes.includes(code),
    superProtected: Boolean(sp && sp.deviceId === deviceId && sp.code === code),
  };
}

function buildModel() {
  const catalog = readJson(PATHS.catalog, null);
  if (!catalog) return { rooms: [] };
  const o = readJson(PATHS.overrides, {});
  const overrides = {
    deviceRoom: o.deviceRoom || {},
    deviceName: o.deviceName || {},
    roomName: o.roomName || {},
    controlName: o.controlName || {},
    extraRooms: o.extraRooms || [],
  };
  const config = readConfig();
  const roomLocks = config.roomLocks || {};

  const roomMap = new Map();
  for (const r of catalog.rooms || []) roomMap.set(r.id, r.name);
  for (const r of overrides.extraRooms) roomMap.set(r.id, r.name);
  for (const [id, name] of Object.entries(overrides.roomName)) roomMap.set(id, name);

  const rooms = Array.from(roomMap, ([id, name]) => ({ id, name, locked: Boolean(roomLocks[id]), devices: [] }));
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const unassigned = { id: UNASSIGNED_ID, name: "Other", locked: false, devices: [] };

  for (const d of catalog.devices || []) {
    const roomId = overrides.deviceRoom[d.id] || d.cloudRoomId || "";
    const device = {
      id: d.id,
      name: overrides.deviceName[d.id] || d.cloudName,
      bluetooth: /\b(ble|bluetooth)\b/i.test(d.cloudName || ""),
      functions: (d.functions || []).map((f) => ({
        code: f.code,
        name: (overrides.controlName[d.id] && overrides.controlName[d.id][f.code]) || f.name,
        type: f.type,
        range: f.range,
        min: f.min,
        max: f.max,
        step: f.step,
        ...controlFlags(config, d.id, f.code),
      })),
    };
    (byId.get(roomId) || unassigned).devices.push(device);
  }

  const result = rooms.filter((r) => r.devices.length > 0);
  if (unassigned.devices.length) result.push(unassigned);
  return { rooms: result, houseName: (config.houseName || "").trim() || "Home" };
}

function loadRoutines() {
  const r = readJson(PATHS.routines, []);
  return Array.isArray(r) ? r : Array.isArray(r.routines) ? r.routines : [];
}

module.exports = { buildModel, loadRoutines, readConfig, controlFlags, PATHS };
