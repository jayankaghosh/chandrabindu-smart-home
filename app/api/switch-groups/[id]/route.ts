import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { deleteSwitchGroup, updateSwitchGroup } from "@/lib/switchGroups";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  try {
    const body = await req.json();
    const group = updateSwitchGroup(params.id, body);
    logAction("SWITCH_GROUP_UPDATE", { id: group.id, name: group.name });
    return NextResponse.json({ group });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg }, { status: msg === "Group not found" ? 404 : 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  deleteSwitchGroup(params.id);
  logAction("SWITCH_GROUP_DELETE", { id: params.id });
  return NextResponse.json({ ok: true });
}
