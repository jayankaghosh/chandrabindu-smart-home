import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { setControlProtected } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Mark or unmark a single control as protected (admin only). Body: {code, protected}.
export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let code = "";
  let isProtected = false;
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code : "";
    isProtected = Boolean(body?.protected);
  } catch {
    code = "";
  }
  if (!code) {
    return NextResponse.json({ error: "A control code is required" }, { status: 400 });
  }

  setControlProtected(params.id, code, isProtected);
  logAction("CONTROL_PROTECT", { id: params.id, code, protected: isProtected });
  return NextResponse.json({ ok: true, protected: isProtected });
}
