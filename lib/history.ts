// Reads the gateway's Boolean on/off history (data/history/YYYY-MM-DD.jsonl) and
// aggregates per control over a time range: total on-duration, off-duration, and
// toggle count. The state before the first in-window event is inferred as the
// opposite of that event's value (it must have just transitioned to it).

import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data", "history");

export interface HistEvent {
  deviceId: string;
  code: string;
  value: boolean;
  at: number;
}

export interface UsageStat {
  onMs: number;
  offMs: number;
  toggles: number;
  hasData: boolean;
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** All Boolean transitions with `at` in [from, to]. */
export function readHistory(from: number, to: number): HistEvent[] {
  const out: HistEvent[] = [];
  const end = new Date(to);
  const d = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()));
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(DIR, `${dayStr(d)}.jsonl`), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (typeof e.at === "number" && e.at >= from && e.at <= to && typeof e.value === "boolean") {
          out.push({ deviceId: String(e.deviceId), code: String(e.code), value: e.value, at: e.at });
        }
      } catch {
        /* skip a bad line */
      }
    }
  }
  return out;
}

/** Aggregate per `deviceId::code` over [from, to]. */
export function aggregateUsage(from: number, to: number): Map<string, UsageStat> {
  const byKey = new Map<string, HistEvent[]>();
  for (const e of readHistory(from, to)) {
    const k = `${e.deviceId}::${e.code}`;
    const arr = byKey.get(k);
    if (arr) arr.push(e);
    else byKey.set(k, [e]);
  }
  const res = new Map<string, UsageStat>();
  for (const [k, evs] of byKey) {
    evs.sort((a, b) => a.at - b.at);
    let onMs = 0;
    let offMs = 0;
    let cursor = from;
    let state = !evs[0].value; // before the first transition it was the opposite
    for (const e of evs) {
      const dur = e.at - cursor;
      if (state) onMs += dur;
      else offMs += dur;
      state = e.value;
      cursor = e.at;
    }
    const tail = to - cursor;
    if (state) onMs += tail;
    else offMs += tail;
    res.set(k, { onMs, offMs, toggles: evs.length, hasData: true });
  }
  return res;
}
