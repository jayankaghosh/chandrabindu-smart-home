// Assistant chat: answer questions about the home and translate natural-language
// requests into concrete, validated device actions (which the UI confirms before
// running). Uses the shared OpenRouter helper.

import { getOpenRouter, getHouseName } from "./config";
import { getModel, listRoutinesEnriched, readCatalog } from "./store";
import { getStatusLocal } from "./local";
import { callOpenRouter, extractJson, type ChatMessage } from "./ai";
import { readMemory, applyMemoryUpdate } from "./chatMemory";
import type { CatalogDevice, DeviceFunction } from "./types";

const CONTROLLABLE = ["Boolean", "Enum", "Integer"];

export interface AssistantAction {
  deviceId: string;
  code: string;
  value: unknown;
  deviceName: string;
  roomName: string;
  controlName: string;
  valueLabel: string;
  locked?: boolean;
}

export interface AssistantRoutine {
  routineId: string;
  name: string;
  actionCount: number;
}

interface DeviceEntry {
  device: { id: string; name: string; functions: DeviceFunction[] };
  roomId: string;
  roomName: string;
}

function valueLabel(fn: DeviceFunction | undefined, v: unknown): string {
  if (fn?.type === "Boolean") return v === true ? "On" : "Off";
  if (fn?.type === "Enum" && /^\d+$/.test(String(v))) return `${v}${fn.unit ?? "%"}`;
  return `${v}${fn?.unit ?? ""}`;
}

/** Build the structural device index + a prompt context string (optionally live). */
async function buildContext(includeLive: boolean): Promise<{
  text: string;
  index: Map<string, DeviceEntry>;
  routineIndex: Map<string, { name: string; actionCount: number }>;
}> {
  const { rooms } = await getModel();
  const index = new Map<string, DeviceEntry>();

  // Live status (best-effort, in parallel) keyed by deviceId → {code: value}.
  let live = new Map<string, Record<string, unknown>>();
  if (includeLive) {
    const catalog = await readCatalog();
    const byId = new Map((catalog?.devices ?? []).map((d) => [d.id, d]));
    const ids = rooms.flatMap((r) => r.devices.map((d) => d.id));
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const meta = byId.get(id) as CatalogDevice | undefined;
        if (!meta) return null;
        const status = await getStatusLocal(meta);
        const values: Record<string, unknown> = {};
        for (const s of status) values[s.code] = s.value;
        return [id, values] as const;
      }),
    );
    live = new Map(
      results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && !!r.value)
        .map((r) => r.value),
    );
  }

  const deviceCount = rooms.reduce((n, r) => n + r.devices.length, 0);
  const lines: string[] = [
    `Home "${getHouseName()}": ${rooms.length} rooms, ${deviceCount} devices.`,
    "",
    "Rooms and devices (use the exact deviceId and control code in actions):",
  ];

  for (const room of rooms) {
    const lockNote = room.locked ? (room.unlocked ? " [locked, unlocked]" : " [LOCKED]") : "";
    lines.push(`- Room "${room.name}" (roomId: ${room.id})${lockNote}:`);
    if (!room.devices.length) lines.push("    • (no devices)");
    for (const d of room.devices) {
      index.set(d.id, {
        device: { id: d.id, name: d.name, functions: d.functions },
        roomId: room.id,
        roomName: room.name,
      });
      const controls = d.functions
        .filter((f) => CONTROLLABLE.includes(f.type))
        .map((f) => {
          const cur = live.get(d.id)?.[f.code];
          const curNote = includeLive && cur !== undefined ? ` =${cur}` : "";
          if (f.type === "Enum" && f.range?.length)
            return `code "${f.code}" (${f.name}) Enum[${f.range.join("/")}]${curNote}`;
          if (f.type === "Integer")
            return `code "${f.code}" (${f.name}) Integer[${f.min ?? 0}-${f.max ?? 100}]${curNote}`;
          return `code "${f.code}" (${f.name}) Boolean${curNote}`;
        });
      lines.push(
        `    • ${d.name} (deviceId: ${d.id}, category: ${d.category}): ${controls.join("; ") || "(no controls)"}`,
      );
    }
  }

  // Saved routines — the user can ask to run these by routineId.
  const routines = await listRoutinesEnriched();
  const routineIndex = new Map<string, { name: string; actionCount: number }>();
  lines.push("", "Saved routines (run by routineId):");
  if (!routines.length) {
    lines.push("- (none defined yet)");
  } else {
    for (const rt of routines) {
      routineIndex.set(rt.id, { name: rt.name, actionCount: rt.actions.length });
      const acts = rt.actions
        .map(
          (a) =>
            `${a.deviceName} ${a.controlName}→${a.valueLabel}${a.delayMs ? ` (after ${a.delayMs}ms)` : ""}`,
        )
        .join("; ");
      lines.push(`- "${rt.name}" (routineId: ${rt.id}): ${acts}`);
    }
  }

  return { text: lines.join("\n"), index, routineIndex };
}

