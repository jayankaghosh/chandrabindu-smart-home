import { NextResponse } from "next/server";
import { getSession, guard, isRoomAccessible } from "@/lib/auth";
import { isControlProtected } from "@/lib/config";
import { getCatalogDevice, getDeviceRoomId } from "@/lib/store";
import { setCommandLocal } from "@/lib/local";
import { buildDeviceIndex, validateActions } from "@/lib/chat";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Execute device actions the Realtime voice model requested. Actions are
// RE-VALIDATED server-side against the catalog (never trust the model), and:
//   • PROTECTED controls are ALWAYS skipped — for every role. This is the hard
//     protection boundary; the model's instructions are only a soft first layer.
//   • Locked rooms (not unlocked this session) are skipped.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const session = getSession()!;

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

  const results: { device: string; control: string; ok: boolean; error?: string; locked?: boolean; protected?: boolean }[] = [];
  let skippedLocked = 0;
  let skippedProtected = 0;
  const accessCache = new Map<string, boolean>();

  for (const a of actions) {
    // Protected controls: never actuated via voice, regardless of role.
    if (isControlProtected(a.deviceId, a.code)) {
      results.push({ device: a.deviceName, control: a.controlName, ok: false, protected: true });
      skippedProtected++;
      continue;
    }
    const roomId = await getDeviceRoomId(a.deviceId);
    if (!accessCache.has(roomId)) accessCache.set(roomId, isRoomAccessible(roomId));
    if (!accessCache.get(roomId)) {
      results.push({ device: a.deviceName, control: a.controlName, ok: false, locked: true });
      skippedLocked++;
      continue;
    }
    const device = await getCatalogDevice(a.deviceId);
    if (!device) {
      results.push({ device: a.deviceName, control: a.controlName, ok: false, error: "Device not found" });
      continue;
    }
    try {
      await setCommandLocal(device, [{ code: a.code, value: a.value }]);
      results.push({ device: a.deviceName, control: a.controlName, ok: true });
      logAction("VOICE_COMMAND", {
        user: session.username,
        device: device.cloudName,
        control: a.controlName,
        code: a.code,
        value: a.value,
      });
    } catch (e) {
      results.push({ device: a.deviceName, control: a.controlName, ok: false, error: (e as Error).message });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok - skippedLocked - skippedProtected;
  return NextResponse.json({ ok, failed, skippedProtected, skippedLocked, results });
}
