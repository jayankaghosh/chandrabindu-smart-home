import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { addAutomation, listAutomations } from "@/lib/automations";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// List automations — any signed-in user can view (read-only for non-admins).
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ automations: listAutomations() });
}

// Create an automation — admin only.
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  try {
    const automation = addAutomation(body);
    logAction("AUTOMATION_CREATE", { id: automation.id, name: automation.name });
    return NextResponse.json({ automation });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
