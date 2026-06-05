// Maps Tuya device category codes to lucide-react icons.
// Tweak any device's icon here in one place.

import {
  Lightbulb,
  Fan,
  ToggleLeft,
  Plug,
  PlugZap,
  Blinds,
  AirVent,
  Thermometer,
  Radar,
  DoorOpen,
  Lock,
  Camera,
  Cpu,
  Power,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Lights
  dj: Lightbulb,
  dd: Lightbulb,
  dc: Lightbulb,
  xdd: Lightbulb,
  fwd: Lightbulb,
  // Fans
  fs: Fan,
  fsd: Fan,
  fskg: Fan,
  // Wall switches
  kg: ToggleLeft,
  tgkg: ToggleLeft,
  tgq: ToggleLeft,
  // Sockets / plugs
  cz: Plug,
  pc: PlugZap,
  // Curtains / blinds
  cl: Blinds,
  clkg: Blinds,
  // Climate
  kt: AirVent,
  qn: Thermometer,
  wk: Thermometer,
  ktkzq: AirVent,
  // Sensors
  mcs: DoorOpen,
  pir: Radar,
  wsdcg: Thermometer,
  // Security
  ms: Lock,
  bxx: Lock,
  sp: Camera,
};

export function iconForCategory(category: string | undefined): LucideIcon {
  if (category && CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  return Cpu;
}

// ── Per-control (per-switch) kind, icon and "on" color ──────────────────────
export type ControlKind = "light" | "fan" | "socket" | "lock" | "switch";

export function controlKind(name: string, code: string): ControlKind {
  const s = `${name} ${code}`.toLowerCase();
  if (/\bfan/.test(s)) return "fan";
  if (/sock|plug|outlet|power/.test(s)) return "socket";
  if (/lock/.test(s)) return "lock";
  if (/light|lamp|bulb|strip|chandelier|led|spot|down/.test(s)) return "light";
  return "switch";
}

const KIND_ICONS: Record<ControlKind, LucideIcon> = {
  light: Lightbulb,
  fan: Fan,
  socket: Plug,
  lock: Lock,
  switch: Power,
};

export function iconForControl(kind: ControlKind): LucideIcon {
  return KIND_ICONS[kind];
}

// Lit-tile gradient per control kind. Colourful in light mode; in dark mode
// everything collapses to a bright white tile (monochrome theme).
const DARK_ON = "dark:from-white dark:to-white";
export const KIND_ON_GRADIENT: Record<ControlKind, string> = {
  light: `from-amber-400 to-orange-500 ${DARK_ON}`,
  fan: `from-sky-400 to-cyan-500 ${DARK_ON}`,
  socket: `from-emerald-400 to-teal-500 ${DARK_ON}`,
  lock: `from-rose-400 to-pink-500 ${DARK_ON}`,
  switch: `from-indigo-400 to-violet-500 ${DARK_ON}`,
};

const DARK_GLOW = "dark:shadow-[0_12px_36px_-12px_rgba(255,255,255,0.3)]";
export const KIND_GLOW: Record<ControlKind, string> = {
  light: `shadow-[0_12px_36px_-10px_rgba(245,158,11,0.7)] ${DARK_GLOW}`,
  fan: `shadow-[0_12px_36px_-10px_rgba(56,189,248,0.7)] ${DARK_GLOW}`,
  socket: `shadow-[0_12px_36px_-10px_rgba(16,185,129,0.7)] ${DARK_GLOW}`,
  lock: `shadow-[0_12px_36px_-10px_rgba(244,63,94,0.7)] ${DARK_GLOW}`,
  switch: `shadow-[0_12px_36px_-10px_rgba(99,102,241,0.7)] ${DARK_GLOW}`,
};
