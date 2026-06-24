// Persistent per-chat session store: maps a Telegram chat id to the Bearer
// token (and identity) obtained by pairing. Survives bot restarts so users stay
// logged in for the token's 7-day lifetime. Stored in data/sessions.json
// (gitignored). We persist the token, never a password — the bot never sees one.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "sessions.json");

export interface BotSession {
  token: string;
  username: string;
  role: "admin" | "user";
}

type StoreShape = Record<string, BotSession>;

function read(): StoreShape {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as StoreShape;
  } catch {
    return {};
  }
}

function write(store: StoreShape): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function getSession(chatId: number): BotSession | null {
  return read()[String(chatId)] ?? null;
}

export function setSession(chatId: number, session: BotSession): void {
  const store = read();
  store[String(chatId)] = session;
  write(store);
}

export function clearSession(chatId: number): void {
  const store = read();
  delete store[String(chatId)];
  write(store);
}
