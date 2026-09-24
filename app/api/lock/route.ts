import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getLockInfo, isAppLocked, setAppLocked } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// App-wide safety lock. GET returns the current state to any signed-in user;
// PUT (admin) sets it — used for the "Unlock" button (and manual lock if needed).
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ locked: isAppLocked(), info: getLockInfo() });
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let locked = false;
  try {
    locked = Boolean((await req.json())?.locked);
  } catch {
    locked = false;
  }
  setAppLocked(locked, locked ? { at: Date.now(), reason: "Locked by admin" } : undefined);
  logAction(locked ? "APP_LOCK" : "APP_UNLOCK", {});
  return NextResponse.json({ locked: isAppLocked(), info: getLockInfo() });
}
