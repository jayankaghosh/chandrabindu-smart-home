// Local LAN control via tuyapi.
//
// Uses EPHEMERAL connections: each read/command opens a connection, runs, and
// closes it immediately. Tuya panels allow only one client and are flaky about
// freeing that slot, so holding keep-alive connections slowly accumulates dead
// sockets on the device until it stops answering. Connect-per-op + per-device
// serialization keeps it to exactly one short-lived connection at a time.

import TuyAPI from "tuyapi";
import net from "net";
import os from "os";
import type {
  CatalogDevice,
  CatalogFunction,
  CommandRequest,
  DeviceStatus,
} from "./types";
import { readCatalog, writeCatalog } from "./store";
import {
  gatewayConfigured,
  gatewayGetStatus,
  gatewayCommand,
  GatewayUnavailable,
} from "./gateway";

const VERSIONS = ["3.4", "3.3", "3.5", "3.1"];
const FIND_TIMEOUT = 7; // seconds

const queues = new Map<string, Promise<unknown>>();
const ipCache = new Map<string, string>();
// Once a device connects + returns data at a given protocol version, we trust
// it and stop cycling versions — a later failure is contention, not version.
const confirmedVersion = new Map<string, string>();

function safeDisconnect(dev: any) {
  try {
    dev.disconnect();
  } catch {
    /* ignore */
  }
}

// tuyapi's find() binds UDP discovery ports — only one may run at a time.
let findChain: Promise<unknown> = Promise.resolve();
function serializeFind<T>(fn: () => Promise<T>): Promise<T> {
  const next = findChain.catch(() => undefined).then(fn);
  findChain = next.catch(() => undefined);
  return next;
}

/** Seed a known LAN IP for a device (skips UDP discovery). */
export function seedIp(deviceId: string, ip: string): void {
  if (ip) ipCache.set(deviceId, ip);
}

// One discovery pass captures ALL broadcasting devices (find({all}) uses
// reuseAddr sockets and dedupes). Doing it per-device fails: sequential
// per-device find() calls can't re-bind the discovery ports reliably.
let lastDiscovery = 0;
async function discoverAll(): Promise<void> {
  return serializeFind(async () => {
    // A concurrent caller may have just refreshed the cache.
    if (Date.now() - lastDiscovery < 3000) return;
    const finder = new TuyAPI({ id: "discovery", key: "0000000000000000" });
    finder.on("error", () => {
      /* ignore async socket errors during discovery */
    });
    let found: Array<{ id?: string; ip?: string }> = [];
    try {
      found = await finder.find({ all: true, timeout: FIND_TIMEOUT });
    } catch {
      found = [];
    }
    try {
      finder.disconnect();
    } catch {
      /* ignore */
    }
    for (const f of found ?? []) {
      if (f?.id && f?.ip) ipCache.set(f.id, f.ip);
    }
    lastDiscovery = Date.now();
  });
}

// ── Automatic background LAN scan ────────────────────────────────────────────
// When a device can't be located (broadcast blocked, no stored IP, or a stale
// IP), kick off a scan in the background — single-flight + rate-limited — so
// devices self-heal without anyone pressing "Scan LAN".
let scanInFlight: Promise<unknown> | null = null;
let lastAutoScan = 0;
const AUTO_SCAN_COOLDOWN = 60_000;

export function isScanning(): boolean {
  return scanInFlight !== null;
}

function triggerBackgroundScan(): void {
  if (scanInFlight) return;
  if (Date.now() - lastAutoScan < AUTO_SCAN_COOLDOWN) return;
  scanInFlight = scanLan()
    .catch(() => undefined)
    .finally(() => {
      lastAutoScan = Date.now();
      scanInFlight = null;
    });
}

/** Resolve a device's LAN IP: stored IP → cache → UDP broadcast discovery. */
async function resolveIp(meta: CatalogDevice): Promise<string | undefined> {
  if (meta.ip) {
    ipCache.set(meta.id, meta.ip);
    return meta.ip;
  }
  if (ipCache.has(meta.id)) return ipCache.get(meta.id);
  await discoverAll();
  const ip = ipCache.get(meta.id);
  if (!ip) triggerBackgroundScan(); // can't find it → scan in the background
  return ip;
}

const TUYA_PORT = 6668;

