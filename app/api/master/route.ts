import { NextResponse } from "next/server";
import { guard, isRoomAccessible } from "@/lib/auth";
import { isAppLocked } from "@/lib/config";
import { getCatalogDevice, getModel } from "@/lib/store";
import { setCommandLocal } from "@/lib/local";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Master on/off: set every controllable Boolean switch to on/off at once.
// Always skips protected controls, Bluetooth devices, and locked rooms.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  if (isAppLocked()) {
    return NextResponse.json({ error: "App is locked (loop protection)." }, { status: 423 });
  }

  let on = false;
  try {
    on = Boolean((await req.json())?.on);
  } catch {
    on = false;
  }

  const { rooms } = await getModel();
  let ok = 0;
  let failed = 0;
  let skippedProtected = 0;
  let skippedLocked = 0;

  for (const room of rooms) {
    if (!isRoomAccessible(room.id)) {
      skippedLocked += room.devices.reduce(
        (n, d) => n + (d.bluetooth ? 0 : d.functions.filter((f) => f.type === "Boolean").length),
        0,
      );
      continue;
    }
    for (const device of room.devices) {
      if (device.bluetooth) continue;
      const boolFns = device.functions.filter((f) => f.type === "Boolean");
      if (boolFns.length === 0) continue;
      const meta = await getCatalogDevice(device.id);
      if (!meta) continue;
      for (const fn of boolFns) {
        if (fn.protected) {
          skippedProtected++;
          continue;
        }
        try {
          await setCommandLocal(meta, [{ code: fn.code, value: on }]);
          ok++;
        } catch {
          failed++;
        }
      }
    }
  }

  logAction("MASTER", { on, ok, failed, skippedProtected, skippedLocked });
  return NextResponse.json({ on, ok, failed, skippedProtected, skippedLocked });
}
