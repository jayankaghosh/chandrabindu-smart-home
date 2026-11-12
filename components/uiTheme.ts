"use client";

// The UI experience (not colour) — Classic dashboard, the Sleek guided,
// touch-first theme, or Nebula (the animated showcase: WebGL, holographic
// tiles, sound). Stored per device in localStorage (a wall tablet can run
// Sleek while a laptop stays Classic). Light/dark remains a separate axis,
// except Nebula, which is always dark.

export type UiTheme = "classic" | "sleek" | "nebula";
const KEY = "ui-theme";

// Sleek is the default; Classic or Nebula only when explicitly selected on this
// device (Nebula is heavy, so it is never picked for you).
export function readUiTheme(): UiTheme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "classic" || v === "nebula" ? v : "sleek";
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
