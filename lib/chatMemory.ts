// Per-user long-term memory for the assistant. Durable facts/preferences the
// LLM chooses to remember, stored as a list of short strings in
// data/chatbot/memory/<username>.json and fed back into every chat.

import fs from "fs";
import path from "path";

const MEM_DIR = path.join(process.cwd(), "data", "chatbot", "memory");
const MAX_ITEMS = 60;
const MAX_LEN = 200;

/** Sanitize a username into a safe filename (no path traversal). */
function fileFor(username: string): string {
  const safe =
    username.toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 64) || "user";
  return path.join(MEM_DIR, `${safe}.json`);
}

export function readMemory(username: string): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(fileFor(username), "utf8"));
    const items = Array.isArray(data) ? data : data?.items;
    return Array.isArray(items)
      ? items.filter((x: unknown): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeMemory(username: string, items: string[]): void {
  fs.mkdirSync(MEM_DIR, { recursive: true });
  fs.writeFileSync(
    fileFor(username),
    JSON.stringify({ items, updatedAt: Date.now() }, null, 2),
    "utf8",
  );
}

/**
 * Apply the LLM's proposed memory changes for a user and persist them.
 * `add` are new facts; `remove` are texts that, if contained in a stored item
 * (case-insensitive), drop it. Returns the updated list.
 */
export function applyMemoryUpdate(
  username: string,
  update: { add?: unknown; remove?: unknown } | null | undefined,
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

  if (!add.length && !remove.length) return readMemory(username);

  let items = readMemory(username);
  if (remove.length) {
    items = items.filter(
      (it) => !remove.some((r) => it.toLowerCase().includes(r)),
    );
  }
  for (const a of add) {
    if (!items.some((it) => it.toLowerCase() === a.toLowerCase())) items.push(a);
  }
  if (items.length > MAX_ITEMS) items = items.slice(items.length - MAX_ITEMS);
  writeMemory(username, items);
  return items;
}
