// Server-only Tuya Cloud client — used ONLY during sync.
//
// Handles HMAC-SHA256 signing + access-token caching, and builds the device
// catalog (devices, rooms, and per-device functions with their local dp ids
// and custom names). Day-to-day control happens locally via lib/local.ts.

import crypto from "crypto";
import type {
  Catalog,
  CatalogDevice,
  CatalogFunction,
  CatalogRoom,
  DeviceFunction,
  TuyaCreds,
} from "./types";

const EMPTY_BODY_HASH = crypto.createHash("sha256").update("").digest("hex");

export class TuyaError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "TuyaError";
    this.code = code;
  }
}

// Credentials for the in-flight cloud operation. Set by syncCatalog /
// testCredentials before any request is made.
let currentCreds: TuyaCreds | null = null;

function setCreds(c: TuyaCreds): void {
  if (
    !currentCreds ||
    currentCreds.accessId !== c.accessId ||
    currentCreds.accessSecret !== c.accessSecret ||
    currentCreds.baseUrl !== c.baseUrl
  ) {
    tokenCache = null; // creds changed → drop any cached token
  }
  currentCreds = { ...c, baseUrl: c.baseUrl.replace(/\/+$/, "") };
}

function config() {
  if (!currentCreds || !currentCreds.accessId || !currentCreds.accessSecret) {
    throw new TuyaError("Tuya credentials are not configured.");
  }
  return currentCreds;
}

function sha256(body: string): string {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function hmac(secret: string, str: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(str, "utf8")
    .digest("hex")
    .toUpperCase();
}

function buildStringToSign(
  method: string,
  bodyHash: string,
  urlWithQuery: string,
): string {
  return `${method}\n${bodyHash}\n\n${urlWithQuery}`;
}

// ── Token cache ────────────────────────────────────────────────────────────
interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

async function fetchToken(): Promise<string> {
  const { accessId, accessSecret, baseUrl } = config();
  const t = Date.now().toString();
  const path = "/v1.0/token?grant_type=1";
  const stringToSign = buildStringToSign("GET", EMPTY_BODY_HASH, path);
  const sign = hmac(accessSecret, accessId + t + stringToSign);

  const res = await fetch(baseUrl + path, {
    method: "GET",
    headers: {
      client_id: accessId,
      sign,
      t,
      sign_method: "HMAC-SHA256",
    },
    cache: "no-store",
  });
  const data = await res.json();
  if (!data.success) {
    throw new TuyaError(data.msg || "Failed to obtain token", data.code);
  }
  tokenCache = {
    token: data.result.access_token,
    expiresAt: Date.now() + (data.result.expire_time - 60) * 1000,
  };
  return tokenCache.token;
}

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  return fetchToken();
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
  isRetry = false,
): Promise<T> {
  const { accessId, accessSecret, baseUrl } = config();
  const token = await getToken();
  const t = Date.now().toString();
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  const bodyHash = body !== undefined ? sha256(bodyStr) : EMPTY_BODY_HASH;
  const stringToSign = buildStringToSign(method, bodyHash, path);
  const sign = hmac(accessSecret, accessId + token + t + stringToSign);

  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      client_id: accessId,
      access_token: token,
      sign,
      t,
      sign_method: "HMAC-SHA256",
      "Content-Type": "application/json",
    },
    body: body !== undefined ? bodyStr : undefined,
    cache: "no-store",
  });
  const data = await res.json();

  if (!data.success) {
    if (!isRetry && [1010, 1011, 1004].includes(data.code)) {
      tokenCache = null;
      return request<T>(method, path, body, true);
    }
    throw new TuyaError(data.msg || "Tuya API error", data.code);
  }
  return data.result as T;
}

// ── Raw fetches ─────────────────────────────────────────────────────────────

interface RawDevice {
  id: string;
  name: string;
  category: string;
  product_name?: string;
  online: boolean;
  uid?: string;
  local_key?: string;
}

/** All devices linked to the project's app account(s), de-paginated. */
async function getAllDevicesRaw(): Promise<RawDevice[]> {
  const devices: RawDevice[] = [];
  let lastRowKey = "";
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ size: "100" });
    if (lastRowKey) qs.set("last_row_key", lastRowKey);
    const result = await request<any>(
      "GET",
      `/v1.0/iot-01/associated-users/devices?${qs.toString()}`,
    );
    const list: any[] = result?.devices ?? [];
    for (const d of list) {
      devices.push({
        id: d.id,
        name: d.name,
        category: d.category,
        product_name: d.product_name,
        online: Boolean(d.online),
        uid: d.uid,
        local_key: d.local_key,
      });
    }
    if (!result?.has_more) break;
    lastRowKey = result.last_row_key ?? "";
    if (!lastRowKey) break;
  }
  return devices;
}

