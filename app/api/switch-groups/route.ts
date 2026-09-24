import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { addSwitchGroup, listSwitchGroups } from "@/lib/switchGroups";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ groups: listSwitchGroups() });
}

export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  try {
    const body = await req.json();
    const group = addSwitchGroup(body);
    logAction("SWITCH_GROUP_CREATE", { id: group.id, name: group.name });
    return NextResponse.json({ group });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
