// Thin HTTP client for the Chandrabindu Next.js REST API. The bot is a pure
// API consumer — it never imports the app's code, so device keys/secrets never
// leave the hub. Every authenticated call sends the session token as a Bearer
// header (the same path the mobile wrapper used).

import { config } from "./config.js";

// ── API response shapes (subset of the app's contract) ──────────────────────

export interface DeviceFunction {
  code: string;
  name: string;
  type: string; // "Boolean" | "Enum" | "Integer" | "String"
  range?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  protected?: boolean;
}

export interface UiDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  roomId: string;
  functions: DeviceFunction[];
}

export interface Room {
  id: string;
  name: string;
  devices: UiDevice[];
  locked?: boolean;
  unlocked?: boolean;
}

export interface RoomsResponse {
  syncedAt: number;
  rooms: Room[];
  houseName: string;
  aiAvailable: boolean;
}

export interface DeviceStatus {
  code: string;
  value: unknown;
}

export interface AssistantAction {
  deviceId: string;
  code: string;
  value: unknown;
  deviceName: string;
  roomName: string;
  controlName: string;
  valueLabel: string;
  locked?: boolean;
}

export interface AssistantRoutine {
  routineId: string;
  name: string;
  actionCount: number;
}

export interface ChatResponse {
  reply: string;
  actions: AssistantAction[];
  routines: AssistantRoutine[];
}

export interface EnrichedRoutine {
  id: string;
  name: string;
  actions: { valueLabel: string; deviceName: string; controlName: string }[];
}

export interface ExecResult {
  ok: number;
  failed: number;
  ignoredLocked: number;
  ignoredProtected: number;
  results?: { device: string; ok: boolean; error?: string; locked?: boolean; protected?: boolean }[];
}

// ── Low-level fetch helper ──────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public unauthorized = false,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, `Cannot reach the home hub at ${config.baseUrl}. Is it on and on the same network?`);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* some responses may be empty */
  }

  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, res.status === 401);
  }
  return data as T;
}

// ── Endpoints ───────────────────────────────────────────────────────────────

/** Exchange a pairing code for a session token. Sends the shared pairing secret. */
export function pair(code: string): Promise<{ token: string; username: string; role: "admin" | "user" }> {
  return request("/api/pairing/token", {
    method: "POST",
    body: { code, client: "telegram" },
    headers: { "x-pairing-secret": config.pairingSecret },
  });
}

export function getRooms(token: string): Promise<RoomsResponse> {
  return request("/api/rooms", { token });
}

export function getStatus(token: string, deviceId: string): Promise<{ status: DeviceStatus[]; online: boolean }> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/status`, { token });
}

export function sendCommand(
  token: string,
  deviceId: string,
  commands: { code: string; value: unknown }[],
): Promise<{ ok: boolean }> {
  return request(`/api/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: "POST",
    token,
    body: { commands },
  });
}

export function chat(
  token: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<ChatResponse> {
  return request("/api/ai/chat", { method: "POST", token, body: { messages } });
}

export function execute(token: string, actions: AssistantAction[]): Promise<ExecResult> {
  return request("/api/ai/execute", { method: "POST", token, body: { actions } });
}

export function getRoutines(token: string): Promise<{ routines: EnrichedRoutine[] }> {
  return request("/api/routines", { token });
}

export function runRoutine(token: string, id: string): Promise<ExecResult> {
  return request(`/api/routines/${encodeURIComponent(id)}/run`, { method: "POST", token });
}
