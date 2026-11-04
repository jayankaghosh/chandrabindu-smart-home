import { NextResponse } from "next/server";
import { getSession, guard } from "@/lib/auth";
import { getGoodnight, setGoodnight } from "@/lib/config";
import { changesSince, readLastCheck } from "@/lib/goodnight";

export const dynamic = "force-dynamic";

// The Goodnight round: room order (shared), plus this user's last round and the
// switch changes recorded since then.
export async function GET() {
  const denied = guard();
  if (denied) return denied;
  const lastCheck = readLastCheck(getSession()!.username);
  return NextResponse.json({ ...getGoodnight(), lastCheck, changes: changesSince(lastCheck) });
}

// Admin: set the room order and the rooms left out. Body: { order, skip }.
export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : null);
  const order = ids(body?.order);
  const skip = ids(body?.skip) ?? [];
  if (!order) return NextResponse.json({ error: "order must be a list of room ids" }, { status: 400 });
  setGoodnight(order, skip);
  return NextResponse.json(getGoodnight());
}
