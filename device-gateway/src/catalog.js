// Reads the app's device catalog (data/catalog.json) — the gateway is the sole
// owner of the local connections but shares the app's device metadata (id, key,
// ip, version, dp<->code mapping). Read-only here.

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "..", "..", "data", "catalog.json");

function loadDevices() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  return Array.isArray(catalog.devices) ? catalog.devices : [];
}

module.exports = { loadDevices, CATALOG_PATH };
