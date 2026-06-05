import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { updateOverrides } from "@/lib/store";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Local edits to a device: move to a room and/or rename. Stored as overrides
// so they survive a re-sync.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: { roomId?: unknown; name?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  await updateOverrides((o) => {
    if (typeof body.roomId === "string" && body.roomId) {
      o.deviceRoom[params.id] = body.roomId;
    }
    if (typeof body.name === "string") {
      const trimmed = body.name.trim();
      if (trimmed) o.deviceName[params.id] = trimmed;
      else delete o.deviceName[params.id];
    }
  });

  logAction("DEVICE_EDIT", {
    id: params.id,
    name: typeof body.name === "string" ? body.name : undefined,
    roomId: typeof body.roomId === "string" ? body.roomId : undefined,
  });
  return NextResponse.json({ ok: true });
}
