// Session tokens + request/page guards (Node runtime).
//
// The cookie is a signed token `${payloadB64}.${hmacHex}` where the payload is
// base64url-encoded JSON `{u: username, r: role, t: issuedAtMs}`, signed with
// the session secret from the config store. Verification happens in Node (API
// routes and server components) since the secret lives in data/config.json.

import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  getCredentialStamp,
  getRoomLockStamp,
  getSessionSecret,
  type Role,
} from "./config";

export const COOKIE_NAME = "shc_session";
// Per-session record of which locked rooms the user has unlocked.
export const UNLOCK_COOKIE = "shc_unlocks";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface Session {
  username: string;
  role: Role;
  issuedAt: number;
}

/**
 * True if the request arrived over HTTPS (directly or behind a proxy). Used to
 * decide the cookie `secure` flag — basing it on NODE_ENV breaks plain-HTTP LAN
 * deployments (the browser drops a `secure` cookie sent over http://).
 */
export function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Cookie options for the auth/unlock cookies; `secure` only over HTTPS. */
export function authCookieOptions(req: Request, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isSecureRequest(req),
    path: "/",
    maxAge,
  };
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("hex");
}

export function createSessionToken(identity: {
  username: string;
  role: Role;
}): string {
  // Bind the token to the account's current credential fingerprint so a
  // password change or deletion invalidates it (see readSessionToken).
  const cs = getCredentialStamp(identity.username, identity.role) ?? "";
  const payload = Buffer.from(
    JSON.stringify({ u: identity.username, r: identity.role, t: Date.now(), cs }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Verify a token's signature + age and return its session, or null. */
export function readSessionToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;

  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null; // not onboarded → no secret
  }
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let parsed: { u?: unknown; r?: unknown; t?: unknown; cs?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const issuedMs = Number(parsed.t);
  if (!Number.isFinite(issuedMs)) return null;
  const ageSeconds = (Date.now() - issuedMs) / 1000;
  if (ageSeconds < 0 || ageSeconds > SESSION_MAX_AGE) return null;

  const username = typeof parsed.u === "string" ? parsed.u : "";
  if (!username) return null;
  const role: Role = parsed.r === "admin" ? "admin" : "user";

  // Invalidate sessions whose credential has since changed or been deleted:
  // the embedded stamp must still match the account's current one.
  const stamp = typeof parsed.cs === "string" ? parsed.cs : "";
  const current = getCredentialStamp(username, role);
  if (!current || current !== stamp) return null;

  return { username, role, issuedAt: issuedMs };
}

/** The current request's session, or null if absent/invalid/expired. */
export function getSession(): Session | null {
  // Web clients send the signed token in an HttpOnly cookie.
  const fromCookie = readSessionToken(cookies().get(COOKIE_NAME)?.value);
  if (fromCookie) return fromCookie;
  // Native mobile clients can't rely on a persistent cookie jar, so they send
  // the same signed token as a bearer header. The signature check is identical.
  const auth = headers().get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return readSessionToken(auth.slice(7).trim());
  }
  return null;
}

/** True if the current request carries a valid session cookie. */
export function hasValidSession(): boolean {
  return getSession() !== null;
}

/** True if the current request is the superadmin. */
export function isAdminSession(): boolean {
  return getSession()?.role === "admin";
}

/**
 * Authorize an API request. Returns null when allowed, or a NextResponse to
 * return when denied:
 *   - 401 when there's no valid session (client should send to /login)
 *   - 403 when a standard user hits an admin-only (write) route
 */
export function guard(opts?: { admin?: boolean }): NextResponse | null {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (opts?.admin && session.role !== "admin") {
    return NextResponse.json(
      { error: "Only an admin user can do that." },
      { status: 403 },
    );
  }
  return null;
}

// ── Room unlocks (per-session) ───────────────────────────────────────────────
// A signed cookie mapping roomId → that room's lock fingerprint. An entry is
// only honored while it matches the room's current lock stamp, so an admin
// changing the room password (new stamp) re-locks it for everyone. The cookie
// is cleared on login/logout, so unlocks last only for the session.

/** Sign + encode an unlocks map into a cookie value. */
export function serializeUnlocks(rooms: Record<string, string>): string {
  const payload = Buffer.from(JSON.stringify({ rooms })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseUnlocks(token: string | undefined | null): Record<string, string> {
  if (!token) return {};
  const dot = token.indexOf(".");
  if (dot < 0) return {};
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return {};
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return {};
  }
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return {};
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const rooms = parsed?.rooms;
    if (!rooms || typeof rooms !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rooms)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** The current request's unlocks map (verified). */
export function readUnlocks(): Record<string, string> {
  return parseUnlocks(cookies().get(UNLOCK_COOKIE)?.value);
}

/**
 * True if the room may be acted on by the current request: not locked, or
 * locked but unlocked this session with a still-current stamp.
 */
export function isRoomAccessible(roomId: string): boolean {
  const stamp = getRoomLockStamp(roomId);
  if (!stamp) return true; // not locked
  return readUnlocks()[roomId] === stamp;
}
