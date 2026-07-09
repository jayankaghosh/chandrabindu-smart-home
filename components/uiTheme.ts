"use client";

// The UI experience (not colour) — Classic dashboard vs the Sleek guided,
// touch-first theme. Stored per device in localStorage (a wall tablet can run
// Sleek while a laptop stays Classic). Light/dark remains a separate axis.

export type UiTheme = "classic" | "sleek";
const KEY = "ui-theme";

// Sleek is the default; Classic only when explicitly selected on this device.
export function readUiTheme(): UiTheme {
  try {
    return localStorage.getItem(KEY) === "classic" ? "classic" : "sleek";
  } catch {
    return "sleek";
  }
}

export function setUiTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}
