import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getLatLng, setLatLng } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// House location (lat/lng) for sunrise/sunset automation triggers. Admin-only
// PUT; GET returns the current value (or null) to any signed-in user.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ location: getLatLng() });
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: { lat?: unknown; lng?: unknown; clear?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.clear === true) {
    setLatLng(null);
    logAction("LOCATION_SET", { cleared: true });
    return NextResponse.json({ location: null });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Valid lat (-90..90) and lng (-180..180) required" }, { status: 400 });
  }
  setLatLng({ lat, lng });
  logAction("LOCATION_SET", { lat, lng });
  return NextResponse.json({ location: getLatLng() });
}
