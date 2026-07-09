// Friendly labels + action options for controls in the Sleek theme. Mirrors the
// Classic ControlTile conventions (fan speeds → Off/Low/Medium/High/Full).
import type { DeviceFunction } from "@/lib/types";

export const FAN_LABELS: Record<string, string> = {
  "0": "Off",
  "25": "Low",
  "50": "Medium",
  "75": "High",
  "100": "Full",
};

/** Label for one enum value within its range. */
export function enumLabel(value: string, fn: DeviceFunction): string {
  if (/^\d+$/.test(value)) return FAN_LABELS[value] ?? `${value}${fn.unit ?? "%"}`;
  return value;
}

/** Human label for a control's current value. */
export function valueLabel(fn: DeviceFunction, v: unknown): string {
  if (fn.type === "Boolean") return v === true ? "On" : "Off";
  if (fn.type === "Enum") return enumLabel(String(v ?? ""), fn);
  if (fn.type === "Integer") {
    const n = Number(v);
    if (n <= (fn.min ?? 0)) return "Off";
    return `${n}${fn.unit ?? ""}`;
  }
  return String(v ?? "");
}

/** Is a value considered "on" (for lit styling)? */
export function isOn(fn: DeviceFunction, v: unknown): boolean {
  if (fn.type === "Boolean") return v === true;
  if (fn.type === "Enum") return String(v ?? "") !== "0" && String(v ?? "") !== "";
  if (fn.type === "Integer") return Number(v) > (fn.min ?? 0);
  return false;
}

export const CONTROLLABLE = ["Boolean", "Enum", "Integer"];
