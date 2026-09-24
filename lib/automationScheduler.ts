// In-process automation scheduler (app side). Runs every 30s and fires
// automations that have a *trigger* condition (time-of-day or sun). Device-only
// automations are left to the gateway RuleEngine, which the gateway skips for
// any rule containing a trigger — so a rule fires from exactly one evaluator.
//
// A rule reads as: WHEN a trigger is due (once/day), IF the device guards pass
// (per match all/any), THEN run the actions. Actions actuate via setCommandLocal
// and skip protected controls (matching the gateway's fire()).

import fs from "fs";
import path from "path";
import { listAutomations } from "./automations";
import { listProtectedControls } from "./config";
import { getStatusLocal, setCommandLocal } from "./local";
import { getCatalogDevice } from "./store";
import { getSunTimes, type SunTimes } from "./sunTimes";
import { isTriggerCondition, isRoutineAction, type Automation, type AutomationCondition, type DeviceCondition } from "./types";
import { runRoutineActions } from "./runRoutine";
import { logAction } from "./logger";

const TICK_MS = 30_000;
// A trigger is eligible from its target minute up to GRACE_MIN later, so a
// still-false guard can be re-checked for a few ticks and a brief app restart
// near the target still catches the fire. Fires at most once/day per trigger.
const GRACE_MIN = 5;

const FIRED_PATH = path.join(process.cwd(), "data", "automationFired.json");

// key `${automationId}#${conditionIndex}` -> local YYYY-MM-DD it last fired.
// Persisted so a server restart within a trigger's grace window doesn't re-fire.
const firedOn = new Map<string, string>();

function loadFired(): void {
  try {
    const obj = JSON.parse(fs.readFileSync(FIRED_PATH, "utf8"));
    for (const [k, v] of Object.entries(obj)) if (typeof v === "string") firedOn.set(k, v);
  } catch {
    /* no file yet */
  }
}

function saveFired(): void {
  try {
    const today = localDate();
    // Drop stale entries so the file doesn't grow unbounded.
    for (const [k, v] of firedOn) if (v !== today) firedOn.delete(k);
    fs.mkdirSync(path.dirname(FIRED_PATH), { recursive: true });
    fs.writeFileSync(FIRED_PATH, JSON.stringify(Object.fromEntries(firedOn)), "utf8");
  } catch {
    /* best-effort */
  }
}

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Target minute-of-day for a trigger, or null if it can't be resolved today. */
function triggerTarget(cond: AutomationCondition, sun: SunTimes | null): number | null {
  if (cond.type === "time") return hhmmToMinutes(cond.time);
  if (cond.type === "sun") {
    if (!sun) return null;
    const base = hhmmToMinutes(cond.event === "sunrise" ? sun.sunrise : sun.sunset);
    return Math.max(0, Math.min(1439, base + (cond.offsetMin ?? 0)));
  }
  return null;
}

function guardMet(cond: DeviceCondition, values: Record<string, unknown>): boolean {
  const cur = values[cond.code];
  if (cur === undefined) return false;
  // Booleans: accept true/"true"/"on"/1 as "on".
  if (typeof cur === "boolean") {
    const want = cond.value === true || cond.value === "true" || cond.value === "on" || cond.value === 1;
    return cur === want;
  }
  return String(cur) === String(cond.value);
}

async function guardsPass(guards: DeviceCondition[], match: "all" | "any"): Promise<boolean> {
  if (guards.length === 0) return true;
  const results: boolean[] = [];
  // Read each distinct guard device once.
  const byDevice = new Map<string, DeviceCondition[]>();
  for (const g of guards) {
    const arr = byDevice.get(g.deviceId) ?? [];
    arr.push(g);
    byDevice.set(g.deviceId, arr);
  }
  for (const [deviceId, conds] of byDevice) {
    const meta = await getCatalogDevice(deviceId);
    let values: Record<string, unknown> = {};
    if (meta) {
      try {
        const status = await getStatusLocal(meta);
        for (const s of status) values[s.code] = s.value;
      } catch {
        values = {};
      }
    }
    for (const c of conds) results.push(guardMet(c, values));
  }
  return match === "any" ? results.some(Boolean) : results.every(Boolean);
}

async function fire(automation: Automation): Promise<void> {
  const protectedSet = new Set(listProtectedControls().map((p) => `${p.deviceId}:${p.code}`));
  let ran = 0;
  let skippedProtected = 0;
  for (const action of automation.actions) {
    if (isRoutineAction(action)) {
      try {
        await runRoutineActions(action.routineId);
        ran++;
      } catch {
        /* a failed routine shouldn't stop the rest */
      }
      continue;
    }
    if (protectedSet.has(`${action.deviceId}:${action.code}`)) {
      skippedProtected++;
      continue;
    }
    const meta = await getCatalogDevice(action.deviceId);
    if (!meta) continue;
    try {
      await setCommandLocal(meta, [{ code: action.code, value: action.value }]);
      ran++;
    } catch {
      /* a single failed action shouldn't stop the rest */
    }
  }
  logAction("AUTOMATION_RUN", { id: automation.id, name: automation.name, ran, skippedProtected, via: "scheduler" });
}

async function runTick(): Promise<void> {
  const autos = listAutomations().filter((a) => a.enabled && a.conditions.some(isTriggerCondition));
  if (autos.length === 0) return;

  const date = localDate();
  const now = nowMinutes();
  const needSun = autos.some((a) => a.conditions.some((c) => c.type === "sun"));
  const sun = needSun ? await getSunTimes() : null;

  for (const a of autos) {
    // Which triggers are due right now (and not yet fired today)?
    const dueKeys: string[] = [];
    a.conditions.forEach((c, i) => {
      if (!isTriggerCondition(c)) return;
      const target = triggerTarget(c, sun);
      if (target == null) return;
      const key = `${a.id}#${i}`;
      if (now >= target && now <= target + GRACE_MIN && firedOn.get(key) !== date) dueKeys.push(key);
    });
    if (dueKeys.length === 0) continue;

    // Guards are the device conditions; re-checked each tick until they pass.
    const guards = a.conditions.filter((c): c is DeviceCondition => c.type === "device") as DeviceCondition[];
    const ok = await guardsPass(guards, a.match);
    if (!ok) continue;

    await fire(a);
    for (const key of dueKeys) firedOn.set(key, date);
    saveFired();
  }
}

/** Start the single 30s scheduler loop. Safe to call more than once. */
export function startAutomationScheduler(): void {
  const g = globalThis as any;
  if (g.__shcAutomationScheduler) return;
  g.__shcAutomationScheduler = true;
  loadFired();
  // A short delayed first run, then every 30s. Errors are swallowed per-tick.
  setTimeout(() => void runTick().catch(() => {}), 5_000);
  setInterval(() => void runTick().catch(() => {}), TICK_MS);
  logAction("AUTOMATION_SCHEDULER_START", {});
}
