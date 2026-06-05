import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { syncCatalog, TuyaError } from "@/lib/tuya";
import { applyCloudCatalog } from "@/lib/store";
import { getTuyaCreds, setTuyaCreds } from "@/lib/config";
import { logAction } from "@/lib/logger";
import type { TuyaCreds } from "@/lib/types";

export const dynamic = "force-dynamic";

// Pull the device catalog from the cloud and persist it (preserving manual
// devices and local overrides). Credentials come from the request body
// (onboarding / settings) or from the stored config (re-sync).
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const fromBody =
    typeof body?.accessId === "string" &&
    typeof body?.accessSecret === "string" &&
    typeof body?.baseUrl === "string"
      ? ({
          accessId: body.accessId.trim(),
          accessSecret: body.accessSecret.trim(),
          baseUrl: body.baseUrl.trim(),
        } as TuyaCreds)
      : null;

  const creds = fromBody ?? getTuyaCreds();
  if (!creds || !creds.accessId || !creds.accessSecret || !creds.baseUrl) {
    return NextResponse.json(
      { error: "No Tuya credentials configured" },
      { status: 400 },
    );
  }

  try {
    const catalog = await syncCatalog(creds);
    await applyCloudCatalog(catalog);
    if (fromBody) setTuyaCreds(creds); // persist only after a successful sync
    logAction("SYNC", {
      devices: catalog.devices.length,
      rooms: catalog.rooms.length,
    });
    return NextResponse.json({
      syncedAt: catalog.syncedAt,
      rooms: catalog.rooms.length,
      devices: catalog.devices.length,
      missingKeys: catalog.devices.filter((d) => !d.key).length,
    });
  } catch (err) {
    const e = err as TuyaError;
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: 502 },
    );
  }
}
