import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getLoopGuard, setLoopGuard } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Loop-guard thresholds: trip the app lock if one switch toggles more than
// `maxToggles` times within `windowSec` seconds. Admin-only.
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(getLoopGuard());
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: { maxToggles?: unknown; windowSec?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const maxToggles = Number(body.maxToggles);
  const windowSec = Number(body.windowSec);
  if (!Number.isFinite(maxToggles) || !Number.isFinite(windowSec)) {
    return NextResponse.json({ error: "maxToggles and windowSec must be numbers" }, { status: 400 });
  }
  setLoopGuard(maxToggles, windowSec);
  logAction("LOOP_GUARD_CONFIG", getLoopGuard());
  return NextResponse.json(getLoopGuard());
}
