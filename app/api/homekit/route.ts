import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { guard } from "@/lib/auth";
import { isHomekitEnabled, setHomekitEnabled } from "@/lib/config";
import { gatewayConfigured, gatewayHomekitStatus } from "@/lib/gateway";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// The Apple Home (HomeKit) bridge runs inside the device gateway. This route
// (admin only: the setup code lets anyone add the house to their Home) reports
// its state and a QR code to scan, and turns it on/off.
async function describe() {
  const status = await gatewayHomekitStatus();
  const qrSvg = status?.setupURI
    ? await QRCode.toString(status.setupURI, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
    : null;
  return {
    enabled: isHomekitEnabled(),
    gatewayConfigured: gatewayConfigured(),
    gatewayReachable: status !== null,
    status,
    qrSvg,
  };
}

export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(await describe());
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let enabled = false;
  try {
    enabled = Boolean((await req.json())?.enabled);
  } catch {
    enabled = false;
  }
  setHomekitEnabled(enabled);
  logAction(enabled ? "HOMEKIT_ON" : "HOMEKIT_OFF", {});
  // The gateway notices the config change within a few seconds.
  await new Promise((r) => setTimeout(r, 3500));
  return NextResponse.json(await describe());
}
