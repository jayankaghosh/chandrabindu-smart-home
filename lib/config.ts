// App configuration store (data/config.json), set up during onboarding.
// Holds the hashed admin password, an auto-generated session secret, and the
// optional Tuya cloud credentials. Synchronous fs with an in-memory cache —
// these values are read on most requests.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { TuyaCreds } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export const DEFAULT_INSIGHTS_MODEL = "qwen/qwen3-coder:free";
export const DEFAULT_HOUSE_NAME = "Home";

// The onboarding password is the superadmin. Superadmin signs in with this
// reserved username; it can never be used for a standard user.
export const SUPERADMIN_USERNAME = "admin";

export type Role = "admin" | "user";

/** A standard user (read + execute only) added by the superadmin. */
interface StoredUser {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
}

/** A password lock an admin has placed on a room (scrypt-hashed). */
interface RoomLock {
  hash: string;
  salt: string;
  updatedAt: number;
}

interface AppConfig {
  passwordHash: string;
  passwordSalt: string;
  sessionSecret: string;
  houseName?: string;
  /** Regular users (read + execute only). Superadmin is the top-level password. */
  users?: StoredUser[];
  /** Per-room password locks, keyed by roomId. */
  roomLocks?: Record<string, RoomLock>;
  tuya?: TuyaCreds;
  openrouter?: { apiKey: string; model: string };
}

/** Public (no secret) view of a user, for the settings UI. */
export interface PublicUser {
  username: string;
  createdAt: number;
}

/** Result of a successful credential check. */
export interface AuthResult {
  username: string;
  role: Role;
}

// Always read fresh from disk. An in-memory cache risks one process/hot-reload
// overwriting the file with stale data and dropping fields (it once wiped the
// OpenRouter key). The file is tiny, so reading per request is fine.
function read(): AppConfig | null {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as AppConfig;
  } catch {
    return null;
  }
}

function write(config: AppConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/** Constant-time check of a password against a stored salt+hash. */
function verifyHash(password: string, salt: string, expectedHex: string): boolean {
  const candidate = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function isOnboarded(): boolean {
  return Boolean(read()?.passwordHash);
}

/** Set (or reset) the admin password; generates a session secret if absent. */
export function setPassword(password: string): void {
  const existing = read();
  const salt = crypto.randomBytes(16).toString("hex");
  const config: AppConfig = {
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    sessionSecret:
      existing?.sessionSecret ?? crypto.randomBytes(48).toString("hex"),
    houseName: existing?.houseName,
    users: existing?.users,
    roomLocks: existing?.roomLocks,
    tuya: existing?.tuya,
    openrouter: existing?.openrouter,
  };
  write(config);
}

export function getHouseName(): string {
  return read()?.houseName?.trim() || DEFAULT_HOUSE_NAME;
}

export function setHouseName(name: string): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  write({ ...config, houseName: name.trim() || DEFAULT_HOUSE_NAME });
}

/** Verify the superadmin (onboarding) password. */
export function verifyPassword(password: string): boolean {
  const config = read();
  if (!config) return false;
  return verifyHash(password, config.passwordSalt, config.passwordHash);
}

// ── Users ────────────────────────────────────────────────────────────────────

/**
 * Check a username + password against the superadmin and the user list.
 * Returns the matched identity + role, or null if the credentials are wrong.
 */
export function authenticate(username: string, password: string): AuthResult | null {
  const config = read();
  if (!config) return null;
  const name = username.trim();

  // Superadmin: the onboarding password, signed in as the reserved username.
  if (name.toLowerCase() === SUPERADMIN_USERNAME) {
    return verifyHash(password, config.passwordSalt, config.passwordHash)
      ? { username: SUPERADMIN_USERNAME, role: "admin" }
      : null;
  }

  const user = (config.users ?? []).find(
    (u) => u.username.toLowerCase() === name.toLowerCase(),
  );
  if (!user) return null;
  return verifyHash(password, user.passwordSalt, user.passwordHash)
    ? { username: user.username, role: "user" }
    : null;
}

/**
 * A non-reversible fingerprint of an identity's current password hash, or null
 * if the identity no longer exists. Embedded in the session token and re-checked
 * on every request: it changes whenever the password changes and disappears when
 * the user is deleted, so old sessions are invalidated in both cases.
 */
export function getCredentialStamp(username: string, role: Role): string | null {
  const config = read();
  if (!config) return null;
  let hash: string | undefined;
  if (role === "admin") {
    if (username.toLowerCase() !== SUPERADMIN_USERNAME) return null;
    hash = config.passwordHash;
  } else {
    const user = (config.users ?? []).find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    hash = user?.passwordHash;
  }
  if (!hash) return null;
  return crypto.createHash("sha256").update(hash).digest("hex").slice(0, 16);
}

export function listUsers(): PublicUser[] {
  return (read()?.users ?? [])
    .map((u) => ({ username: u.username, createdAt: u.createdAt }))
    .sort((a, b) => a.username.localeCompare(b.username));
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/;

/** Create a new standard user. Throws with a user-facing message on bad input. */
export function addUser(username: string, password: string): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  const name = username.trim();
  if (!USERNAME_RE.test(name)) {
    throw new Error(
      "Username must be 2–32 characters: letters, numbers, dot, dash or underscore",
    );
  }
  if (name.toLowerCase() === SUPERADMIN_USERNAME) {
    throw new Error(`"${SUPERADMIN_USERNAME}" is reserved`);
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const users = config.users ?? [];
  if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
    throw new Error("That username already exists");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  users.push({
    username: name,
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    createdAt: Date.now(),
  });
  write({ ...config, users });
}

/** Remove a user by username. No-op if they don't exist. */
export function removeUser(username: string): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  const users = (config.users ?? []).filter(
    (u) => u.username.toLowerCase() !== username.trim().toLowerCase(),
  );
  write({ ...config, users });
}

/** Reset an existing user's password. */
export function setUserPassword(username: string, password: string): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const users = config.users ?? [];
  const user = users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
  );
  if (!user) throw new Error("User not found");
  const salt = crypto.randomBytes(16).toString("hex");
  user.passwordSalt = salt;
  user.passwordHash = hashPassword(password, salt);
  write({ ...config, users });
}

