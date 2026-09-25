// Entry point: start persistent connections to every device, then serve the
// local HTTP API the Next app talks to.

try {
  require("dotenv/config"); // optional — env can also come from the process/systemd
} catch {
  /* dotenv not installed; rely on real env vars */
}
const { Gateway } = require("./gateway");
const { createServer } = require("./server");
const { RuleEngine } = require("./rules");
const { ProtectedGuard } = require("./protect");
const { GroupSyncEngine } = require("./groups");
const { LoopGuard } = require("./loopguard");
const history = require("./history");

const PORT = Number(process.env.GATEWAY_PORT || 4000);
const HOST = process.env.GATEWAY_HOST || "127.0.0.1"; // localhost-only by default
const secret = process.env.GATEWAY_SECRET || "";

const gateway = new Gateway();
gateway.start();

// Automation rule engine: evaluates data/automations.json on every state change.
const rules = new RuleEngine(gateway);
rules.start();

// Protected-control guard: turns a protected control back ON if it goes off.
const guard = new ProtectedGuard(gateway);
guard.start();

// Switch-group sync: keeps each group's members on/off together.
const groups = new GroupSyncEngine(gateway);
groups.start();

// Loop-protection kill switch: LOCKS the app if a switch toggles too fast.
const loopGuard = new LoopGuard(gateway);
loopGuard.start();

// Log changes to stdout so `journalctl`/pm2 logs show live activity, and record
// Boolean on/off transitions to the usage-history store.
gateway.on("change", (e) => {
  console.log(`[change] ${e.deviceName} · ${e.name} (${e.code}) = ${JSON.stringify(e.value)} [${e.source}]`);
  history.record(e);
});

const server = createServer(gateway, {
  secret,
  // Re-init rebuilds connections from a fresh catalog AND re-primes the rules.
  onReinit: () => {
    const health = gateway.reinit();
    rules.reload();
    groups.reload();
    loopGuard.reload();
    return health;
  },
});
server.listen(PORT, HOST, () => {
  console.log(`Device gateway listening on http://${HOST}:${PORT} (secret ${secret ? "on" : "off"})`);
});

function shutdown() {
  console.log("Shutting down — disconnecting devices cleanly…");
  gateway.stop();
  server.close();
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
