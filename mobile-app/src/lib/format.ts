import type { DeviceFunction } from "../types";

export const CONTROLLABLE = ["Boolean", "Enum", "Integer"];

export const favKey = (deviceId: string, code: string) => `${deviceId}::${code}`;

// Is this control in an "on"/active state for the given value?
export function isOn(fn: DeviceFunction, value: unknown): boolean {
  if (fn.type === "Boolean") return value === true;
  if (fn.type === "Integer") return typeof value === "number" && value > (fn.min ?? 0);
  if (fn.type === "Enum") return value != null && value !== "" && !/^(off|close|closed|pause|stop)$/i.test(String(value));
  return value != null;
}

// Humanise an enum option like "high_speed" → "High speed".
export function enumLabel(opt: string): string {
  return opt.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// A short label for the current value, shown under the control name.
export function valueLabel(fn: DeviceFunction, value: unknown): string {
  if (fn.type === "Boolean") return value === true ? "On" : "Off";
  if (fn.type === "Enum") return value != null && value !== "" ? enumLabel(String(value)) : "—";
  if (fn.type === "Integer") {
    if (typeof value !== "number") return "—";
    const scaled = fn.scale ? value / Math.pow(10, fn.scale) : value;
    return `${scaled}${fn.unit ?? ""}`;
  }
  return value == null ? "—" : String(value);
}
