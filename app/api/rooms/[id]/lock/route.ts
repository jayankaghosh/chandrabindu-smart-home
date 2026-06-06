import { NextResponse } from "next/server";
import {
  UNLOCK_COOKIE,
  authCookieOptions,
  guard,
  readUnlocks,
  serializeUnlocks,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { getRoomLockStamp, removeRoomLock, setRoomLock } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Set or change a room's password lock (admin). The admin who sets it is
// auto-unlocked for this session so they can keep using the room.
export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  try {
    setRoomLock(params.id, password);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  logAction("ROOM_LOCK", { room: params.id });

  // Auto-unlock for the admin who just set the password (new stamp).
  const unlocks = readUnlocks();
  const stamp = getRoomLockStamp(params.id);
  if (stamp) unlocks[params.id] = stamp;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    UNLOCK_COOKIE,
    serializeUnlocks(unlocks),
    authCookieOptions(req, SESSION_MAX_AGE),
  );
  return res;
}

// Remove a room's lock entirely (admin) — the room is open to everyone again.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  removeRoomLock(params.id);
  logAction("ROOM_UNLOCK_REMOVE", { room: params.id });
  return NextResponse.json({ ok: true });
}
