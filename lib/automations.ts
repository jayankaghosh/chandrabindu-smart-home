// Automation rules store (data/automations.json). Admin-authored via the web
// UI; the device gateway watches this file and evaluates the rules on each
// real-time state change. Synchronous fs with per-request reads (tiny file),
// matching lib/config.ts.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Automation, AutomationAction, AutomationCondition } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const PATH = path.join(DATA_DIR, "automations.json");

function read(): Automation[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.automations;
    return Array.isArray(list) ? list.filter(isAutomation) : [];
  } catch {
    return [];
  }
}

function write(list: Automation[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify({ automations: list }, null, 2), "utf8");
}

function isAutomation(x: any): x is Automation {
  return x && typeof x.id === "string" && Array.isArray(x.conditions) && Array.isArray(x.actions);
}

/** Keep only well-formed {deviceId, code, value} entries. */
function cleanClauses<T extends AutomationCondition | AutomationAction>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (a: any) => a && typeof a.deviceId === "string" && typeof a.code === "string" && "value" in a,
    )
    .map((a: any) => ({ deviceId: a.deviceId, code: a.code, value: a.value })) as T[];
}

export interface AutomationInput {
  name?: unknown;
  match?: unknown;
  enabled?: unknown;
  conditions?: unknown;
  actions?: unknown;
}

/** Validate + normalize user input into an Automation body (no id). Throws on bad input. */
function normalize(input: AutomationInput): Omit<Automation, "id"> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Automation name is required");
  const conditions = cleanClauses<AutomationCondition>(input.conditions);
  const actions = cleanClauses<AutomationAction>(input.actions);
  if (conditions.length === 0) throw new Error("Add at least one IF condition");
  if (actions.length === 0) throw new Error("Add at least one THEN action");
  return {
    name,
    match: input.match === "any" ? "any" : "all",
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    conditions,
    actions,
  };
}

export function listAutomations(): Automation[] {
  return read();
}

export function addAutomation(input: AutomationInput): Automation {
  const body = normalize(input);
  const automation: Automation = { id: `auto-${crypto.randomBytes(6).toString("hex")}`, ...body };
  const list = read();
  list.push(automation);
  write(list);
  return automation;
}

export function updateAutomation(id: string, input: AutomationInput): Automation {
  const list = read();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) throw new Error("Automation not found");
  // Allow a lightweight enable/disable toggle without full re-validation.
  if (
    input.enabled !== undefined &&
    input.name === undefined &&
    input.conditions === undefined &&
    input.actions === undefined
  ) {
    list[idx] = { ...list[idx], enabled: Boolean(input.enabled) };
  } else {
    list[idx] = { id, ...normalize(input) };
  }
  write(list);
  return list[idx];
}

export function deleteAutomation(id: string): void {
  write(read().filter((a) => a.id !== id));
}