// ── Room locks ───────────────────────────────────────────────────────────────

export function isRoomLocked(roomId: string): boolean {
  return Boolean(read()?.roomLocks?.[roomId]);
}

/** Room ids that currently have a password lock. */
export function listLockedRoomIds(): string[] {
  return Object.keys(read()?.roomLocks ?? {});
}

/** Set or change a room's lock password (admin). Min 4 chars. */
export function setRoomLock(roomId: string, password: string): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  if (password.length < 4) {
    throw new Error("Room password must be at least 4 characters");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const roomLocks = { ...(config.roomLocks ?? {}) };
  roomLocks[roomId] = {
    hash: hashPassword(password, salt),
    salt,
    updatedAt: Date.now(),
  };
  write({ ...config, roomLocks });
}

/** Remove a room's lock entirely (admin). */
export function removeRoomLock(roomId: string): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  if (!config.roomLocks?.[roomId]) return;
  const roomLocks = { ...config.roomLocks };
  delete roomLocks[roomId];
  write({ ...config, roomLocks });
}

export function verifyRoomPassword(roomId: string, password: string): boolean {
  const lock = read()?.roomLocks?.[roomId];
  if (!lock) return false;
  return verifyHash(password, lock.salt, lock.hash);
}

/**
 * Fingerprint of a room lock's current hash, or null if the room isn't locked.
 * Embedded in a session's unlock token so changing the room password (new hash)
 * invalidates everyone's unlock.
 */
export function getRoomLockStamp(roomId: string): string | null {
  const lock = read()?.roomLocks?.[roomId];
  if (!lock) return null;
  return crypto.createHash("sha256").update(lock.hash).digest("hex").slice(0, 16);
}

export function getSessionSecret(): string {
  const secret = read()?.sessionSecret;
  if (!secret) throw new Error("App is not onboarded yet");
  return secret;
}

export function getTuyaCreds(): TuyaCreds | null {
  return read()?.tuya ?? null;
}

export function setTuyaCreds(creds: TuyaCreds): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  write({ ...config, tuya: creds });
}

/** OpenRouter API key + model for Insights (null if no key set). */
export function getOpenRouter(): { apiKey: string; model: string } | null {
  const o = read()?.openrouter;
  if (!o?.apiKey) return null;
  return { apiKey: o.apiKey, model: o.model || DEFAULT_INSIGHTS_MODEL };
}

/** Non-secret view for the settings UI. */
export function getInsightsStatus(): { hasKey: boolean; model: string } {
  const o = read()?.openrouter;
  return { hasKey: Boolean(o?.apiKey), model: o?.model || DEFAULT_INSIGHTS_MODEL };
}

export function setOpenRouter(opts: { apiKey?: string; model?: string }): void {
  const config = read();
  if (!config) throw new Error("App is not onboarded yet");
  const prev = config.openrouter ?? { apiKey: "", model: DEFAULT_INSIGHTS_MODEL };
  write({
    ...config,
    openrouter: {
      // empty/undefined apiKey keeps the existing one
      apiKey: opts.apiKey ? opts.apiKey.trim() : prev.apiKey,
      model: (opts.model && opts.model.trim()) || prev.model || DEFAULT_INSIGHTS_MODEL,
    },
  });
}

/** Non-secret view of credentials for the settings UI. */
export function getCredsStatus(): { hasCreds: boolean; accessId?: string; baseUrl?: string } {
  const t = read()?.tuya;
  if (!t) return { hasCreds: false };
  return { hasCreds: true, accessId: t.accessId, baseUrl: t.baseUrl };
}
