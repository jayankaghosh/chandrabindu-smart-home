import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { scanLan } from "@/lib/local";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
// Scanning a /24 + key-matching can take a while.
export const maxDuration = 120;

// Find Tuya devices on the LAN by direct TCP and match them to the catalog by
// local key. Persists each device's IP + protocol version. Use this when
// devices show "Unreachable" because UDP broadcast discovery is blocked.
export async function POST() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  try {
    const result = await scanLan(true); // manual scan → re-probe everything
    logAction("SCAN", result);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
