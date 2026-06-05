import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getInsightsStatus, setOpenRouter } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json(getInsightsStatus());
}

// Update the OpenRouter API key and/or model. Empty apiKey keeps the existing.
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
  if (!apiKey && !model) {
    return NextResponse.json(
      { error: "Provide an API key and/or model" },
      { status: 400 },
    );
  }
  setOpenRouter({ apiKey: apiKey || undefined, model: model || undefined });
  logAction("INSIGHTS_CONFIG", { model: model || undefined, keyChanged: Boolean(apiKey) });
  return NextResponse.json(getInsightsStatus());
}
