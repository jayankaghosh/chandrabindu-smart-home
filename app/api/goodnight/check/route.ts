import { NextResponse } from "next/server";
import { getSession, guard } from "@/lib/auth";
import { writeLastCheck } from "@/lib/goodnight";

export const dynamic = "force-dynamic";

// Record a finished Goodnight round for this user. Body: { on: ["deviceId:code", ...] }
// (whatever was still on when the round ended).
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const on = Array.isArray(body?.on) ? body.on.filter((k: unknown): k is string => typeof k === "string") : [];
  return NextResponse.json({ lastCheck: writeLastCheck(getSession()!.username, on) });
}
