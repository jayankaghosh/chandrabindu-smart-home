// Appends every real Boolean on/off transition to a daily-rotated JSONL history
// (data/history/YYYY-MM-DD.jsonl), read by the app's usage report (lib/history.ts).
// Records changes from ALL sources (physical, app, automations) since it hooks
// the gateway's aggregated `change` stream. Boolean-only (on/off durations).

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "..", "data", "history");

function record(e) {
  if (!e || typeof e.value !== "boolean") return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const at = e.at || Date.now();
    const day = new Date(at).toISOString().slice(0, 10);
    const line = JSON.stringify({ deviceId: e.deviceId, code: e.code, value: e.value, at }) + "\n";
    fs.appendFileSync(path.join(DIR, `${day}.jsonl`), line);
  } catch {
    /* best-effort — history is non-critical */
  }
}

module.exports = { record };
