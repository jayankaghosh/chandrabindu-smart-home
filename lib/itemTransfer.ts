// Export / import of a single routine, automation or shortcut as a small .cnbdu
// file (a JSON envelope tagged "cnbdu-item", so it can't be mistaken for a full
// backup). Automations and shortcuts that run a routine carry that routine in
// the file: on import it is reused if the same routine exists on this hub,
// otherwise recreated. References to switches this hub doesn't have are
// dropped and reported as warnings. Imports always create new records.

import { addAutomation, listAutomations } from "./automations";
import { addShortcut, cleanShortcutConditions, getShortcut, listShortcuts } from "./shortcuts";
import { addRoutine, getModel, getRoutine, readCatalog, readRoutines } from "./store";
import type { AutomationAction, AutomationCondition, Routine, RoutineAction, ShortcutCondition } from "./types";
import { isRoutineAction } from "./types";

export type ItemKind = "routine" | "automation" | "shortcut";
export const ITEM_KINDS: ItemKind[] = ["routine", "automation", "shortcut"];

export interface ItemBundle {
  format: "cnbdu-item";
  version: 1;
  kind: ItemKind;
  exportedAt: number;
  item: Record<string, unknown>;
  /** Routines referenced by run-routine actions (automations and shortcuts). */
  routines?: Routine[];
}

const LABEL: Record<ItemKind, string> = { routine: "routine", automation: "automation", shortcut: "shortcut" };
const SECTION: Record<ItemKind, string> = { routine: "Routines", automation: "Automations", shortcut: "Shortcuts" };

async function referencedRoutines(actions: AutomationAction[]): Promise<Routine[]> {
  const out: Routine[] = [];
  for (const id of new Set(actions.filter(isRoutineAction).map((a) => a.routineId))) {
    const r = await getRoutine(id);
    if (r) out.push(r);
  }
  return out;
}

/** Build the export file for one item, or null if it doesn't exist. */
export async function exportItem(kind: ItemKind, id: string): Promise<{ bundle: ItemBundle; name: string } | null> {
  let item: Record<string, unknown>;
  let routines: Routine[] | undefined;
  let name: string;
  if (kind === "routine") {
    const r = await getRoutine(id);
    if (!r) return null;
    name = r.name;
    item = { name: r.name, actions: r.actions };
  } else if (kind === "automation") {
    const a = listAutomations().find((x) => x.id === id);
    if (!a) return null;
    name = a.name;
    item = { name: a.name, match: a.match, enabled: a.enabled, conditions: a.conditions, actions: a.actions };
    routines = await referencedRoutines(a.actions);
  } else {
    const s = getShortcut(id);
    if (!s) return null;
    name = s.name;
    item = { name: s.name, match: s.match, conditions: s.conditions, actions: s.actions, apiEnabled: s.apiEnabled };
    routines = await referencedRoutines(s.actions);
  }
  return { bundle: { format: "cnbdu-item", version: 1, kind, exportedAt: Date.now(), item, routines }, name };
}

export interface ImportResult {
  kind: ItemKind;
  id: string;
  name: string;
  warnings: string[];
}

function uniqueName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  let candidate = `${name} (imported)`;
  for (let n = 2; lower.has(candidate.toLowerCase()); n++) candidate = `${name} (imported ${n})`;
  return candidate;
}