/** This machine's /24 prefixes (e.g. "192.168.68."). */
function localSubnets(): string[] {
  const prefixes = new Set<string>();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) {
        const p = ni.address.split(".");
        if (p.length === 4) prefixes.add(`${p[0]}.${p[1]}.${p[2]}.`);
      }
    }
  }
  return [...prefixes];
}

/** TCP-scan a /24 for hosts with the Tuya local port open. */
async function scanSubnet(prefix: string): Promise<string[]> {
  const hits: string[] = [];
  const all: number[] = [];
  for (let i = 1; i <= 254; i++) all.push(i);
  const CONCURRENCY = 48;
  for (let start = 0; start < all.length; start += CONCURRENCY) {
    const batch = all.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(
        (i) =>
          new Promise<void>((resolve) => {
            const ip = prefix + i;
            const s = new net.Socket();
            s.setTimeout(900);
            const done = () => {
              s.destroy();
              resolve();
            };
            s.on("connect", () => {
              hits.push(ip);
              done();
            });
            s.on("timeout", done);
            s.on("error", () => resolve());
            s.connect(TUYA_PORT, ip);
          }),
      ),
    );
  }
  return hits;
}

/** Connect to an IP with a device's key/version; returns dp count or null. */
function probe(
  meta: CatalogDevice,
  ip: string,
  version: string,
): Promise<number | null> {
  return new Promise((resolve) => {
    const dev = new TuyAPI({ id: meta.id, key: meta.key, ip, version });
    dev.on("error", () => {});
    let settled = false;
    const finish = (v: number | null) => {
      if (settled) return;
      settled = true;
      try {
        dev.disconnect();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), 2500);
    (async () => {
      try {
        await dev.connect();
        const st = await dev.get({ schema: true });
        clearTimeout(timer);
        const n = st?.dps ? Object.keys(st.dps).length : 0;
        finish(n > 0 ? n : null); // require real data to avoid false matches
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    })();
  });
}

/**
 * Scan the LAN for Tuya devices and match each to a catalog device by trying
 * its local key. Persists the IP + detected protocol version so future
 * connects are direct (works even when UDP broadcast discovery is blocked).
 *
 * `full=false` (the automatic background scan) only hunts for devices that
 * DON'T already have an IP, and skips IPs already claimed by a known device —
 * so it never disturbs healthy, reserved devices. `full=true` (manual "Scan
 * LAN") re-probes everything.
 */
// Only ONE scan may run at a time across the whole server (all users). Scans
// are serialized on a chain so they never overlap; a background request joins
// an already-running scan instead of queuing another.
type ScanResult = { matched: number; found: number };
let scanChain: Promise<unknown> = Promise.resolve();
let scanInflight: Promise<ScanResult> | null = null;

export async function scanLan(full = false): Promise<ScanResult> {
  // Background scan: if any scan is already running, just join it.
  if (!full && scanInflight) return scanInflight;
  // Queue behind any running scan, then run exactly one at a time.
  const result = scanChain.then(async () => {
    const p = runScanOnce(full);
    scanInflight = p;
    try {
      return await p;
    } finally {
      if (scanInflight === p) scanInflight = null;
    }
  });
  scanChain = result.catch(() => undefined);
  return result;
}

async function runScanOnce(
  full: boolean,
): Promise<{ matched: number; found: number }> {
  const catalog = await readCatalog();
  if (!catalog) return { matched: 0, found: 0 };

  const candidates = full
    ? catalog.devices
    : catalog.devices.filter((d) => !d.ip);
  if (candidates.length === 0) return { matched: 0, found: 0 };

  const claimedIps = new Set(
    catalog.devices.map((d) => d.ip).filter((x): x is string => Boolean(x)),
  );

  let ips: string[] = [];
  for (const prefix of localSubnets()) {
    ips.push(...(await scanSubnet(prefix)));
  }
  if (!full) ips = ips.filter((ip) => !claimedIps.has(ip));

  // Probe IPs in parallel (a device's key only works on its own IP, so each
  // IP is independent); probes within one IP are sequential — single TCP client.
  const VERSIONS = ["3.5", "3.4", "3.3"];
  const results = await Promise.all(
    ips.map(async (ip) => {
      for (const d of candidates) {
        for (const v of VERSIONS) {
          const dps = await probe(d, ip, v);
          if (dps !== null) return { ip, id: d.id, version: v };
        }
      }
      return null;
    }),
  );

  const matchedIds = new Set<string>();
  let matched = 0;
  for (const r of results) {
    if (!r || matchedIds.has(r.id)) continue;
    const d = catalog.devices.find((x) => x.id === r.id);
    if (d) {
      d.ip = r.ip;
      d.version = r.version;
      ipCache.set(d.id, r.ip);
      confirmedVersion.set(d.id, r.version);
      matchedIds.add(r.id);
      matched++;
    }
  }

  await writeCatalog(catalog);
  return { matched, found: ips.length };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Run an operation with exclusive, serialized access to one device. */
function withDevice<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(id) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(
    id,
    next.catch(() => undefined),
  );
  return next;
}

async function persistVersion(id: string, version: string): Promise<void> {
  const catalog = await readCatalog();
  if (!catalog) return;
  const d = catalog.devices.find((x) => x.id === id);
  if (d && d.version !== version) {
    d.version = version;
    await writeCatalog(catalog);
  }
}

/**
 * Open a short-lived connection, run one operation, and ALWAYS close it.
 * No keep-alive pool — this guarantees a single, promptly-released connection
 * per device. Detects/confirms the protocol version on first use.
 */
async function withConnection<T>(
  meta: CatalogDevice,
  run: (dev: any) => Promise<T>,
): Promise<T> {
  const ip = await resolveIp(meta);
  if (!ip) {
    if (!meta.ip) triggerBackgroundScan();
    throw new Error(
      `Could not find "${meta.cloudName}" on the LAN. Is it powered on and on the same Wi-Fi?`,
    );
  }

  const order = confirmedVersion.has(meta.id)
    ? [confirmedVersion.get(meta.id)!]
    : Array.from(new Set([meta.version || "3.5", ...VERSIONS]));

  let lastErr: unknown;
  for (const version of order) {
    const dev = new TuyAPI({ id: meta.id, key: meta.key, version, ip });
    // Attach BEFORE connecting: a late socket ECONNRESET would otherwise
    // become an uncaughtException and take down the server.
    dev.on("error", () => {
      /* swallowed; the active op rejects via its own timeout/await */
    });
    let connected = false;
    try {
      await withTimeout(dev.connect(), 6000, "connect");
      connected = true;
      // On first use, verify the version actually returns data.
      if (!confirmedVersion.has(meta.id)) {
        const probe = await withTimeout<any>(
          dev.get({ schema: true }),
          6000,
          "verify",
        );
        if (!probe?.dps || Object.keys(probe.dps).length === 0) {
          lastErr = new Error("connected but returned no datapoints");
          safeDisconnect(dev);
          continue;
        }
        confirmedVersion.set(meta.id, version);
        if (version !== meta.version) void persistVersion(meta.id, version);
      }
      return await run(dev);
    } catch (e) {
      lastErr = e;
      // Connected fine but the op failed on a known-good version → momentarily
      // busy. Don't thrash other versions; just fail and retry next time.
      if (connected && confirmedVersion.has(meta.id)) {
        throw new Error(
          `Couldn't reach "${meta.cloudName}" right now — it may be busy. Retrying shortly.`,
        );
      }
    } finally {
      safeDisconnect(dev); // ALWAYS close — nothing is kept alive
    }
  }

  if (!meta.ip) {
    ipCache.delete(meta.id);
    triggerBackgroundScan();
  }
  throw new Error(
    `Couldn't reach "${meta.cloudName}" right now — it may be busy. Retrying shortly.`,
  );
}

// ── Keep-alive heartbeat ─────────────────────────────────────────────────────
// Reads every device over the LAN so the slow cold-start work — UDP discovery,
// protocol-version detection, and waking idle device radios — is done on a
// cron's time instead of when a person opens the dashboard. Successful reads
// populate ipCache + confirmedVersion, so the next human page load is fast.

export interface HeartbeatDevice {
  id: string;
  name: string;
  ok: boolean;
}

export interface HeartbeatResult {
  total: number;
  reachable: number;
  unreachable: number;
  /** True if a background LAN scan is currently running (devices self-healing). */
  scanning: boolean;
  devices: HeartbeatDevice[];
}

/**
 * Read every catalog device in parallel (each device is internally serialized).
 * A device that can't be reached just counts as unreachable — and triggers the
 * usual background scan via getStatusLocal — so one dead device never fails the
 * whole check.
 */
export async function heartbeat(): Promise<HeartbeatResult> {
  const catalog = await readCatalog();
  const devices = catalog?.devices ?? [];

  const settled = await Promise.allSettled(
    devices.map((d) => getStatusLocal(d)),
  );
  const result: HeartbeatDevice[] = settled.map((r, i) => ({
    id: devices[i].id,
    name: devices[i].cloudName,
    ok: r.status === "fulfilled",
  }));

  const reachable = result.filter((d) => d.ok).length;
  return {
    total: devices.length,
    reachable,
    unreachable: devices.length - reachable,
    scanning: isScanning(),
    devices: result,
  };
}

/** Read current status over the LAN, mapped to function codes. */
export async function getStatusLocal(
  meta: CatalogDevice,
): Promise<DeviceStatus[]> {
  // Prefer the gateway (single connection owner, warm cache). Fall back to a
  // direct read only if the gateway itself is unreachable.
  if (gatewayConfigured()) {
    try {
      return await gatewayGetStatus(meta.id);
    } catch (e) {
      if (!(e instanceof GatewayUnavailable)) throw e;
    }
  }
  return withDevice(meta.id, () =>
    withConnection(meta, async (dev) => {
      const res = await withTimeout<any>(
        dev.get({ schema: true }),
        6000,
        "get",
      );
      const dps: Record<string, unknown> = res?.dps ?? {};
      const codeByDp = new Map(meta.functions.map((f) => [f.dpId, f.code]));
      const status: DeviceStatus[] = [];
      for (const [dp, value] of Object.entries(dps)) {
        const code = codeByDp.get(Number(dp));
        if (code) status.push({ code, value });
      }
      return status;
    }),
  );
}

/**
 * Connect to a manually-added device and infer its controllable functions
 * from the live datapoints (no cloud needed). Booleans become toggles,
 * numbers become sliders; other types are skipped (range unknown offline).
 */
export async function discoverFunctions(
  meta: CatalogDevice,
): Promise<CatalogFunction[]> {
  return withDevice(meta.id, () =>
    withConnection(meta, async (dev) => {
    const res = await withTimeout<any>(dev.get({ schema: true }), 6000, "get");
    const dps: Record<string, unknown> = res?.dps ?? {};
    const fns: CatalogFunction[] = [];
    for (const [dp, value] of Object.entries(dps)) {
      const dpId = Number(dp);
      if (!Number.isFinite(dpId)) continue;
      if (typeof value === "boolean") {
        fns.push({
          code: `dp_${dpId}`,
          dpId,
          type: "Boolean",
          name: `Switch ${dpId}`,
        });
      } else if (typeof value === "number") {
        fns.push({
          code: `dp_${dpId}`,
          dpId,
          type: "Integer",
          name: `Level ${dpId}`,
          min: 0,
          max: 100,
          step: 1,
        });
      }
    }
    return fns;
    }),
  );
}

/** Send validated commands over the LAN. Each command maps code → dp id. */
export async function setCommandLocal(
  meta: CatalogDevice,
  commands: CommandRequest[],
): Promise<boolean> {
  // Prefer the gateway (sends over its already-open connection). Fall back to a
  // direct command only if the gateway itself is unreachable.
  if (gatewayConfigured()) {
    try {
      await gatewayCommand(meta.id, commands);
      return true;
    } catch (e) {
      if (!(e instanceof GatewayUnavailable)) throw e;
    }
  }

  const dpByCode = new Map(meta.functions.map((f) => [f.code, f.dpId]));
  const resolved = commands.map((c) => ({
    dpId: dpByCode.get(c.code)!,
    value: c.value,
  }));

  return withDevice(meta.id, () =>
    withConnection(meta, async (dev) => {
      if (resolved.length === 1) {
        await withTimeout(
          dev.set({ dps: resolved[0].dpId, set: resolved[0].value }),
          6000,
          "set",
        );
      } else {
        const data: Record<number, unknown> = {};
        for (const r of resolved) data[r.dpId] = r.value;
        await withTimeout(dev.set({ multiple: true, data }), 6000, "set");
      }
      return true;
    }),
  );
}
