import * as SecureStore from "expo-secure-store";

// The bearer token lives in SecureStore (persisted, encrypted) and is mirrored
// in memory so the api layer can read it synchronously on every request.
const KEY = "shc_token";
let current: string | null = null;

export function getToken(): string | null {
  return current;
}

export async function loadToken(): Promise<string | null> {
  try {
    current = await SecureStore.getItemAsync(KEY);
  } catch {
    current = null;
  }
  return current;
}

export async function saveToken(token: string): Promise<void> {
  current = token;
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    /* ignore — token still held in memory for this session */
  }
}

export async function clearToken(): Promise<void> {
  current = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* ignore */
  }
}
