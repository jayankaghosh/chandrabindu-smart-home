// Shortcuts: admin-authored IF/THEN rules that run only when triggered (a
// button in the UI, or a token-protected URL when API access is on). Nothing
// listens in the background, unlike automations. On a run the IF is checked
// against live device state; if it holds, the THEN runs. Actions actuate via
// setCommandLocal (so the app lock and super-protected rule apply) and skip
// protected controls, like automations and routines.
//
// Store: data/shortcuts.json ({ shortcuts: [...] }), read per request.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type {
  DeviceCondition,
  DeviceFunction,
  GroupCondition,
  Shortcut,
  ShortcutCondition,
  TimeWindowCondition,
  WindowPoint,
} from "./types";
import { isRoutineAction } from "./types";
import { cleanActions } from "./automations";
import { guardMet } from "./automationScheduler";
import { getCatalogDevice, getModel } from "./store";
import { AppLockedError, getStatusLocal, setCommandLocal } from "./local";
import { isControlProtected } from "./config";
import { getSunTimes, type SunTimes } from "./sunTimes";
import { runRoutineActions } from "./runRoutine";
import { controlKind } from "./icons";
import { isChildLock } from "./panelLock";
import { logAction } from "./logger";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA_DIR = path.join(process.cwd(), "data");
const PATH = path.join(DATA_DIR, "shortcuts.json");

// ── Store ───────────────────────────────────────────────────────────────────

function read(): Shortcut[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.shortcuts;
    return Array.isArray(list)
      ? list.filter((x: any) => x && typeof x.id === "string" && Array.isArray(x.conditions) && Array.isArray(x.actions))
      : [];
  } catch {
    return [];
  }
}

function write(list: Shortcut[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify({ shortcuts: list }, null, 2), "utf8");
}

function cleanPoint(raw: any): WindowPoint | null {
  if (raw?.kind === "time" && typeof raw.time === "string" && TIME_RE.test(raw.time)) {
    return { kind: "time", time: raw.time };
  }
  if (raw?.kind === "sun" && (raw.event === "sunrise" || raw.event === "sunset")) {
    const off = Number(raw.offsetMin);
    return { kind: "sun", event: raw.event, offsetMin: Number.isFinite(off) ? Math.max(-720, Math.min(720, Math.round(off))) : 0 };
  }
  return null;
}

/** Device guards, group checks and time windows; anything malformed is dropped. */
export function cleanShortcutConditions(raw: unknown): ShortcutCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: ShortcutCondition[] = [];
  for (const c of raw as any[]) {
    if (!c) continue;
    if (c.type === "group") {
      if (typeof c.scope === "string" && c.scope && (c.kind === "lights" || c.kind === "switches") && (c.state === "allOff" || c.state === "anyOn")) {
        out.push({ type: "group", scope: c.scope, kind: c.kind, state: c.state });
      }
    } else if (c.type === "window") {
      const from = cleanPoint(c.from);
      const to = cleanPoint(c.to);
      if (from && to) out.push({ type: "window", from, to });
    } else if ((c.type === undefined || c.type === "device") && typeof c.deviceId === "string" && typeof c.code === "string" && "value" in c) {
      out.push({ type: "device", deviceId: c.deviceId, code: c.code, value: c.value });
    }
  }
  return out;
}

export interface ShortcutInput {
  name?: unknown;
  match?: unknown;
  conditions?: unknown;
  actions?: unknown;
  apiEnabled?: unknown;
}

function normalize(input: ShortcutInput): Omit<Shortcut, "id"> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Shortcut name is required");
  const actions = cleanActions(input.actions);
  if (actions.length === 0) throw new Error("Add at least one THEN action");
  return {
    name,
    match: input.match === "any" ? "any" : "all",
    conditions: cleanShortcutConditions(input.conditions), // none = always runs
    actions,
    apiEnabled: input.apiEnabled === true,
  };
}

export function listShortcuts(): Shortcut[] {
  return read();
}

export function getShortcut(id: string): Shortcut | null {
  return read().find((s) => s.id === id) ?? null;
}

export function addShortcut(input: ShortcutInput): Shortcut {
  const shortcut: Shortcut = { id: `sc-${crypto.randomBytes(6).toString("hex")}`, ...normalize(input) };
  const list = read();
  list.push(shortcut);
  write(list);
  return shortcut;
}

export function updateShortcut(id: string, input: ShortcutInput): Shortcut {
  const list = read();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) throw new Error("Shortcut not found");
  // Lightweight API-access toggle without full re-validation.
  if (input.apiEnabled !== undefined && input.name === undefined && input.conditions === undefined && input.actions === undefined) {
    list[idx] = { ...list[idx], apiEnabled: input.apiEnabled === true };
  } else {
    list[idx] = { id, ...normalize(input) };
  }
  write(list);
  return list[idx];
}

