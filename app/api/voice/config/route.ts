import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getRealtimeVoiceStatus, setOpenaiRealtime } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Realtime voice config (admin). GET returns the non-secret status; PUT sets the
// OpenAI key / model / voice / enabled. The key is write-only (never returned).
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(getRealtimeVoiceStatus());
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: { apiKey?: unknown; model?: unknown; voice?: unknown; enabled?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  setOpenaiRealtime({
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    voice: typeof body.voice === "string" ? body.voice : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
  });
  logAction("VOICE_CONFIG", { enabled: getRealtimeVoiceStatus().enabled });
  return NextResponse.json(getRealtimeVoiceStatus());
}
