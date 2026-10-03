// What counts toward the "N on" badges (home, room list, room switcher, panel
// headers): switches that are on, and fans running at any speed. Protected
// controls (meant to stay on) and the panel child lock never count. Other
// enums (a bulb's work_mode) and integers (brightness, colour temperature,
// countdown) are settings, not things that are "on", so they are left out.
import type { DeviceFunction } from "./types";
import { isChildLock } from "./panelLock";

/** A fan speed control: an Enum whose every option is a number ("0" = off). */
export function isFanLevel(fn: DeviceFunction): boolean {
  return fn.type === "Enum" && (fn.range?.length ?? 0) > 0 && fn.range!.every((v) => /^\d+$/.test(v));
}

export function countsAsOn(fn: DeviceFunction, value: unknown): boolean {
  if (fn.protected || isChildLock(fn.code)) return false;
  if (fn.type === "Boolean") return value === true;
  if (isFanLevel(fn)) return value !== undefined && value !== null && String(value) !== "" && Number(value) > 0;
  return false;
}
