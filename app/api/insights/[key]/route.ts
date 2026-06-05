import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { readInsight } from "@/lib/insights";

export const dynamic = "force-dynamic";

// Fetch one cached analysis by its key (e.g. "7d_2026-06-05").
export async function GET(
  _req: Request,
  { params }: { params: { key: string } },
) {
  const denied = guard();
  if (denied) return denied;
  const result = readInsight(params.key);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
