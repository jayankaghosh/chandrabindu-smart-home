import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { readVoiceStatus } from "@/lib/voice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Live device status for the Realtime model's get_status tool.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  let ids: string[] = [];
  try {
    const body = await req.json();
    ids = Array.isArray(body?.deviceIds) ? body.deviceIds.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    ids = [];
  }
  if (!ids.length) {
    return NextResponse.json({ error: "No deviceIds" }, { status: 400 });
  }
  const devices = await readVoiceStatus(ids);
  return NextResponse.json({ devices });
}
