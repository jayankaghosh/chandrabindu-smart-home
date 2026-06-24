// Friendly labels and action buttons for device controls. Turns raw Tuya
// values into the names the user thinks in — e.g. a fan enum 0/25/50/75/100
// becomes Off / Low / Medium / High / Max.

import type { DeviceFunction } from "./api.js";

export interface ActionOption {
  label: string;
  value: unknown;
}

const TIER_NAMES = ["Low", "Medium", "High", "Max"];

/** Friendly tier names for a sorted list of non-zero numeric speed values. */
function tierLabels(nonZero: number[]): Map<number, string> {
  const map = new Map<number, string>();
  if (nonZero.length <= TIER_NAMES.length) {
    // 1–4 speeds → Low / Medium / High / Max, in order.
    nonZero.forEach((v, i) => map.set(v, TIER_NAMES[Math.min(i, TIER_NAMES.length - 1)]));
  } else {
    // More than 4 speeds → just show the percentage.
    nonZero.forEach((v) => map.set(v, `${v}%`));
  }
  return map;
}

/** A friendly label for a single enum value within its range. */
export function enumLabel(value: string, range: string[]): string {
  const numeric = range.every((r) => /^\d+$/.test(r));
  if (!numeric) return value; // non-numeric enum → show as-is
  const n = Number(value);
  if (n === 0) return "Off";
  const nonZero = range.map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  return tierLabels(nonZero).get(n) ?? `${value}%`;
}

/** A friendly label for a control's current value (Boolean/Enum/Integer). */
export function valueLabel(fn: DeviceFunction, value: unknown): string {
  if (fn.type === "Boolean") return value === true || value === "true" ? "On" : "Off";
  if (fn.type === "Enum") return enumLabel(String(value), fn.range ?? []);
  if (fn.type === "Integer") {
    const n = Number(value);
    if (n <= (fn.min ?? 0)) return "Off";
    return `${n}${fn.unit ?? ""}`;
  }
  return String(value);
}

/** The set of action buttons to offer for a control. */
export function actionOptions(fn: DeviceFunction): ActionOption[] {
  if (fn.type === "Boolean") {
    return [
      { label: "On", value: true },
      { label: "Off", value: false },
    ];
  }
  if (fn.type === "Enum") {
    const range = fn.range ?? [];
    return range.map((r) => ({ label: enumLabel(r, range), value: r }));
  }
  if (fn.type === "Integer") {
    // Offer Off + a few evenly-spaced presets across the range.
    const min = fn.min ?? 0;
    const max = fn.max ?? 100;
    const presets = [min, Math.round((max - min) * 0.33 + min), Math.round((max - min) * 0.66 + min), max];
    const uniq = [...new Set(presets)];
    return uniq.map((v) => ({ label: valueLabel(fn, v), value: v }));
  }
  return [];
}

/** Controllable function types (mirrors the app's CONTROLLABLE set). */
export function isControllable(fn: DeviceFunction): boolean {
  return ["Boolean", "Enum", "Integer"].includes(fn.type);
}
