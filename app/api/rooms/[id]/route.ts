import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { updateOverrides } from "@/lib/store";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Rename a room (stored as a local override).
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let name = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name.trim() : "";
  } catch {
    name = "";
  }
  if (!name) {
    return NextResponse.json({ error: "Room name required" }, { status: 400 });
  }
  await updateOverrides((o) => {
    o.roomName[params.id] = name;
    const extra = o.extraRooms.find((r) => r.id === params.id);
    if (extra) extra.name = name;
  });
  logAction("ROOM_RENAME", { id: params.id, name });
  return NextResponse.json({ ok: true });
}
