import { NextResponse } from "next/server";
import { getSession, guard, isRoomAccessible } from "@/lib/auth";
import { getCatalogDevice, getDeviceRoomId, getRoutine } from "@/lib/store";
import { setCommandLocal } from "@/lib/local";
import { logAction } from "@/lib/logger";
import type { CatalogFunction } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function validate(value: unknown, fn: CatalogFunction): string | null {
  switch (fn.type) {
    case "Boolean":
      return typeof value === "boolean" ? null : `${fn.code} expects a boolean`;
    case "Enum":
      if (typeof value !== "string") return `${fn.code} expects a string`;
      if (fn.range && !fn.range.includes(value))
        return `${value} is not valid for ${fn.code}`;
      return null;
    case "Integer":
      if (typeof value !== "number") return `${fn.code} expects a number`;
      if (typeof fn.min === "number" && value < fn.min) return `${fn.code} too low`;
      if (typeof fn.max === "number" && value > fn.max) return `${fn.code} too high`;
      return null;
    default:
      return null;
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard();
  if (denied) return denied;
  const user = getSession()?.username;
  const routine = await getRoutine(params.id);
  if (!routine) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  // Run actions in order; each waits its own delay (ms) before firing.
  // Actions targeting a locked room the session hasn't unlocked are ignored.
  const results: {
    device: string;
    ok: boolean;
    error?: string;
    locked?: boolean;
  }[] = [];
  let ignoredLocked = 0;
  const accessCache = new Map<string, boolean>();
  const accessible = async (deviceId: string): Promise<boolean> => {
    const roomId = await getDeviceRoomId(deviceId);
    if (!accessCache.has(roomId)) accessCache.set(roomId, isRoomAccessible(roomId));
    return accessCache.get(roomId)!;
  };

  for (const a of routine.actions) {
    // Check the lock before waiting/firing — skip locked actions entirely.
    if (!(await accessible(a.deviceId))) {
      const device = await getCatalogDevice(a.deviceId);
      results.push({
        device: device?.cloudName ?? a.deviceId,
        ok: false,
        locked: true,
      });
      ignoredLocked++;
      continue;
    }

    const delay = Math.max(0, Number(a.delayMs) || 0);
    if (delay) await sleep(delay);

    const device = await getCatalogDevice(a.deviceId);
    if (!device) {
      results.push({ device: a.deviceId, ok: false, error: "Device not found" });
      continue;
    }
    const fn = device.functions.find((f) => f.code === a.code);
    if (!fn) {
      results.push({ device: device.cloudName, ok: false, error: `Unknown ${a.code}` });
      continue;
    }
    const problem = validate(a.value, fn);
    if (problem) {
      results.push({ device: device.cloudName, ok: false, error: problem });
      continue;
    }
    try {
      await setCommandLocal(device, [{ code: a.code, value: a.value }]);
      results.push({ device: device.cloudName, ok: true });
    } catch (e) {
      results.push({ device: device.cloudName, ok: false, error: (e as Error).message });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failed = results.length - okCount - ignoredLocked;
  logAction("ROUTINE_RUN", {
    user,
    name: routine.name,
    ok: okCount,
    failed,
    ignoredLocked,
  });
  return NextResponse.json({ ok: okCount, failed, ignoredLocked, results });
}
