import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getScreensaver, setScreensaver } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET the screensaver settings + image ids (any signed-in user — it renders for
// everyone). PUT toggles enabled / idle seconds (admin).
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json(getScreensaver());
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: { enabled?: unknown; idleSec?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  setScreensaver({
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    idleSec: typeof body.idleSec === "number" ? body.idleSec : undefined,
  });
  logAction("SCREENSAVER_CONFIG", getScreensaver());
  return NextResponse.json(getScreensaver());
}
