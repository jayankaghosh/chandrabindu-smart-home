// Client for the device gateway daemon (device-gateway/). When GATEWAY_URL is
// set, lib/local.ts routes status reads + commands through the gateway so the
// gateway is the single local client per device (no LAN-connection contention,
// and reads come from its warm cache). If the gateway is unreachable, callers
// fall back to opening direct connections — and since a down gateway holds no
// connections, that fallback can't contend with it either.
//
// Opt-in: with GATEWAY_URL unset, none of this runs and the app behaves exactly
// as before.

import type { CommandRequest, DeviceStatus } from "./types";

const GATEWAY_URL = (process.env.GATEWAY_URL || "").replace(/\/+$/, "");
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";
const TIMEOUT_MS = 3000;
const BREAKER_MS = 15000; // after a failed reach, skip the gateway this long

// When the gateway looks down, stop trying it for a bit so we don't add a
// timeout to every request while it's offline.
let downUntil = 0;

/** Thrown when the gateway itself can't be reached — signals "fall back to direct". */
export class GatewayUnavailable extends Error {}

export function gatewayConfigured(): boolean {
  return GATEWAY_URL !== "";
}

async function gwFetch(path: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { ...((init?.headers as Record<string, string>) || {}) };
    if (GATEWAY_SECRET) headers["x-gateway-secret"] = GATEWAY_SECRET;
    return await fetch(`${GATEWAY_URL}${path}`, { ...init, headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function breakerOpen(): boolean {
  return Date.now() < downUntil;
}

/**
 * Live status via the gateway. Throws GatewayUnavailable if the gateway can't be
 * reached (caller should fall back to a direct read). Throws a normal Error if
 * the gateway is up but the device isn't currently reachable (caller should NOT
 * fall back — going direct would fight the gateway's connection).
 */
export async function gatewayGetStatus(id: string): Promise<DeviceStatus[]> {
  if (!gatewayConfigured() || breakerOpen()) throw new GatewayUnavailable();
  let res: Response;
  try {
    res = await gwFetch(`/status/${encodeURIComponent(id)}`);
  } catch {
    downUntil = Date.now() + BREAKER_MS;
    throw new GatewayUnavailable();
  }
  if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Bad gateway response");
  if (!data.connected) throw new Error("Device is not reachable right now.");
  return Object.entries((data.status as Record<string, unknown>) || {}).map(
    ([code, value]) => ({ code, value }),
  );
}

export interface GatewayHealth {
  configured: boolean;
  reachable: boolean;
  total?: number;
  connected?: number;
}

/** Non-secret gateway health for the settings UI. Never throws. */
export async function gatewayHealth(): Promise<GatewayHealth> {
  if (!gatewayConfigured()) return { configured: false, reachable: false };
  try {
    const res = await gwFetch("/health");
    if (!res.ok) return { configured: true, reachable: false };
    const d = await res.json();
    return { configured: true, reachable: true, total: d.total, connected: d.connected };
  } catch {
    return { configured: true, reachable: false };
  }
}

/** Ask the gateway to rebuild all device connections from a fresh catalog. */
export async function gatewayReinit(): Promise<{ total: number; connected: number }> {
  if (!gatewayConfigured()) {
    throw new Error("The device gateway is not configured (GATEWAY_URL is not set).");
  }
  let res: Response;
  try {
    res = await gwFetch("/reinit", { method: "POST" });
  } catch {
    throw new Error("Couldn't reach the device gateway. Is it running?");
  }
  if (!res.ok) throw new Error(`Gateway returned ${res.status}`);
  const d = await res.json().catch(() => ({}) as any);
  return { total: d.total ?? 0, connected: d.connected ?? 0 };
}

/** Send commands via the gateway. Same fallback semantics as gatewayGetStatus. */
export async function gatewayCommand(id: string, commands: CommandRequest[]): Promise<void> {
  if (!gatewayConfigured() || breakerOpen()) throw new GatewayUnavailable();
  let res: Response;
  try {
    res = await gwFetch(`/command/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commands }),
    });
  } catch {
    downUntil = Date.now() + BREAKER_MS;
    throw new GatewayUnavailable();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}) as any);
    throw new Error(d?.error || `Gateway returned ${res.status}`);
  }
}
