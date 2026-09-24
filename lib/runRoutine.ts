// Server-side, session-less routine runner used by the automation scheduler
// (and any non-request context). Mirrors the /api/routines/[id]/run handler but
// without per-session room-lock checks (automations have no session; like the
// gateway's automation actions, they skip protected controls only). Protection
// is enforced here AND again inside setCommandLocal's lock guard.

import { getCatalogDevice, getRoutine } from "./store";
import { isControlProtected } from "./config";
import { setCommandLocal } from "./local";
import { logAction } from "./logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RoutineRunResult {
  ran: number;
  failed: number;
  skippedProtected: number;
}

/** Run a routine's actions in order (honoring delays), skipping protected controls. */
export async function runRoutineActions(routineId: string): Promise<RoutineRunResult> {
  const routine = await getRoutine(routineId);
  if (!routine) return { ran: 0, failed: 0, skippedProtected: 0 };

  let ran = 0;
  let failed = 0;
  let skippedProtected = 0;

  for (const a of routine.actions) {
    if (isControlProtected(a.deviceId, a.code)) {
      skippedProtected++;
      continue;
    }
    const delay = Math.max(0, Number(a.delayMs) || 0);
    if (delay) await sleep(delay);
    const device = await getCatalogDevice(a.deviceId);
    if (!device) {
      failed++;
      continue;
    }
    try {
      await setCommandLocal(device, [{ code: a.code, value: a.value }]);
      ran++;
    } catch {
      failed++;
    }
  }

  logAction("ROUTINE_RUN", { name: routine.name, ran, failed, skippedProtected, via: "automation" });
  return { ran, failed, skippedProtected };
}
