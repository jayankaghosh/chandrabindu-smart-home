// Append to the app's per-day action log (logs/YYYY-MM-DD.log), matching
// lib/logger.ts so gateway-side events show up in Insights with app actions.

const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");

function pad(n) {
  return String(n).padStart(2, "0");
}

function logAction(action, details) {
  try {
    const d = new Date();
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, `${day}.log`), `${day} ${clock}  ${action}  ${JSON.stringify(details)}\n`, "utf8");
  } catch {
    /* logging must never break the caller */
  }
}

module.exports = { logAction };
