"use client";

// Sleek "Edit Mode" flag — per device, in localStorage (mirrors uiTheme.ts).
// Run Mode is the default lightweight control-only surface; Edit Mode reveals
// the admin management features. Read AFTER mount to avoid an SSR hydration
// mismatch (start false, hydrate in a useEffect). Admin-only: callers must gate
// on isAdmin as well — this only remembers the last choice on this device.

const KEY = "sleek-edit-mode";

export function readEditMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setEditMode(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
