// Goodnight round: each user's last completed round (when, and which controls
// were still on), so the next round can say "nothing has changed since you last
// looked". Stored per user in data/goodnight/<username>.json, like favourites.
// What changed in between comes from the gateway's on/off history.

import fs from "fs";
import path from "path";
import { readHistory, type HistEvent } from "./history";

const DIR = path.join(process.cwd(), "data", "goodnight");
/** A round older than this is a different evening: start fresh. */
export const LAST_CHECK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface LastCheck {
  checkedAt: number;
  /** `deviceId:code` of every counted control that was on when the round finished. */
  on: string[];
}

function fileFor(username: string): string {
  const safe = username.toLowerCase().replace(/[^a-z0-9._-]/g, "_").slice(0, 64) || "user";
  return path.join(DIR, `${safe}.json`);
}

export function readLastCheck(username: string): LastCheck | null {
  try {
    const d = JSON.parse(fs.readFileSync(fileFor(username), "utf8"));
    if (typeof d?.checkedAt !== "number") return null;
    if (Date.now() - d.checkedAt > LAST_CHECK_MAX_AGE_MS) return null;
    return { checkedAt: d.checkedAt, on: Array.isArray(d.on) ? d.on.filter((k: unknown) => typeof k === "string") : [] };
  } catch {
    return null;
  }
}

export function writeLastCheck(username: string, on: string[]): LastCheck {
  const check: LastCheck = { checkedAt: Date.now(), on: [...new Set(on)].slice(0, 500) };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(fileFor(username), JSON.stringify(check, null, 2), "utf8");
  return check;
}

/** Switch on/off events recorded since the last round (Boolean switches only). */
export function changesSince(check: LastCheck | null): HistEvent[] {
  if (!check) return [];
  return readHistory(check.checkedAt, Date.now()).sort((a, b) => a.at - b.at);
}
