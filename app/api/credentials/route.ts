import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getCredsStatus, setTuyaCreds } from "@/lib/config";
import { testCredentials, TuyaError } from "@/lib/tuya";
import type { TuyaCreds } from "@/lib/types";

export const dynamic = "force-dynamic";

// Non-secret view of the stored credentials (never returns the secret).
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(getCredsStatus());
}

// Validate and store new Tuya credentials.
export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const creds: TuyaCreds = {
    accessId: typeof body.accessId === "string" ? body.accessId.trim() : "",
    accessSecret:
      typeof body.accessSecret === "string" ? body.accessSecret.trim() : "",
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl.trim() : "",
  };

  if (!creds.accessId || !creds.accessSecret || !creds.baseUrl) {
    return NextResponse.json(
      { error: "Access ID, Access Secret and region URL are all required" },
      { status: 400 },
    );
  }

  try {
    await testCredentials(creds);
  } catch (err) {
    const e = err as TuyaError;
    return NextResponse.json(
      { error: `Credentials rejected by Tuya: ${e.message}`, code: e.code },
      { status: 502 },
    );
  }

  setTuyaCreds(creds);
  return NextResponse.json({ ok: true });
}