export function deleteShortcut(id: string): void {
  write(read().filter((s) => s.id !== id));
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export interface ConditionResult {
  met: boolean;
  detail: string;
}

export interface ShortcutRunResult {
  ran: boolean;
  conditionsMet: boolean;
  done: number;
  failed: number;
  skippedProtected: number;
  conditions: ConditionResult[];
  message: string;
}

/** Reads each device's live values once per run. */
function statusReader() {
  const cache = new Map<string, Promise<Record<string, unknown> | null>>();
  return (deviceId: string) => {
    if (!cache.has(deviceId)) {
      cache.set(
        deviceId,
        (async () => {
          const meta = await getCatalogDevice(deviceId);
          if (!meta) return null;
          try {
            const values: Record<string, unknown> = {};
            for (const s of await getStatusLocal(meta)) values[s.code] = s.value;
            return values;
          } catch {
            return null; // unreachable
          }
        })(),
      );
    }
    return cache.get(deviceId)!;
  };
}

/** Which controls a group condition looks at. Protected ones and panel locks never count. */
function inGroup(fn: DeviceFunction, kind: GroupCondition["kind"]): boolean {
  if (isChildLock(fn.code) || fn.protected || fn.superProtected) return false;
  if (kind === "switches") return fn.type === "Boolean";
  return (fn.type === "Boolean" && controlKind(fn.name, fn.code) === "light") || fn.type === "Integer";
}

function isOnValue(fn: DeviceFunction, v: unknown): boolean {
  if (fn.type === "Integer") return Number(v) > (fn.min ?? 0);
  return v === true;
}

function hhmm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function fmt(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function pointMinutes(p: WindowPoint, sun: SunTimes | null): number | null {
  if (p.kind === "time") return hhmm(p.time);
  if (!sun) return null;
  const base = hhmm(p.event === "sunrise" ? sun.sunrise : sun.sunset);
  return Math.max(0, Math.min(1439, base + (p.offsetMin ?? 0)));
}

function evalWindow(c: TimeWindowCondition, sun: SunTimes | null): ConditionResult {
  const from = pointMinutes(c.from, sun);
  const to = pointMinutes(c.to, sun);
  if (from === null || to === null) {
    return { met: false, detail: "Sunrise/sunset unknown: set the location in Settings" };
  }
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  const met = from <= to ? now >= from && now < to : now >= from || now < to; // wraps midnight
  return { met, detail: `${fmt(now)} is ${met ? "inside" : "outside"} ${fmt(from)}-${fmt(to)}` };
}

export async function evaluateShortcut(shortcut: Shortcut): Promise<{ met: boolean; conditions: ConditionResult[] }> {
  if (shortcut.conditions.length === 0) return { met: true, conditions: [] };
  const read = statusReader();
  const needsModel = shortcut.conditions.some((c) => c.type === "group");
  const needsSun = shortcut.conditions.some((c) => c.type === "window" && (c.from.kind === "sun" || c.to.kind === "sun"));
  const [model, sun] = await Promise.all([needsModel ? getModel() : null, needsSun ? getSunTimes() : null]);

  const results: ConditionResult[] = [];
  for (const c of shortcut.conditions) {
    if (c.type === "window") {
      results.push(evalWindow(c, sun));
    } else if (c.type === "group") {
      const rooms = (model?.rooms ?? []).filter((r) => c.scope === "house" || r.id === c.scope);
      if (c.scope !== "house" && rooms.length === 0) {
        results.push({ met: false, detail: "That room no longer exists" });
        continue;
      }
      const targets = rooms.flatMap((r) =>
        r.devices.filter((d) => !d.bluetooth).flatMap((d) => d.functions.filter((f) => inGroup(f, c.kind)).map((fn) => ({ deviceId: d.id, fn }))),
      );
      const values = new Map<string, Record<string, unknown> | null>();
      await Promise.all([...new Set(targets.map((t) => t.deviceId))].map(async (id) => values.set(id, await read(id))));
      let on = 0;
      let unknown = 0;
      for (const t of targets) {
        const v = values.get(t.deviceId);
        if (!v || !(t.fn.code in v)) unknown++;
        else if (isOnValue(t.fn, v[t.fn.code])) on++;
      }
      const met = c.state === "allOff" ? on === 0 : on > 0;
      results.push({ met, detail: `${on} of ${targets.length - unknown} ${c.kind} on${unknown ? ` (${unknown} unreachable)` : ""}` });
    } else {
      const values = await read(c.deviceId);
      results.push(values ? { met: guardMet(c as DeviceCondition, values), detail: "" } : { met: false, detail: "Device unreachable" });
    }
  }
  const met = shortcut.match === "any" ? results.some((r) => r.met) : results.every((r) => r.met);
  return { met, conditions: results };
}

/** Check the IF and, if it holds, run the THEN. Throws AppLockedError if the app is locked. */
export async function runShortcut(shortcut: Shortcut, via: string): Promise<ShortcutRunResult> {
  const { met, conditions } = await evaluateShortcut(shortcut);
  if (!met) {
    logAction("SHORTCUT_SKIPPED", { id: shortcut.id, name: shortcut.name, via });
    return { ran: false, conditionsMet: false, done: 0, failed: 0, skippedProtected: 0, conditions, message: "Conditions not met" };
  }

  let done = 0;
  let failed = 0;
  let skippedProtected = 0;
  for (const action of shortcut.actions) {
    if (isRoutineAction(action)) {
      try {
        const r = await runRoutineActions(action.routineId);
        done += r.ran;
        failed += r.failed;
        skippedProtected += r.skippedProtected;
      } catch {
        failed++;
      }
      continue;
    }
    if (isControlProtected(action.deviceId, action.code)) {
      skippedProtected++;
      continue;
    }
    const meta = await getCatalogDevice(action.deviceId);
    if (!meta) {
      failed++;
      continue;
    }
    try {
      await setCommandLocal(meta, [{ code: action.code, value: action.value }]);
      done++;
    } catch (e) {
      if (e instanceof AppLockedError) throw e;
      failed++;
    }
  }

  const bits = [`${done} done`];
  if (failed) bits.push(`${failed} failed`);
  if (skippedProtected) bits.push(`${skippedProtected} protected skipped`);
  logAction("SHORTCUT_RUN", { id: shortcut.id, name: shortcut.name, via, done, failed, skippedProtected });
  return { ran: true, conditionsMet: true, done, failed, skippedProtected, conditions, message: bits.join(" · ") };
}
