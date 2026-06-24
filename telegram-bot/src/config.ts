// Environment configuration. Loaded once at startup; fails fast on missing
// required values so misconfiguration is obvious rather than silently insecure.

import "dotenv/config";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    console.error("Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  return v;
}

const allowedRaw = process.env.ALLOWED_TELEGRAM_IDS ?? "";
const allowedIds = new Set(
  allowedRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

if (allowedIds.size === 0) {
  console.error(
    "ALLOWED_TELEGRAM_IDS is empty — the bot would respond to nobody. " +
      "Set it to your Telegram numeric user ID(s) and restart.",
  );
  process.exit(1);
}

export const config = {
  botToken: required("TELEGRAM_BOT_TOKEN"),
  baseUrl: required("BASE_URL").replace(/\/+$/, ""),
  // Shared device-pairing secret — must match PAIRING_SECRET on the Next app.
  pairingSecret: required("PAIRING_SECRET"),
  allowedIds,
};

export function isAllowed(telegramUserId: number | undefined): boolean {
  return telegramUserId !== undefined && config.allowedIds.has(String(telegramUserId));
}
