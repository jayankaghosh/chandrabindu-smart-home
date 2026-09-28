import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getSuperProtected, isSuperProtectedConfigured, setSuperProtected } from "@/lib/config";
import { getCatalogDevice } from "@/lib/store";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// The super-protected lifeline switch (powers the internet / router / hub).
// GET returns the current setting to any signed-in user (used to gate the app).
// PUT (admin) chooses the switch, or declares the main switch non-smart.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({
    configured: isSuperProtectedConfigured(),
    value: getSuperProtected(),
  });
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let body: { none?: boolean; deviceId?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Declaring the main switch non-smart: satisfies the setup gate, nothing to control.
  if (body.none === true) {
    setSuperProtected({ none: true });
    logAction("SUPER_PROTECTED_SET", { none: true });
    return NextResponse.json({ configured: true, value: getSuperProtected() });
  }

  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!deviceId || !code) {
    return NextResponse.json(
      { error: "Choose a switch, or select that your main switch is not smart." },
      { status: 400 },
    );
  }

  const device = await getCatalogDevice(deviceId);
  const fn = device?.functions.find((f) => f.code === code);
  if (!device || !fn) {
    return NextResponse.json({ error: "That control no longer exists." }, { status: 400 });
  }
  if (fn.type !== "Boolean") {
    return NextResponse.json({ error: "The lifeline switch must be an on/off switch." }, { status: 400 });
  }

  setSuperProtected({ deviceId, code });
  logAction("SUPER_PROTECTED_SET", { deviceId, code, device: device.cloudName });
  return NextResponse.json({ configured: true, value: getSuperProtected() });
}
