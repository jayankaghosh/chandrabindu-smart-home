import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { listProtectedControls } from "@/lib/config";
import { getCatalogDevice, getModel } from "@/lib/store";
import { getStatusLocal } from "@/lib/local";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Live state of protected CONTROLS (admin). state: on | off | unreachable | na.
// "off" (the case we warn about) = a Boolean control that's reachable and false.
// Non-Boolean controls report "na" (no meaningful off); unreachable is NOT treated
// as off (avoids false alarms on this intermittently-reachable LAN).
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;

  // Group protected controls by device so each device is read once.
  const byDevice = new Map<string, string[]>();
  for (const { deviceId, code } of listProtectedControls()) {
    byDevice.set(deviceId, [...(byDevice.get(deviceId) ?? []), code]);
  }

  // Display names (device + control label) from the effective model.
  const { rooms } = await getModel();
  const deviceName = new Map<string, string>();
  const controlName = new Map<string, string>(); // `${deviceId}:${code}` -> label
  for (const r of rooms) {
    for (const d of r.devices) {
      deviceName.set(d.id, d.name);
      for (const f of d.functions) controlName.set(`${d.id}:${f.code}`, f.name);
    }
  }

  const controls: {
    deviceId: string;
    code: string;
    deviceName: string;
    controlName: string;
    state: "on" | "off" | "unreachable" | "na" | "unknown";
  }[] = [];

  for (const [deviceId, codes] of byDevice) {
    const dName = deviceName.get(deviceId) ?? deviceId;
    const meta = await getCatalogDevice(deviceId);
    if (!meta) {
      for (const code of codes) {
        controls.push({
          deviceId,
          code,
          deviceName: dName,
          controlName: controlName.get(`${deviceId}:${code}`) ?? code,
          state: "unknown",
        });
      }
      continue;
    }
    let values: Record<string, unknown> | null = null;
    try {
      const status = await getStatusLocal(meta);
      values = {};
      for (const s of status) values[s.code] = s.value;
    } catch {
      values = null; // unreachable
    }
    for (const code of codes) {
      const fn = meta.functions.find((f) => f.code === code);
      const cName = controlName.get(`${deviceId}:${code}`) ?? code;
      let state: "on" | "off" | "unreachable" | "na" | "unknown";
      if (values === null) state = "unreachable";
      else if (!fn || fn.type !== "Boolean") state = "na";
      else state = values[code] === true ? "on" : "off";
      controls.push({ deviceId, code, deviceName: dName, controlName: cName, state });
    }
  }

  return NextResponse.json({ controls });
}
