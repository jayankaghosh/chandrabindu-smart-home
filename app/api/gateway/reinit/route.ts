import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { gatewayReinit } from "@/lib/gateway";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Rebuild the gateway's device connections from a fresh catalog. Use after
// catalog.json changes (sync/scan/manual edits change device IP/key/version).
// Admin only.
export async function POST() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  try {
    const result = await gatewayReinit();
    logAction("GATEWAY_REINIT", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
