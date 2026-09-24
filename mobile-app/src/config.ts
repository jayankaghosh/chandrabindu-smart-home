// The hub's base URL comes from EXPO_PUBLIC_SERVER_URL (see .env). Expo inlines
// EXPO_PUBLIC_* variables at build time, so this is a plain string at runtime.
const raw = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://192.168.68.68";

// Normalise: strip a trailing slash so `${SERVER_URL}/api/...` is always clean.
export const SERVER_URL = raw.replace(/\/+$/, "");

export const api = (path: string) => `${SERVER_URL}${path.startsWith("/") ? path : `/${path}`}`;
