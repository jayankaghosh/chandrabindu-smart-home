import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getAutoRestoreProtected, setAutoRestoreProtected } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Superadmin-only toggle: when on, the gateway turns a protected control back
// ON the moment it goes off. Persisted in config.json; the gateway watches that
// file, so the change takes effect within a couple of seconds.
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json({ enabled: getAutoRestoreProtected() });
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let enabled = false;
  try {
    const body = await req.json();
    enabled = body?.enabled === true;
  } catch {
    enabled = false;
  }
  setAutoRestoreProtected(enabled);
  logAction("PROTECT_AUTORESTORE_CONFIG", { enabled });
  return NextResponse.json({ enabled: getAutoRestoreProtected() });
}
