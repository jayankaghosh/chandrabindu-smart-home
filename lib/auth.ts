// Session tokens + request/page guards (Node runtime).
//
// The cookie holds a standard HS256 JWT — `base64url(header).base64url(payload).
// base64url(signature)` — with claims { sub, role, cs, iat, exp }, signed with
// the session secret from the config store. `exp` gives it a 1-year lifetime,
// and the secret is persisted in data/config.json (a restart re-reads it, never
// regenerates it), so a signed-in user stays logged in across server restarts.
// Verification happens in Node (API routes + server components) since the secret
// lives on disk.
//
// Legacy tokens (the old `base64url(payload).hex(hmac)` format) are still
// accepted so sessions created before the JWT switch aren't dropped on upgrade.

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
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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

// Hex HMAC — used by the legacy token format and the room-unlock cookies.
function sign(value: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("hex");
}

// JWS signature: HMAC-SHA256 of the signing input, base64url-encoded (HS256).
function signJwt(value: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

// Fixed HS256 header (never varies), precomputed once.
const JWT_HEADER = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");

/** Constant-time string compare that also guards against length mismatch. */
function timingEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function createSessionToken(identity: {
  username: string;
  role: Role;
}): string {
  // Bind the token to the account's current credential fingerprint so a
  // password change or deletion invalidates it (see readSessionToken).
  const cs = getCredentialStamp(identity.username, identity.role) ?? "";
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: identity.username,
      role: identity.role,
      cs,
      iat: now,
      exp: now + SESSION_MAX_AGE, // 1 year
    }),
  ).toString("base64url");
  const signingInput = `${JWT_HEADER}.${payload}`;
  return `${signingInput}.${signJwt(signingInput)}`;
}

/** Verify a token (JWT, or the legacy format) and return its session, or null. */
export function readSessionToken(token: string | undefined | null): Session | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length === 3) return readJwt(parts[0], parts[1], parts[2]);
  if (parts.length === 2) return readLegacyToken(parts[0], parts[1]);
  return null;
}

/** Verify an HS256 JWT: signature, `exp`, and the credential stamp. */
function readJwt(header: string, payload: string, sig: string): Session | null {
  if (!header || !payload || !sig) return null;

  let expected: string;
  try {
    expected = signJwt(`${header}.${payload}`);
  } catch {
    return null; // not onboarded → no secret
  }
  if (!timingEqual(sig, expected)) return null;

  let parsed: { sub?: unknown; role?: unknown; cs?: unknown; iat?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const exp = Number(parsed.exp);
  if (!Number.isFinite(exp) || Date.now() / 1000 >= exp) return null;

  const username = typeof parsed.sub === "string" ? parsed.sub : "";
  if (!username) return null;
  const role: Role = parsed.role === "admin" ? "admin" : "user";

  // Invalidate sessions whose credential has since changed or been deleted:
  // the embedded stamp must still match the account's current one.
  const stamp = typeof parsed.cs === "string" ? parsed.cs : "";
  const current = getCredentialStamp(username, role);
  if (!current || current !== stamp) return null;

  const iat = Number(parsed.iat);
  return { username, role, issuedAt: Number.isFinite(iat) ? iat * 1000 : Date.now() };
}

// Legacy `base64url(payload).hex(hmac)` tokens (payload `{u,r,t,cs}`), still
// honored so sessions predating the JWT switch keep working until they age out.
function readLegacyToken(payload: string, sig: string): Session | null {
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