interface HomeRoom {
  homeName: string;
  roomId: string;
  roomName: string;
  deviceIds: string[];
}

/** homes → rooms → the devices in each room, for the given app users. */
async function getHomeRooms(uids: string[]): Promise<HomeRoom[]> {
  const out: HomeRoom[] = [];
  for (const uid of uids) {
    let homes: any[] = [];
    try {
      homes = (await request<any[]>("GET", `/v1.0/users/${uid}/homes`)) ?? [];
    } catch {
      continue;
    }
    for (const home of homes) {
      const homeId = String(home.home_id ?? home.id);
      const homeName = home.name ?? "Home";
      let roomList: any[] = [];
      try {
        const resp = await request<any>("GET", `/v1.0/homes/${homeId}/rooms`);
        roomList = Array.isArray(resp) ? resp : (resp?.rooms ?? []);
      } catch {
        continue;
      }
      for (const room of roomList) {
        const roomId = String(room.room_id ?? room.id);
        let deviceIds: string[] = [];
        try {
          const devs =
            (await request<any[]>(
              "GET",
              `/v1.0/homes/${homeId}/rooms/${roomId}/devices`,
            )) ?? [];
          deviceIds = devs.map((d: any) => d?.id).filter(Boolean);
        } catch {
          deviceIds = [];
        }
        out.push({ homeName, roomId, roomName: room.name ?? "Room", deviceIds });
      }
    }
  }
  return out;
}

function parseValues(raw: string | undefined): Partial<DeviceFunction> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return {
      range: Array.isArray(v.range) ? v.range : undefined,
      min: typeof v.min === "number" ? v.min : undefined,
      max: typeof v.max === "number" ? v.max : undefined,
      step: typeof v.step === "number" ? v.step : undefined,
      scale: typeof v.scale === "number" ? v.scale : undefined,
      unit: typeof v.unit === "string" ? v.unit : undefined,
    };
  } catch {
    return {};
  }
}

/** The controllable functions a device declares (codes, types, ranges). */
async function getDeviceFunctions(deviceId: string): Promise<DeviceFunction[]> {
  const result = await request<any>(
    "GET",
    `/v1.0/devices/${deviceId}/functions`,
  );
  const functions: any[] = result?.functions ?? [];
  return functions.map((f) => ({
    code: f.code,
    name: f.name ?? f.code,
    type: f.type,
    ...parseValues(f.values),
  }));
}

