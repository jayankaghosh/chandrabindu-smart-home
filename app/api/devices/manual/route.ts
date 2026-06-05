import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { addManualDevice, ensureRoomByName, updateOverrides } from "@/lib/store";
import { discoverFunctions, seedIp } from "@/lib/local";
import { logAction } from "@/lib/logger";
import type { CatalogDevice } from "@/lib/types";

export const dynamic = "force-dynamic";

// Add a device by hand (onboarding fallback / settings). Requires the local
// key; on success we connect over the LAN and discover its controllable
// datapoints so it behaves like a synced device.
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const roomName = typeof body.roomName === "string" ? body.roomName : "";
  const version =
    typeof body.version === "string" && body.version ? body.version : "3.4";
  const ip = typeof body.ip === "string" ? body.ip.trim() : "";

  if (!id || !key || !name) {
    return NextResponse.json(
      { error: "Device id, local key and name are required" },
      { status: 400 },
    );
  }

  const device: CatalogDevice = {
    id,
    key,
    version,
    category: type || "unknown",
    cloudName: name,
    online: false,
    manual: true,
    functions: [],
    ...(ip ? { ip } : {}),
  };

  if (ip) seedIp(id, ip);

  let reachable = true;
  let discoverError: string | null = null;
  try {
    device.functions = await discoverFunctions(device);
  } catch (e) {
    reachable = false;
    discoverError = (e as Error).message;
  }

  await addManualDevice(device);
  const roomId = await ensureRoomByName(roomName);
  await updateOverrides((o) => {
    o.deviceRoom[id] = roomId;
  });
  logAction("DEVICE_ADD", { id, name, reachable, functions: device.functions.length });

  return NextResponse.json({
    ok: true,
    reachable,
    functions: device.functions.length,
    error: discoverError,
  });
}
