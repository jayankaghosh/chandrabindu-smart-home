import { NextResponse } from "next/server";
import { getSession, guard } from "@/lib/auth";
import { applyMemoryUpdate } from "@/lib/chatMemory";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// The Realtime voice model's `remember` tool. Saves durable facts to the same
// store the chat agent uses. scope "core" (shared house memory) is honored only
// for the admin — see applyMemoryUpdate.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const session = getSession()!;

  let body: { add?: unknown; remove?: unknown; scope?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const updated = applyMemoryUpdate(
    session.username,
    { add: body.add, remove: body.remove, scope: body.scope },
    { isAdmin: session.role === "admin" },
  );
  const savedToCore = session.role === "admin" && body.scope === "core";
  logAction("VOICE_MEMORY", { user: session.username, scope: savedToCore ? "core" : "personal" });
  return NextResponse.json({ ok: true, scope: savedToCore ? "core" : "personal", count: updated.length });
}
