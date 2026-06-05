import { NextResponse } from "next/server";
import { guard, isRoomAccessible } from "@/lib/auth";
import { getCatalogDevice, getDeviceRoomId } from "@/lib/store";
import { getStatusLocal, isScanning } from "@/lib/local";

export const dynamic = "force-dynamic";

// Live status read over the LAN.
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
  const roomId = await getDeviceRoomId(params.id);
  if (!isRoomAccessible(roomId)) {
    return NextResponse.json(
      { error: "Room is locked", locked: true },
      { status: 423 },
    );
  }
  try {
    const status = await getStatusLocal(device);
    return NextResponse.json({ status, online: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, online: false, scanning: isScanning() },
      { status: 503 },
    );
  }
}
