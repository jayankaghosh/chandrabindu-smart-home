import { NextResponse } from "next/server";
import { guard, isRoomAccessible } from "@/lib/auth";
import { getModel, updateOverrides } from "@/lib/store";
import { getHouseName, isAiEnabled, isRoomLocked } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Effective room → device model (catalog merged with local overrides).
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  const { syncedAt, rooms } = await getModel();
  // Annotate each room with its lock state for this session. Devices are still
  // sent so the UI can show a blurred preview behind the lock overlay; live
  // status + any command is enforced server-side (see status/commands routes).
  const annotated = rooms.map((room) => ({
    ...room,
    locked: isRoomLocked(room.id),
    unlocked: isRoomAccessible(room.id),
  }));
  return NextResponse.json({
    syncedAt,
    rooms: annotated,
    houseName: getHouseName(),
    aiAvailable: isAiEnabled(),
  });
}

// Create a local-only room.
export async function POST(req: Request) {
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
  const id = `local-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  await updateOverrides((o) => {
    o.extraRooms.push({ id, name });
  });
  logAction("ROOM_CREATE", { id, name });
  return NextResponse.json({ id, name });
}
