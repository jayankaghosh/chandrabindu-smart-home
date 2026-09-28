// The Tuya datapoint code for a switch panel's whole-panel physical button lock
// ("child lock"). When on, the panel's physical buttons are disabled; LAN / app
// control still works. It is panel-wide (there is no per-gang lock on this
// hardware). Treated specially in the UI: a dedicated per-panel lock control,
// admin-only to change, and never counted as a switch that is "on".

export const CHILD_LOCK_CODE = "child_lock";

export function isChildLock(code: string): boolean {
  return code === CHILD_LOCK_CODE;
}
