// Automation rule engine. Watches data/automations.json and evaluates each rule
// against the gateway's live status caches on every real state change.
//
// Semantics:
//   • Edge-triggered: a rule's THEN actions fire when its IF becomes true (a
//     false→true transition), not repeatedly while it stays true.
//   • Rules are primed to the current state on load, so saving a rule whose
//     condition is already true does NOT fire it retroactively.
//   • Per-rule cooldown prevents rapid re-fire / loops.
//   • Protected controls are never auto-actuated (read from data/config.json).

const fs = require("fs");
const path = require("path");

const AUTOMATIONS_PATH = path.join(__dirname, "..", "..", "data", "automations.json");
const CONFIG_PATH = path.join(__dirname, "..", "..", "data", "config.json");
const COOLDOWN_MS = 3000;

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function loadAutomations() {
  const parsed = readJson(AUTOMATIONS_PATH, null);
  const list = Array.isArray(parsed) ? parsed : parsed && parsed.automations;
  return Array.isArray(list) ? list : [];
}

function loadProtected() {
  const cfg = readJson(CONFIG_PATH, {});
  const map = cfg && cfg.protectedControls ? cfg.protectedControls : {};
  const set = new Set();
  for (const [deviceId, codes] of Object.entries(map)) {
    for (const code of codes || []) set.add(`${deviceId}::${code}`);
  }
  return set;
}

class RuleEngine {
  constructor(gateway) {
    this.gateway = gateway;
    this.rules = [];
    this.protectedSet = new Set();
    this.prevMatch = new Map(); // ruleId -> boolean
    this.lastFired = new Map(); // ruleId -> ms
  }

  start() {
    this.reload();
    // Re-read rules when the file changes (admin saved via the web UI).
    fs.watchFile(AUTOMATIONS_PATH, { interval: 2000 }, () => this.reload());
    this.gateway.on("change", () => this.onChange());
    console.log(`Rule engine started (${this.rules.length} automation(s)).`);
  }

  reload() {
    this.rules = loadAutomations();
    this.protectedSet = loadProtected();
    // Prime prevMatch to the CURRENT truth of each rule so we only fire on
    // transitions that happen from now on (never retroactively on load).
    const seen = new Set();
    for (const rule of this.rules) {
      seen.add(rule.id);
      this.prevMatch.set(rule.id, this.evaluate(rule));
    }
    for (const id of [...this.prevMatch.keys()]) if (!seen.has(id)) this.prevMatch.delete(id);
  }

  // Current value of a device control from the gateway cache (or undefined).
  currentValue(deviceId, code) {
    const conn = this.gateway.get(deviceId);
    if (!conn || !conn.connected) return undefined;
    return conn.status[code];
  }

  conditionMet(cond) {
    const cur = this.currentValue(cond.deviceId, cond.code);
    if (cur === undefined) return false; // unknown / offline → not met
    if (typeof cur === "boolean") {
      const want =
        cond.value === true ||
        cond.value === "true" ||
        cond.value === "on" ||
        cond.value === 1;
      return cur === want;
    }
    return String(cur) === String(cond.value);
  }

  evaluate(rule) {
    if (!rule.conditions || rule.conditions.length === 0) return false;
    const results = rule.conditions.map((c) => this.conditionMet(c));
    return rule.match === "any" ? results.some(Boolean) : results.every(Boolean);
  }

  onChange() {
    const now = Date.now();
    for (const rule of this.rules) {
      if (rule.enabled === false) continue;
      const match = this.evaluate(rule);
      const prev = this.prevMatch.get(rule.id) || false;
      this.prevMatch.set(rule.id, match);
      if (match && !prev) {
        const last = this.lastFired.get(rule.id) || 0;
        if (now - last < COOLDOWN_MS) continue; // debounce
        this.lastFired.set(rule.id, now);
        this.fire(rule);
      }
    }
  }

  async fire(rule) {
    console.log(`[automation] "${rule.name}" triggered — running ${rule.actions.length} action(s)`);
    for (const action of rule.actions) {
      if (this.protectedSet.has(`${action.deviceId}::${action.code}`)) {
        console.log(`[automation]   skip protected control ${action.code} on ${action.deviceId}`);
        continue;
      }
      try {
        await this.gateway.command(action.deviceId, [{ code: action.code, value: action.value }]);
        console.log(`[automation]   set ${action.deviceId} ${action.code} = ${JSON.stringify(action.value)}`);
      } catch (e) {
        console.log(`[automation]   FAILED ${action.deviceId} ${action.code}: ${e.message}`);
      }
    }
  }
}

module.exports = { RuleEngine };
