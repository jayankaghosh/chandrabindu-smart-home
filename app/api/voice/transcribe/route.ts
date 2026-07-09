import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getOpenRouter } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Speech-to-text: the browser records a short clip and posts it here as base64;
// we proxy it to OpenRouter's Whisper transcription (keeping the key server-side)
// and return the text. Same OpenRouter key used for the chat.
const STT_MODEL = process.env.VOICE_STT_MODEL || "openai/whisper-large-v3";

export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const cfg = getOpenRouter();
  if (!cfg) return NextResponse.json({ error: "AI features are off." }, { status: 400 });

  let audio = "";
  let format = "webm";
  try {
    const body = await req.json();
    audio = typeof body?.audio === "string" ? body.audio : "";
    format = typeof body?.format === "string" ? body.format : "webm";
  } catch {
    /* fall through */
  }
  if (!audio) return NextResponse.json({ error: "No audio provided" }, { status: 400 });

  try {
    const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: STT_MODEL, input_audio: { data: audio, format } }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || `Transcription failed (${res.status})` },
        { status: 502 },
      );
    }
    return NextResponse.json({ text: (data?.text || "").trim() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
