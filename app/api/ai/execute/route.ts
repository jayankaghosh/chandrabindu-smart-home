import { NextResponse } from "next/server";
import { getSession, guard, isRoomAccessible } from "@/lib/auth";
import { isAiEnabled } from "@/lib/config";
import { getCatalogDevice, getDeviceRoomId } from "@/lib/store";
import { setCommandLocal } from "@/lib/local";
import { buildDeviceIndex, validateActions } from "@/lib/chat";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Execute confirmed assistant actions. Actions are RE-VALIDATED server-side
// against the catalog (never trust the client) and locked rooms are skipped.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  if (!isAiEnabled()) {
    return NextResponse.json({ error: "AI features are turned off." }, { status: 400 });
  }
  const user = getSession()?.username;

  let raw: any[] = [];
  try {
    const body = await req.json();
    raw = Array.isArray(body?.actions) ? body.actions : [];
  } catch {
    raw = [];
  }

  const index = await buildDeviceIndex();
  const actions = validateActions(raw, index);
  if (!actions.length) {
    return NextResponse.json({ error: "No valid actions to run" }, { status: 400 });
  }

  const results: {
    device: string;
    ok: boolean;
    error?: string;
    locked?: boolean;
  }[] = [];
  let ignoredLocked = 0;
  const accessCache = new Map<string, boolean>();

  for (const a of actions) {
    const roomId = await getDeviceRoomId(a.deviceId);
    if (!accessCache.has(roomId)) accessCache.set(roomId, isRoomAccessible(roomId));
    if (!accessCache.get(roomId)) {
      results.push({ device: a.deviceName, ok: false, locked: true });
      ignoredLocked++;
      continue;
    }
    const device = await getCatalogDevice(a.deviceId);
    if (!device) {
      results.push({ device: a.deviceName, ok: false, error: "Device not found" });
      continue;
    }
    try {
      await setCommandLocal(device, [{ code: a.code, value: a.value }]);
      results.push({ device: a.deviceName, ok: true });
      logAction("AI_COMMAND", {
        user,
        device: device.cloudName,
        control: a.controlName,
        code: a.code,
        value: a.value,
      });
    } catch (e) {
      results.push({ device: a.deviceName, ok: false, error: (e as Error).message });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failed = results.length - okCount - ignoredLocked;
  return NextResponse.json({ ok: okCount, failed, ignoredLocked, results });
}
