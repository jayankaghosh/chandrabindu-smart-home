import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { gatewayHomekitReset } from "@/lib/gateway";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Remove the house from every Apple Home it was added to and make a new setup
// code (admin). Use when a phone was lost or the code was shared too widely.
export async function POST() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  try {
    const status = await gatewayHomekitReset();
    logAction("HOMEKIT_RESET", {});
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
