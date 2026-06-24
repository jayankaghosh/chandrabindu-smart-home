// Per-user favourites: individual device controls (deviceId + control code) a
// user has starred for quick access on the Favourites screen. Stored as a list
// in data/favourites/<username>.json, mirroring lib/chatMemory.ts.

import fs from "fs";
import path from "path";

const FAV_DIR = path.join(process.cwd(), "data", "favourites");
const MAX_ITEMS = 200;

/** A starred control: a single function of a device. */
export interface Favourite {
  deviceId: string;
  code: string;
}

/** Sanitize a username into a safe filename (no path traversal). */
function fileFor(username: string): string {
  const safe =
    username.toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 64) || "user";
  return path.join(FAV_DIR, `${safe}.json`);
}

function isFav(x: unknown): x is Favourite {
  return (
    !!x &&
    typeof (x as any).deviceId === "string" &&
    typeof (x as any).code === "string"
  );
}

export function readFavourites(username: string): Favourite[] {
  try {
    const data = JSON.parse(fs.readFileSync(fileFor(username), "utf8"));
    const items = Array.isArray(data) ? data : data?.items;
    return Array.isArray(items)
      ? items.filter(isFav).map((f) => ({ deviceId: f.deviceId, code: f.code }))
      : [];
  } catch {
    return [];
  }
}

function writeFavourites(username: string, items: Favourite[]): void {
  fs.mkdirSync(FAV_DIR, { recursive: true });
  fs.writeFileSync(
    fileFor(username),
    JSON.stringify({ items, updatedAt: Date.now() }, null, 2),
    "utf8",
  );
}

/**
 * Star or unstar one control for a user and persist. Idempotent — starring an
 * already-starred control is a no-op. Returns the updated list.
 */
export function toggleFavourite(
  username: string,
  deviceId: string,
  code: string,
  favourite: boolean,
): Favourite[] {
  let items = readFavourites(username).filter(
    (f) => !(f.deviceId === deviceId && f.code === code),
  );
  if (favourite) items.push({ deviceId, code });
  if (items.length > MAX_ITEMS) items = items.slice(items.length - MAX_ITEMS);
  writeFavourites(username, items);
  return items;
}
