import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getOpenRouter } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Text-to-speech: proxy the reply text to OpenRouter's speech endpoint and stream
// the mp3 back to the browser to play through the speakers.
const TTS_MODEL = process.env.VOICE_TTS_MODEL || "x-ai/grok-voice-tts-1.0";
const TTS_VOICE = process.env.VOICE_TTS_VOICE || "Eve";

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const cfg = getOpenRouter();
  if (!cfg) return NextResponse.json({ error: "AI features are off." }, { status: 400 });

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.slice(0, 4000) : "";
  } catch {
    /* fall through */
  }
  if (!text.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  try {
    const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: TTS_MODEL, input: text, voice: TTS_VOICE, response_format: "mp3" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}) as any);
      return NextResponse.json(
        { error: d?.error?.message || `Speech failed (${res.status})` },
        { status: 502 },
      );
    }
    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
