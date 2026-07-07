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

const PORT = Number(process.env.GATEWAY_PORT || 4000);
const HOST = process.env.GATEWAY_HOST || "127.0.0.1"; // localhost-only by default
const secret = process.env.GATEWAY_SECRET || "";

const gateway = new Gateway();
gateway.start();

// Automation rule engine: evaluates data/automations.json on every state change.
const rules = new RuleEngine(gateway);
rules.start();

// Log changes to stdout so `journalctl`/pm2 logs show live activity.
gateway.on("change", (e) => {
  console.log(`[change] ${e.deviceName} · ${e.name} (${e.code}) = ${JSON.stringify(e.value)} [${e.source}]`);
});

const server = createServer(gateway, {
  secret,
  // Re-init rebuilds connections from a fresh catalog AND re-primes the rules.
  onReinit: () => {
    const health = gateway.reinit();
    rules.reload();
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
