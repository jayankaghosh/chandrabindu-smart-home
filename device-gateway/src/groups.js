// Switch-group sync engine. Watches data/switchGroups.json and keeps each
// group's Boolean members in sync: when any member toggles, the others are
// driven to the same on/off value.
//
// Loop safety: a member is only commanded when its cached value DIFFERS from the
// target, so the echo of our own set (which arrives back as a `change`) finds
// everyone already at the target and issues no further commands — the fan-out
// self-terminates. A genuine physical fight (someone holding a switch against
// the group) is caught by the LoopGuard, not here.

const fs = require("fs");
const path = require("path");

const GROUPS_PATH = path.join(__dirname, "..", "..", "data", "switchGroups.json");
const CONFIG_PATH = path.join(__dirname, "..", "..", "data", "config.json");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function loadGroups() {
  const parsed = readJson(GROUPS_PATH, null);
  const list = Array.isArray(parsed) ? parsed : parsed && parsed.groups;
  return Array.isArray(list) ? list : [];
}

function loadConfig() {
  const cfg = readJson(CONFIG_PATH, {}) || {};
  const protectedSet = new Set();
  const map = cfg.protectedControls || {};
  for (const [deviceId, codes] of Object.entries(map)) {
    for (const code of codes || []) protectedSet.add(`${deviceId}::${code}`);
  }
  return { locked: cfg.locked === true, protectedSet };
}

class GroupSyncEngine {
  constructor(gateway) {
    this.gateway = gateway;
    this.groups = [];
    this.protectedSet = new Set();
    this.locked = false;
    this.syncing = new Set(); // group ids currently fanning out (re-entrancy guard)
  }

  reload() {
    this.groups = loadGroups();
    const cfg = loadConfig();
    this.protectedSet = cfg.protectedSet;
    this.locked = cfg.locked;
  }

  start() {
    this.reload();
    fs.watchFile(GROUPS_PATH, { interval: 2000 }, () => this.reload());
    fs.watchFile(CONFIG_PATH, { interval: 2000 }, () => this.reload());
    this.gateway.on("change", (e) => this.onChange(e));
    console.log("[groups] switch-group sync started");
  }

  key(deviceId, code) {
    return `${deviceId}::${code}`;
  }

  onChange(e) {
    if (this.locked || !e || typeof e.value !== "boolean") return;
    const changedKey = this.key(e.deviceId, e.code);
    for (const group of this.groups) {
      if (!Array.isArray(group.members)) continue;
      if (!group.members.some((m) => this.key(m.deviceId, m.code) === changedKey)) continue;
      this.sync(group, e.value, changedKey);
    }
  }

  async sync(group, value, sourceKey) {
    for (const m of group.members) {
      const mKey = this.key(m.deviceId, m.code);
      if (mKey === sourceKey) continue;
      if (this.protectedSet.has(mKey)) continue;
      const cur = this.currentValue(m.deviceId, m.code);
      if (cur === value) continue; // already there → no command (this stops loops)
      try {
        await this.gateway.command(m.deviceId, [{ code: m.code, value }]);
        console.log(`[groups] "${group.name}": set ${m.deviceId} ${m.code} = ${value}`);
      } catch (err) {
        console.log(`[groups]   FAILED ${m.deviceId} ${m.code}: ${err.message}`);
      }
    }
  }

  currentValue(deviceId, code) {
    const dev = this.gateway.get ? this.gateway.get(deviceId) : null;
    return dev && dev.status ? dev.status[code] : undefined;
  }
}

module.exports = { GroupSyncEngine };
