import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { addShortcut, listShortcuts } from "@/lib/shortcuts";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Shortcuts: anyone signed in can see and run them; admins author them.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ shortcuts: listShortcuts() });
}

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
    const shortcut = addShortcut(body);
    logAction("SHORTCUT_CREATE", { id: shortcut.id, name: shortcut.name });
    return NextResponse.json({ shortcut });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
