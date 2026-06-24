// Short-lived pairing codes for linking external clients (the Telegram bot, a
// TV app, a POS terminal, …) to a user account WITHOUT ever sending a password
// to that client.
//
// A signed-in user mints a code in the web app (POST /api/pairing/code); they
// enter that code on the device, which exchanges it for a normal session token
// (POST /api/pairing/token). Codes are single-use and expire after a few minutes.
//
// Stored in data/pairing.json (gitignored, like the rest of data/). Synchronous
// fs to match lib/config.ts — the file is tiny and read rarely.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Role } from "./config";

const DATA_DIR = path.join(process.cwd(), "data");
const PAIRING_PATH = path.join(DATA_DIR, "pairing.json");

/** How long a freshly minted code stays valid. */
export const PAIRING_TTL_MS = 5 * 60 * 1000;

interface PairingCode {
  /** 6-digit code, as a string (preserves any leading zeros). */
  code: string;
  username: string;
  role: Role;
  expiresAt: number;
}

interface PairingFile {
  codes: PairingCode[];
}

function read(): PairingFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(PAIRING_PATH, "utf8")) as PairingFile;
    return { codes: Array.isArray(parsed?.codes) ? parsed.codes : [] };
  } catch {
    return { codes: [] };
  }
}

function write(file: PairingFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PAIRING_PATH, JSON.stringify(file, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** Drop expired codes; returns the still-valid ones. */
function prune(codes: PairingCode[], now: number): PairingCode[] {
  return codes.filter((c) => c.expiresAt > now);
}

/**
 * Mint a fresh single-use code for an identity. Any earlier unused code for the
 * same user is dropped, so the latest code is the only valid one.
 */
export function createPairingCode(
  username: string,
  role: Role,
): { code: string; expiresAt: number } {
  const now = Date.now();
  const codes = prune(read().codes, now).filter(
    (c) => c.username.toLowerCase() !== username.toLowerCase(),
  );
  // 6 digits, zero-padded. randomInt is uniform and crypto-grade.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = now + PAIRING_TTL_MS;
  codes.push({ code, username, role, expiresAt });
  write({ codes });
  return { code, expiresAt };
}

/**
 * Verify + consume a code (single use). Returns the bound identity, or null if
 * the code is unknown/expired. A correct code is removed so it can't be reused.
 */
export function consumePairingCode(
  input: string,
): { username: string; role: Role } | null {
  const now = Date.now();
  const code = String(input ?? "").trim();
  const codes = prune(read().codes, now);
  const idx = codes.findIndex((c) => c.code === code);
  if (idx < 0) {
    // Persist the pruning even on a miss, so stale codes don't accumulate.
    write({ codes });
    return null;
  }
  const match = codes[idx];
  codes.splice(idx, 1);
  write({ codes });
  return { username: match.username, role: match.role };
}
