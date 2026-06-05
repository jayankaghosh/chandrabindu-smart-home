import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getCatalogDevice } from "@/lib/store";
import type { DeviceFunction } from "@/lib/types";

export const dynamic = "force-dynamic";

// Controllable actions for a device, read from the local catalog.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard();
  if (denied) return denied;
  const device = await getCatalogDevice(params.id);
  if (!device) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }
  const functions: DeviceFunction[] = device.functions.map((f) => ({
    code: f.code,
    name: f.name,
    type: f.type,
    range: f.range,
    min: f.min,
    max: f.max,
    step: f.step,
    scale: f.scale,
    unit: f.unit,
  }));
  return NextResponse.json({ functions });
}
