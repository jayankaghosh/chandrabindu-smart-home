import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getInsightsStatus } from "@/lib/config";
import {
  generateInsights,
  listInsights,
  today,
  INSIGHT_DAY_OPTIONS,
} from "@/lib/insights";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Key status + today's date + the list of previously-analyzed timeframes.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  const status = getInsightsStatus();
  return NextResponse.json({
    hasKey: status.hasKey,
    model: status.model,
    today: today(),
    analyses: listInsights(),
  });
}

// Generate (analyze/reanalyze) for a given day range.
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let days = 7;
  try {
    const body = await req.json();
    if (INSIGHT_DAY_OPTIONS.includes(Number(body?.days))) days = Number(body.days);
  } catch {
    /* default */
  }
  try {
    const result = await generateInsights(days);
    logAction("INSIGHTS_ANALYZE", { days, model: result.model });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
