import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { deleteAutomation, updateAutomation } from "@/lib/automations";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Update an automation (or just toggle enabled) — admin only.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const automation = updateAutomation(params.id, body);
    logAction("AUTOMATION_UPDATE", { id: params.id, enabled: automation.enabled });
    return NextResponse.json({ automation });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "Automation not found" ? 404 : 400 });
  }
}

// Delete an automation — admin only.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  deleteAutomation(params.id);
  logAction("AUTOMATION_DELETE", { id: params.id });
  return NextResponse.json({ ok: true });
}
