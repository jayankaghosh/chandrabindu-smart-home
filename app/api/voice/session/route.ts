import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { isRealtimeVoiceEnabled } from "@/lib/config";
import { createRealtimeSecret } from "@/lib/voice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Mint a short-lived OpenAI Realtime ephemeral client secret for the browser's
// WebRTC handshake. The session (persona + catalog + tools + voice) is
// configured server-side; the raw OpenAI key never leaves the server.
export async function POST() {
  const denied = guard();
  if (denied) return denied;
  if (!isRealtimeVoiceEnabled()) {
    return NextResponse.json({ error: "Voice is not set up." }, { status: 503 });
  }
  try {
    const secret = await createRealtimeSecret();
    return NextResponse.json(secret);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
