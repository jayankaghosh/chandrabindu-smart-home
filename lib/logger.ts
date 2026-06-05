// Appends actions to a per-day log file under logs/ (e.g. logs/2026-06-04.log).
// A new file is created each calendar day. Logging never throws — it must not
// break a request.

import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function today(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function clock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Record an action. Example line:
 *   2026-06-04 21:30:05  COMMAND  {"device":"Kitchen main","code":"switch_1","value":true}
 */
export function logAction(
  action: string,
  details?: Record<string, unknown>,
): void {
  try {
    const now = new Date();
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const line =
      `${today(now)} ${clock(now)}  ${action}` +
      (details ? `  ${JSON.stringify(details)}` : "") +
      "\n";
    fs.appendFileSync(path.join(LOG_DIR, `${today(now)}.log`), line, "utf8");
  } catch {
    /* logging must never break the app */
  }
}