const SYSTEM_PROMPT = `You are the assistant for a smart-home dashboard. You are given a CONTEXT block describing the home's rooms, devices (with their deviceId and category), and each device's controls (with the exact control "code", type, allowed values, and — when available — current value after "="). "Boolean" controls are on/off (true/false); switches/lights are usually Boolean codes named like switch_N or by control name.

Respond with ONLY a JSON object (no markdown, no code fences) in this shape:
{
  "reply": "a short, friendly natural-language message to the user",
  "actions": [ { "deviceId": "<id from context>", "code": "<control code from context>", "value": <true|false | "enumValue" | number> } ],
  "routines": [ { "routineId": "<id from the Saved routines list>" } ],
  "memory": { "add": ["a durable fact or preference about THIS user worth remembering"], "remove": ["text of a remembered item that is no longer true"] }
}

Rules:
- For QUESTIONS (counts, what's on, which devices are lights, what routines exist, etc.), answer in "reply" using the context and set "actions" and "routines" to [].
- For COMMANDS that change device state, fill "actions" with one entry per device control to change, using the EXACT deviceId and code from the context, and a value matching the control type (Boolean true/false; Enum one of its listed values; Integer within range).
- To RUN a saved routine (e.g. "run Good Night", "activate movie mode"), add it to "routines" using its exact routineId from the Saved routines list — do NOT re-list its individual actions in "actions". You may combine ad-hoc "actions" and "routines".
- In "reply", describe what you're about to do — do NOT claim it is done (the user must confirm first).
- Interpret natural language sensibly: "lights" = lighting switches; "striplights" = devices/controls whose name contains "strip"; "all other lights" = lighting controls not matched by the first clause. Use device and control NAMES to decide what counts as a light.
- Never invent deviceIds, codes, or routineIds that are not in the context. If you cannot map a request, explain why in "reply" with empty arrays.
- "memory": you are given "What you remember about this user" in the context. Use "memory.add" ONLY for durable, user-specific facts or preferences worth recalling later (e.g. a nickname for a room, a habit/schedule, a standing preference like "likes the bedroom dim at night", their name). Do NOT store one-off commands, current device states, or things already remembered. Use "memory.remove" when a remembered item is contradicted or no longer true. Leave both arrays empty when there is nothing to change.
- Keep "reply" concise. Output JSON only.`;

function coerce(value: unknown, fn: DeviceFunction): unknown | null {
  if (fn.type === "Boolean") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (["true", "on", "1", "yes"].includes(s)) return true;
    if (["false", "off", "0", "no"].includes(s)) return false;
    return null;
  }
  if (fn.type === "Enum") {
    const s = String(value);
    return fn.range?.includes(s) ? s : null;
  }
  if (fn.type === "Integer") {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (typeof fn.min === "number" && n < fn.min) return null;
    if (typeof fn.max === "number" && n > fn.max) return null;
    return n;
  }
  return null;
}

/** Device index without live status — fast, used to re-validate confirmed actions. */
export async function buildDeviceIndex(): Promise<Map<string, DeviceEntry>> {
  const { rooms } = await getModel();
  const index = new Map<string, DeviceEntry>();
  for (const room of rooms) {
    for (const d of room.devices) {
      index.set(d.id, {
        device: { id: d.id, name: d.name, functions: d.functions },
        roomId: room.id,
        roomName: room.name,
      });
    }
  }
  return index;
}

/** Validate raw model actions against the catalog; drop anything invalid. */
export function validateActions(
  raw: any[],
  index: Map<string, DeviceEntry>,
): AssistantAction[] {
  const out: AssistantAction[] = [];
  for (const a of raw) {
    if (!a || typeof a.deviceId !== "string" || typeof a.code !== "string") continue;
    const entry = index.get(a.deviceId);
    if (!entry) continue;
    const fn = entry.device.functions.find((f) => f.code === a.code);
    if (!fn || !CONTROLLABLE.includes(fn.type)) continue;
    const value = coerce(a.value, fn);
    if (value === null) continue;
    out.push({
      deviceId: a.deviceId,
      code: a.code,
      value,
      deviceName: entry.device.name,
      roomName: entry.roomName,
      controlName: fn.name,
      valueLabel: valueLabel(fn, value),
    });
  }
  return out;
}

/** Match model-proposed routine runs against the saved routines. */
export function validateRoutines(
  raw: any[],
  routineIndex: Map<string, { name: string; actionCount: number }>,
): AssistantRoutine[] {
  const out: AssistantRoutine[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const id = typeof r === "string" ? r : r?.routineId;
    if (typeof id !== "string" || seen.has(id)) continue;
    const meta = routineIndex.get(id);
    if (!meta) continue;
    seen.add(id);
    out.push({ routineId: id, name: meta.name, actionCount: meta.actionCount });
  }
  return out;
}

export interface AssistantReply {
  reply: string;
  actions: AssistantAction[];
  routines: AssistantRoutine[];
}

/** Run one assistant turn. `history` is prior turns (role + content). */
export async function runAssistant(
  username: string,
  history: ChatMessage[],
): Promise<AssistantReply> {
  const cfg = getOpenRouter();
  if (!cfg) {
    throw new Error("AI features are off. Enable them in Settings.");
  }
  // Include live status only when the latest user message seems to ask about state.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const wantsLive = /\b(on|off|status|currently|running|state|how many)\b/i.test(lastUser);

  const { text: context, index, routineIndex } = await buildContext(wantsLive);
  const memory = readMemory(username);
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `=== CONTEXT ===\n${context}` },
  ];
  if (memory.length) {
    messages.push({
      role: "system",
      content: `=== What you remember about this user ===\n- ${memory.join("\n- ")}`,
    });
  }
  messages.push(...history.slice(-8));

  const out = await callOpenRouter(cfg.apiKey, cfg.model, messages, {
    maxTokens: 900,
    temperature: 0.2,
    jsonObject: true,
  });
  const parsed = extractJson(out);
  if (!parsed) {
    return {
      reply: out || "Sorry, I couldn't understand that.",
      actions: [],
      routines: [],
    };
  }
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : "Done.";
  const actions = Array.isArray(parsed.actions)
    ? validateActions(parsed.actions, index)
    : [];
  const routines = Array.isArray(parsed.routines)
    ? validateRoutines(parsed.routines, routineIndex)
    : [];
  // Persist any memory changes the model proposed for this user.
  if (parsed.memory && typeof parsed.memory === "object") {
    applyMemoryUpdate(username, parsed.memory);
  }
  return { reply, actions, routines };
}
