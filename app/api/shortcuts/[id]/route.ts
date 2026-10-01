import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { deleteShortcut, updateShortcut } from "@/lib/shortcuts";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Update a shortcut (or just toggle its API access), admin only.
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
    const shortcut = updateShortcut(params.id, body);
    logAction("SHORTCUT_UPDATE", { id: params.id, apiEnabled: shortcut.apiEnabled });
    return NextResponse.json({ shortcut });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "Shortcut not found" ? 404 : 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  deleteShortcut(params.id);
  logAction("SHORTCUT_DELETE", { id: params.id });
  return NextResponse.json({ ok: true });
}