/** Per-property shadow: gives local dp_id + your custom name per code. */
async function getShadowProperties(
  deviceId: string,
): Promise<{ code: string; dpId: number; label?: string }[]> {
  const result = await request<any>(
    "GET",
    `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
  );
  const props: any[] = result?.properties ?? [];
  return props
    .filter((p) => typeof p.dp_id === "number")
    .map((p) => ({
      code: p.code,
      dpId: p.dp_id,
      label: p.custom_name?.trim() || undefined,
    }));
}

// Friendly fallback label when the device has no custom name for a code.
function prettifyCode(code: string): string {
  const fan = code.match(/^fan(?:_(\d+))?$/);
  if (fan) return fan[1] && fan[1] !== "1" ? `Fan ${fan[1]}` : "Fan";
  const s = code.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mapModelType(t: string | undefined): string | null {
  if (t === "bool") return "Boolean";
  if (t === "enum") return "Enum";
  if (t === "value") return "Integer";
  return null; // string / raw / bitmap → not a simple control
}

// Datapoints that are configuration/cosmetic, not user-facing controls.
function isCosmetic(code: string): boolean {
  const EXCLUDE = new Set([
    "all_on",
    "all_off",
    "on_color",
    "off_color",
    "brightness_mode",
    "brightness_ctrl",
    "master_button",
    "relay_status",
    "light_mode",
  ]);
  if (EXCLUDE.has(code)) return true;
  if (code.startsWith("momentary_")) return true;
  if (code.startsWith("countdown_")) return true;
  if (code.endsWith("_state") || code.endsWith("_sv")) return true;
  return false;
}

/**
 * Full controllable datapoints from the device's thing model (TSL). This is
 * more complete than /functions — it includes fan speed, dimming, etc. and
 * carries enum ranges + integer bounds. dp id comes from `abilityId`.
 */
async function getDeviceModel(deviceId: string): Promise<CatalogFunction[]> {
  const resp = await request<any>("GET", `/v2.0/cloud/thing/${deviceId}/model`);
  let model = resp?.model;
  if (typeof model === "string") {
    try {
      model = JSON.parse(model);
    } catch {
      return [];
    }
  }
  const out: CatalogFunction[] = [];
  for (const svc of model?.services ?? []) {
    for (const p of svc?.properties ?? []) {
      const type = mapModelType(p?.typeSpec?.type);
      const dpId = Number(p?.abilityId);
      if (!type || !Number.isFinite(dpId)) continue;
      const ts = p.typeSpec ?? {};
      out.push({
        code: p.code,
        dpId,
        type,
        name: p.code,
        range: Array.isArray(ts.range) ? ts.range : undefined,
        min: typeof ts.min === "number" ? ts.min : undefined,
        max: typeof ts.max === "number" ? ts.max : undefined,
        step: typeof ts.step === "number" ? ts.step : undefined,
        scale: typeof ts.scale === "number" ? ts.scale : undefined,
        unit: typeof ts.unit === "string" && ts.unit ? ts.unit : undefined,
      });
    }
  }
  return out;
}

// ── Catalog sync ─────────────────────────────────────────────────────────────

/** Validate credentials by obtaining a token. Throws TuyaError on failure. */
export async function testCredentials(creds: TuyaCreds): Promise<void> {
  setCreds(creds);
  tokenCache = null;
  await fetchToken();
}

export async function syncCatalog(creds: TuyaCreds): Promise<Catalog> {
  setCreds(creds);
  const devices = await getAllDevicesRaw();
  const uids = Array.from(
    new Set(devices.map((d) => d.uid).filter((u): u is string => Boolean(u))),
  );

  const homeRooms = uids.length ? await getHomeRooms(uids) : [];
  const multiHome = uids.length > 1;
  const rooms: CatalogRoom[] = [];
  const seen = new Set<string>();
  const deviceRoom = new Map<string, string>();
  for (const hr of homeRooms) {
    if (!seen.has(hr.roomId)) {
      rooms.push({
        id: hr.roomId,
        name: multiHome ? `${hr.homeName} · ${hr.roomName}` : hr.roomName,
      });
      seen.add(hr.roomId);
    }
    for (const id of hr.deviceIds) deviceRoom.set(id, hr.roomId);
  }

  const catalogDevices: CatalogDevice[] = [];
  for (const d of devices) {
    // Custom names (and dp ids) per code.
    let props: { code: string; dpId: number; label?: string }[] = [];
    try {
      props = await getShadowProperties(d.id);
    } catch {
      props = [];
    }
    const labelByCode = new Map(props.map((p) => [p.code, p.label]));

    // Prefer the thing model (complete: includes fans, dimmers, ranges).
    let catFns: CatalogFunction[] = [];
    try {
      const model = await getDeviceModel(d.id);
      catFns = model
        .filter((f) => !isCosmetic(f.code))
        .map((f) => ({ ...f, name: labelByCode.get(f.code) || prettifyCode(f.code) }));
    } catch {
      catFns = [];
    }

    // Fallback: the older /functions list joined with shadow dp ids.
    if (catFns.length === 0) {
      let functions: DeviceFunction[] = [];
      try {
        functions = await getDeviceFunctions(d.id);
      } catch {
        functions = [];
      }
      const dpByCode = new Map(props.map((p) => [p.code, p]));
      for (const f of functions) {
        const m = dpByCode.get(f.code);
        if (!m) continue;
        catFns.push({
          code: f.code,
          dpId: m.dpId,
          type: f.type,
          name: m.label || f.name || f.code,
          range: f.range,
          min: f.min,
          max: f.max,
          step: f.step,
          scale: f.scale,
          unit: f.unit,
        });
      }
    }

    catalogDevices.push({
      id: d.id,
      key: d.local_key ?? "",
      version: "3.4",
      category: d.category,
      cloudName: d.name,
      cloudRoomId: deviceRoom.get(d.id),
      online: d.online,
      functions: catFns,
    });
  }

  return { syncedAt: Date.now(), rooms, devices: catalogDevices };
}
