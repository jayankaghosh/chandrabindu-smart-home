import { NextResponse } from "next/server";
import {
  UNLOCK_COOKIE,
  getSession,
  guard,
  readUnlocks,
  serializeUnlocks,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { getRoomLockStamp, isRoomLocked, verifyRoomPassword } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Unlock a locked room for the current session by supplying its password.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard();
  if (denied) return denied;
  const session = getSession()!;

  if (!isRoomLocked(params.id)) {
    return NextResponse.json({ ok: true }); // nothing to unlock
  }

  let password = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    password = "";
  }

  // Small delay to blunt brute-forcing the room password.
  await new Promise((r) => setTimeout(r, 250));

  if (!verifyRoomPassword(params.id, password)) {
    logAction("ROOM_UNLOCK_FAILED", { room: params.id, user: session.username });
    return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
  }

  const unlocks = readUnlocks();
  const stamp = getRoomLockStamp(params.id);
  if (stamp) unlocks[params.id] = stamp;

  logAction("ROOM_UNLOCK", { room: params.id, user: session.username });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(UNLOCK_COOKIE, serializeUnlocks(unlocks), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
