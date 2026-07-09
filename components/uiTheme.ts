"use client";

// The UI experience (not colour) — Classic dashboard vs the Sleek guided,
// touch-first theme. Stored per device in localStorage (a wall tablet can run
// Sleek while a laptop stays Classic). Light/dark remains a separate axis.

export type UiTheme = "classic" | "sleek";
const KEY = "ui-theme";

export function readUiTheme(): UiTheme {
  try {
    return localStorage.getItem(KEY) === "sleek" ? "sleek" : "classic";
  } catch {
    return "classic";
  }
}

export function setUiTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}
