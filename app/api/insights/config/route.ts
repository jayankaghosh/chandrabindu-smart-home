import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getAiStatus, setOpenRouter } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// AI features config: key/model presence + enabled flag.
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(getAiStatus());
}

// Update the OpenRouter API key, model and/or the enabled toggle.
export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;

  if (!apiKey && !model && enabled === undefined) {
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 },
    );
  }
  setOpenRouter({
    apiKey: apiKey || undefined,
    model: model || undefined,
    enabled,
  });
  logAction("AI_CONFIG", {
    model: model || undefined,
    keyChanged: Boolean(apiKey),
    enabled,
  });
  return NextResponse.json(getAiStatus());
}
