// Backup / restore of the app's JSON state as a single .cnbdu file (a JSON
// envelope). Includes secrets (config password hashes, session secret, Tuya +
// API keys, per-device local keys) so a restore fully reproduces the hub — the
// file must be handled like a credential.

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

// Top-level state files worth backing up (caches/transient files are excluded:
// automationFired, suntimes, pairing, insights, history).
const FILES = [
  "config.json",
  "catalog.json",
  "overrides.json",
  "routines.json",
  "automations.json",
  "switchGroups.json",
];

// Directories of per-user JSON files to include recursively.
const DIRS = ["favourites", "chatbot"];

export interface BackupBundle {
  format: "cnbdu";
  version: 1;
  createdAt: number;
  files: Record<string, unknown>; // relative path under data/ -> parsed JSON
}

function readJsonFile(abs: string): unknown | undefined {
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return undefined;
  }
}

function walkDir(rel: string, files: Record<string, unknown>): void {
  const abs = path.join(DATA_DIR, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const childRel = `${rel}/${e.name}`;
    if (e.isDirectory()) walkDir(childRel, files);
    else if (e.name.endsWith(".json")) {
      const val = readJsonFile(path.join(DATA_DIR, childRel));
      if (val !== undefined) files[childRel] = val;
    }
  }
}

/** Build the full backup bundle from disk. */
export function buildBackup(): BackupBundle {
  const files: Record<string, unknown> = {};
  for (const f of FILES) {
    const val = readJsonFile(path.join(DATA_DIR, f));
    if (val !== undefined) files[f] = val;
  }
  for (const d of DIRS) walkDir(d, files);
  return { format: "cnbdu", version: 1, createdAt: Date.now(), files };
}

/** Restore a bundle to disk. Overwrites the included files. Returns count. */
export function restoreBackup(bundle: unknown): { restored: number; catalogChanged: boolean } {
  const b = bundle as BackupBundle;
  if (!b || b.format !== "cnbdu" || !b.files || typeof b.files !== "object") {
    throw new Error("Not a valid .cnbdu backup file");
  }
  let restored = 0;
  let catalogChanged = false;
  for (const [rel, value] of Object.entries(b.files)) {
    // Guard against path traversal — only allow paths that stay under data/.
    const abs = path.join(DATA_DIR, rel);
    if (!abs.startsWith(DATA_DIR + path.sep)) continue;
    if (!rel.endsWith(".json")) continue;
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify(value, null, 2), { encoding: "utf8", mode: rel === "config.json" ? 0o600 : 0o644 });
      restored++;
      if (rel === "catalog.json") catalogChanged = true;
    } catch {
      /* skip a file that fails to write */
    }
  }
  if (restored === 0) throw new Error("Backup contained no restorable files");
  return { restored, catalogChanged };
}
