// Long-term memory for the assistant, shared by the chat and voice agents.
//
// Two tiers, one store:
//   • Personal — data/chatbot/memory/<username>.json — private to that user.
//   • Core     — data/chatbot/core-memory.json — shared house memory that EVERY
//                user's agent reads. Only the superadmin may write it, and only
//                when they explicitly ask (scope: "core"); everything else,
//                including the admin's own default memories, is personal.
//
// The model proposes { add, remove, scope? }; the server decides the target:
// scope "core" is honored only for the admin, otherwise it falls back to
// personal.

import fs from "fs";
import path from "path";

const CHATBOT_DIR = path.join(process.cwd(), "data", "chatbot");
const MEM_DIR = path.join(CHATBOT_DIR, "memory");
// Core lives OUTSIDE memory/ so it can never collide with a <username>.json.
const CORE_PATH = path.join(CHATBOT_DIR, "core-memory.json");
const MAX_ITEMS = 60;
const MAX_LEN = 200;

/** Sanitize a username into a safe filename (no path traversal). */
function fileFor(username: string): string {
  const safe =
    username.toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 64) || "user";
  return path.join(MEM_DIR, `${safe}.json`);
}

function readList(file: string): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const items = Array.isArray(data) ? data : data?.items;
    return Array.isArray(items)
      ? items.filter((x: unknown): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeList(file: string, items: string[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ items, updatedAt: Date.now() }, null, 2), "utf8");
}

/** A user's private memory. */
export function readMemory(username: string): string[] {
  return readList(fileFor(username));
}

/** The shared core (house) memory, read by every user's agent. */
export function readCoreMemory(): string[] {
  return readList(CORE_PATH);
}

/** Both tiers a user's agent should have in context: shared core + their own. */
export function getMemoryForPrompt(username: string): { core: string[]; personal: string[] } {
  return { core: readCoreMemory(), personal: readMemory(username) };
}

/** Apply add/remove to a single list, dedup + cap, and persist. */
function applyToFile(file: string, add: string[], remove: string[]): string[] {
  let items = readList(file);
  if (remove.length) {
    items = items.filter((it) => !remove.some((r) => it.toLowerCase().includes(r)));
  }
  for (const a of add) {
    if (!items.some((it) => it.toLowerCase() === a.toLowerCase())) items.push(a);
  }
  if (items.length > MAX_ITEMS) items = items.slice(items.length - MAX_ITEMS);
  writeList(file, items);
  return items;
}

/**
 * Apply the model's proposed memory changes. `add` are new facts; `remove` are
 * texts that drop a stored item if contained (case-insensitive). `scope: "core"`
 * writes to the shared core memory — honored ONLY when `opts.isAdmin` is true;
 * otherwise it falls back to the user's personal memory. Returns the updated
 * list for the tier that was written (personal by default).
 */
export function applyMemoryUpdate(
  username: string,
  update: { add?: unknown; remove?: unknown; scope?: unknown } | null | undefined,
  opts?: { isAdmin?: boolean },
): string[] {
  const add = Array.isArray(update?.add)
    ? (update!.add as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().slice(0, MAX_LEN))
        .filter(Boolean)
    : [];
  const remove = Array.isArray(update?.remove)
    ? (update!.remove as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  // Core only for the admin who explicitly asked; everything else is personal.
  const toCore = Boolean(opts?.isAdmin) && update?.scope === "core";

  if (!add.length && !remove.length) {
    return toCore ? readCoreMemory() : readMemory(username);
  }
  return applyToFile(toCore ? CORE_PATH : fileFor(username), add, remove);
}