/** Import a parsed .cnbdu item file as a new record of the expected kind. */
export async function importItem(expected: ItemKind, raw: unknown): Promise<ImportResult> {
  const b = raw as Partial<ItemBundle> | null;
  if ((b as { format?: string } | null)?.format === "cnbdu") {
    throw new Error("This is a full backup. Restore it from Settings > Backup & restore instead.");
  }
  if (!b || b.format !== "cnbdu-item" || !b.item || !ITEM_KINDS.includes(b.kind as ItemKind)) {
    throw new Error("Not a valid exported .cnbdu item file.");
  }
  if (b.kind !== expected) {
    throw new Error(`This file is ${b.kind === "automation" ? "an" : "a"} ${LABEL[b.kind as ItemKind]}. Import it under ${SECTION[b.kind as ItemKind]}.`);
  }

  const warnings: string[] = [];
  const catalog = await readCatalog();
  const devices = new Map((catalog?.devices ?? []).map((d) => [d.id, new Set(d.functions.map((f) => f.code))]));
  const hasControl = (deviceId: unknown, code: unknown) =>
    typeof deviceId === "string" && typeof code === "string" && Boolean(devices.get(deviceId)?.has(code));

  const keepRoutineActions = (actions: unknown, what: string): RoutineAction[] => {
    const list = Array.isArray(actions) ? actions : [];
    const kept = list.filter((a: any) => a && hasControl(a.deviceId, a.code)) as RoutineAction[];
    if (kept.length < list.length) warnings.push(`${list.length - kept.length} switch(es) in ${what} don't exist on this hub and were left out.`);
    return kept.map((a) => ({ deviceId: a.deviceId, code: a.code, value: a.value, delayMs: Math.max(0, Number(a.delayMs) || 0) }));
  };

  const item = b.item as any;
  const itemName = typeof item.name === "string" && item.name.trim() ? item.name.trim() : `Imported ${LABEL[expected]}`;

  if (expected === "routine") {
    const actions = keepRoutineActions(item.actions, "this routine");
    if (actions.length === 0) throw new Error("None of this routine's switches exist on this hub.");
    const name = uniqueName(itemName, (await readRoutines()).map((r) => r.name));
    const routine = await addRoutine(name, actions);
    return { kind: expected, id: routine.id, name, warnings };
  }

  // Automations and shortcuts: map run-routine actions to routines on this hub.
  const bundled = new Map((b.routines ?? []).map((r) => [r.id, r]));
  const routineIdMap = new Map<string, string | null>();
  const resolveRoutine = async (id: string): Promise<string | null> => {
    if (routineIdMap.has(id)) return routineIdMap.get(id)!;
    let mapped: string | null = null;
    if (await getRoutine(id)) {
      mapped = id; // same hub (or same id): reuse it
    } else if (bundled.has(id)) {
      const src = bundled.get(id)!;
      const actions = keepRoutineActions(src.actions, `routine "${src.name}"`);
      if (actions.length) {
        const name = uniqueName(src.name, (await readRoutines()).map((r) => r.name));
        mapped = (await addRoutine(name, actions)).id;
        warnings.push(`Created the routine "${name}" it runs.`);
      } else {
        warnings.push(`The routine "${src.name}" has no switches on this hub, so it was left out.`);
      }
    } else {
      warnings.push("It ran a routine that isn't on this hub, so that step was left out.");
    }
    routineIdMap.set(id, mapped);
    return mapped;
  };

  const actions: AutomationAction[] = [];
  let droppedActions = 0;
  for (const a of Array.isArray(item.actions) ? item.actions : []) {
    if (a?.type === "routine" && typeof a.routineId === "string") {
      const id = await resolveRoutine(a.routineId);
      if (id) actions.push({ type: "routine", routineId: id });
    } else if (a && hasControl(a.deviceId, a.code)) {
      actions.push({ type: "device", deviceId: a.deviceId, code: a.code, value: a.value });
    } else {
      droppedActions++;
    }
  }
  if (droppedActions) warnings.push(`${droppedActions} THEN step(s) use switches this hub doesn't have and were left out.`);
  if (actions.length === 0) throw new Error("None of its THEN steps can run on this hub.");

  const roomIds = new Set((await getModel()).rooms.map((r) => r.id));
  let droppedConditions = 0;
  const keepCondition = (c: any): boolean => {
    if (c?.type === "group") return c.scope === "house" || roomIds.has(c.scope);
    if (c?.type === "time" || c?.type === "sun" || c?.type === "window") return true;
    return hasControl(c?.deviceId, c?.code);
  };
  const conditions = (Array.isArray(item.conditions) ? item.conditions : []).filter((c: any) => {
    const ok = keepCondition(c);
    if (!ok) droppedConditions++;
    return ok;
  });
  if (droppedConditions) warnings.push(`${droppedConditions} IF condition(s) refer to switches or rooms this hub doesn't have and were left out.`);

  if (expected === "automation") {
    if (conditions.length === 0) throw new Error("None of its IF conditions can be used on this hub.");
    const name = uniqueName(itemName, listAutomations().map((a) => a.name));
    const automation = addAutomation({
      name,
      match: item.match,
      enabled: item.enabled,
      conditions: conditions as AutomationCondition[],
      actions,
    });
    return { kind: expected, id: automation.id, name, warnings };
  }

  const name = uniqueName(itemName, listShortcuts().map((s) => s.name));
  const shortcut = addShortcut({
    name,
    match: item.match,
    conditions: cleanShortcutConditions(conditions) as ShortcutCondition[],
    actions,
    apiEnabled: item.apiEnabled === true,
  });
  return { kind: expected, id: shortcut.id, name, warnings };
}
