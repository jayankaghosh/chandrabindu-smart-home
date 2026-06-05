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
  let body: { roomId?: unknown; name?: unknown; controls?: unknown } = {};
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
    // Custom control labels: { code: label }. Empty/blank label clears it.
    if (body.controls && typeof body.controls === "object") {
      const labels = (o.controlName[params.id] ??= {});
      for (const [code, raw] of Object.entries(body.controls as Record<string, unknown>)) {
        const label = typeof raw === "string" ? raw.trim() : "";
        if (label) labels[code] = label;
        else delete labels[code];
      }
      if (Object.keys(labels).length === 0) delete o.controlName[params.id];
    }
  });

  logAction("DEVICE_EDIT", {
    id: params.id,
    name: typeof body.name === "string" ? body.name : undefined,
    roomId: typeof body.roomId === "string" ? body.roomId : undefined,
    controls:
      body.controls && typeof body.controls === "object"
        ? Object.keys(body.controls as object).length
        : undefined,
  });
  return NextResponse.json({ ok: true });
}
