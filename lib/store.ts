// On-disk persistence for the device catalog (from cloud sync) and the local
// overrides (room re-assignments / renames). Server-only.

import { promises as fs } from "fs";
import path from "path";
import { isControlProtected } from "./config";
import type {
  Catalog,
  CatalogDevice,
  EnrichedRoutine,
  Overrides,
  Room,
  Routine,
  RoutineAction,
  UiDevice,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const OVERRIDES_PATH = path.join(DATA_DIR, "overrides.json");
const ROUTINES_PATH = path.join(DATA_DIR, "routines.json");

const EMPTY_OVERRIDES: Overrides = {
  deviceRoom: {},
  deviceName: {},
  roomName: {},
  controlName: {},
  extraRooms: [],
};

const UNASSIGNED_ID = "__unassigned";

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

export async function readCatalog(): Promise<Catalog | null> {
  return readJson<Catalog | null>(CATALOG_PATH, null);
}

export async function writeCatalog(catalog: Catalog): Promise<void> {
  await writeJson(CATALOG_PATH, catalog);
}

export async function readOverrides(): Promise<Overrides> {
  const o = await readJson<Partial<Overrides>>(OVERRIDES_PATH, {});
  return { ...EMPTY_OVERRIDES, ...o };
}

export async function writeOverrides(o: Overrides): Promise<void> {
  await writeJson(OVERRIDES_PATH, o);
}

export async function updateOverrides(
  mutate: (o: Overrides) => void,
): Promise<Overrides> {
  const o = await readOverrides();
  mutate(o);
  await writeOverrides(o);
  return o;
}

/** Look up a single device's catalog entry (includes key + dp ids). */
export async function getCatalogDevice(
  id: string,
): Promise<CatalogDevice | null> {
  const catalog = await readCatalog();
  return catalog?.devices.find((d) => d.id === id) ?? null;
}

/** The effective room name for a device (overrides → cloud → "Unassigned"). */
export async function getDeviceRoomName(deviceId: string): Promise<string> {
  const catalog = await readCatalog();
  const overrides = await readOverrides();
  const dev = catalog?.devices.find((d) => d.id === deviceId);
  const roomId = overrides.deviceRoom[deviceId] ?? dev?.cloudRoomId ?? "";
  if (!roomId) return "Unassigned";
  return (
    overrides.roomName[roomId] ??
    overrides.extraRooms.find((r) => r.id === roomId)?.name ??
    catalog?.rooms.find((r) => r.id === roomId)?.name ??
    "Unassigned"
  );
}

/**
 * The effective roomId for a device, matching getModel's assignment (overrides
 * → cloud → "__unassigned" when the room is unknown). Used for room-lock checks.
 */
export async function getDeviceRoomId(deviceId: string): Promise<string> {
  const catalog = await readCatalog();
  const overrides = await readOverrides();
  const dev = catalog?.devices.find((d) => d.id === deviceId);
  const roomId = overrides.deviceRoom[deviceId] ?? dev?.cloudRoomId ?? "";
  const known = new Set<string>();
  for (const r of catalog?.rooms ?? []) known.add(r.id);
  for (const r of overrides.extraRooms) known.add(r.id);
  for (const id of Object.keys(overrides.roomName)) known.add(id);
  return roomId && known.has(roomId) ? roomId : UNASSIGNED_ID;
}

/**
 * Write a fresh cloud sync, preserving manually-added devices and carrying
 * over each device's discovered LAN IP + detected protocol version so a
 * re-sync doesn't lose reachability.
 */
export async function applyCloudCatalog(cloud: Catalog): Promise<void> {
  const prev = await readCatalog();
  const prevById = new Map((prev?.devices ?? []).map((d) => [d.id, d]));
  for (const d of cloud.devices) {
    const p = prevById.get(d.id);
    if (p?.ip) d.ip = p.ip;
    if (p?.version) d.version = p.version;
  }
  const cloudIds = new Set(cloud.devices.map((d) => d.id));
  const manual = (prev?.devices ?? []).filter(
    (d) => d.manual && !cloudIds.has(d.id),
  );
  await writeCatalog({ ...cloud, devices: [...cloud.devices, ...manual] });
}

/** Insert or replace a device in the catalog (used for manual adds). */
export async function addManualDevice(device: CatalogDevice): Promise<void> {
  const catalog =
    (await readCatalog()) ?? { syncedAt: Date.now(), rooms: [], devices: [] };
  const idx = catalog.devices.findIndex((d) => d.id === device.id);
  if (idx >= 0) catalog.devices[idx] = device;
  else catalog.devices.push(device);
  await writeCatalog(catalog);
}

/** Find a room id by (case-insensitive) name, creating a local room if new. */
export async function ensureRoomByName(name: string): Promise<string> {
  const trimmed = name.trim() || "Other";
  const catalog = await readCatalog();
  const lower = trimmed.toLowerCase();

  const cloud = catalog?.rooms.find((r) => r.name.toLowerCase() === lower);
  if (cloud) return cloud.id;

  const o = await readOverrides();
  const extra = o.extraRooms.find((r) => r.name.toLowerCase() === lower);
  if (extra) return extra.id;

  const id = `local-${lower.replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  await updateOverrides((oo) => {
    oo.extraRooms.push({ id, name: trimmed });
  });
  return id;
}

/** The effective room → device model: catalog merged with local overrides. */
export async function getModel(): Promise<{
  syncedAt: number | null;
  rooms: Room[];
}> {
  const catalog = await readCatalog();
  if (!catalog) return { syncedAt: null, rooms: [] };

  const overrides = await readOverrides();

  // Build the room list: cloud rooms + locally-created rooms, name-overridden.
  const roomMap = new Map<string, string>();
  for (const r of catalog.rooms) roomMap.set(r.id, r.name);
  for (const r of overrides.extraRooms) roomMap.set(r.id, r.name);
  for (const [id, name] of Object.entries(overrides.roomName)) {
    roomMap.set(id, name);
  }

  const rooms: Room[] = Array.from(roomMap, ([id, name]) => ({
    id,
    name,
    devices: [],
  }));
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const unassigned: Room = { id: UNASSIGNED_ID, name: "Unassigned", devices: [] };

  for (const d of catalog.devices) {
    const roomId = overrides.deviceRoom[d.id] ?? d.cloudRoomId ?? "";
    const device: UiDevice = {
      id: d.id,
      name: overrides.deviceName[d.id] ?? d.cloudName,
      category: d.category,
      online: d.online,
      roomId: byId.has(roomId) ? roomId : UNASSIGNED_ID,
      functions: d.functions.map((f) => ({
        code: f.code,
        name: overrides.controlName[d.id]?.[f.code] ?? f.name,
        type: f.type,
        range: f.range,
        min: f.min,
        max: f.max,
        step: f.step,
        scale: f.scale,
        unit: f.unit,
        protected: isControlProtected(d.id, f.code),
      })),
    };
    (byId.get(roomId) ?? unassigned).devices.push(device);
  }

  // Drop empty rooms, but always show ones the user created locally.
  const localRoomIds = new Set(overrides.extraRooms.map((r) => r.id));
  const result = rooms.filter(
    (r) => r.devices.length > 0 || localRoomIds.has(r.id),
  );
  if (unassigned.devices.length) result.push(unassigned);

  return { syncedAt: catalog.syncedAt, rooms: result };
}

/** Flat list of rooms for move/rename UI. */
export async function listRooms(): Promise<{ id: string; name: string }[]> {
  const { rooms } = await getModel();
  return rooms.map((r) => ({ id: r.id, name: r.name }));
}

// ── Routines ─────────────────────────────────────────────────────────────────

export async function readRoutines(): Promise<Routine[]> {
  return readJson<Routine[]>(ROUTINES_PATH, []);
}

async function writeRoutines(routines: Routine[]): Promise<void> {
  await writeJson(ROUTINES_PATH, routines);
}

export async function addRoutine(
  name: string,
  actions: RoutineAction[],
): Promise<Routine> {
  const routines = await readRoutines();
  const id = `rtn-${Date.now().toString(36)}-${routines.length}`;
  const routine: Routine = { id, name, actions };
  routines.push(routine);
  await writeRoutines(routines);
  return routine;
}

export async function updateRoutine(
  id: string,
  name: string,
  actions: RoutineAction[],
): Promise<boolean> {
  const routines = await readRoutines();
  const idx = routines.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  routines[idx] = { id, name, actions };
  await writeRoutines(routines);
  return true;
}

export async function deleteRoutine(id: string): Promise<void> {
  const routines = await readRoutines();
  await writeRoutines(routines.filter((r) => r.id !== id));
}

export async function getRoutine(id: string): Promise<Routine | null> {
  const routines = await readRoutines();
  return routines.find((r) => r.id === id) ?? null;
}

/** Routines with device/control names + readable values resolved for display. */
export async function listRoutinesEnriched(): Promise<EnrichedRoutine[]> {
  const routines = await readRoutines();
  const catalog = await readCatalog();
  const overrides = await readOverrides();
  const byId = new Map((catalog?.devices ?? []).map((d) => [d.id, d]));

  const roomNameFor = (deviceId: string): string => {
    const dev = byId.get(deviceId);
    const roomId = overrides.deviceRoom[deviceId] ?? dev?.cloudRoomId ?? "";
    if (!roomId) return "Unassigned";
    return (
      overrides.roomName[roomId] ??
      overrides.extraRooms.find((r) => r.id === roomId)?.name ??
      catalog?.rooms.find((r) => r.id === roomId)?.name ??
      "Unassigned"
    );
  };

  return routines.map((r) => ({
    id: r.id,
    name: r.name,
    actions: r.actions.map((a) => {
      const d = byId.get(a.deviceId);
      const fn = d?.functions.find((f) => f.code === a.code);
      const deviceName =
        overrides.deviceName[a.deviceId] ?? d?.cloudName ?? "(removed device)";
      const controlName =
        overrides.controlName[a.deviceId]?.[a.code] ?? fn?.name ?? a.code;
      let valueLabel: string;
      if (fn?.type === "Boolean") {
        valueLabel = a.value === true ? "On" : "Off";
      } else if (fn?.type === "Enum" && /^\d+$/.test(String(a.value))) {
        valueLabel = `${a.value}${fn.unit ?? "%"}`;
      } else {
        valueLabel = `${a.value}${fn?.unit ?? ""}`;
      }
      return {
        deviceId: a.deviceId,
        code: a.code,
        value: a.value,
        delayMs: a.delayMs ?? 0,
        roomName: roomNameFor(a.deviceId),
        deviceName,
        controlName,
        type: fn?.type,
        valueLabel,
      };
    }),
  }));
}
