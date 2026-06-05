import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getHouseName, setHouseName } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ name: getHouseName() });
}

export async function PUT(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let name = "";
  try {
    const body = await req.json();
    name = typeof body?.name === "string" ? body.name.trim() : "";
  } catch {
    name = "";
  }
  if (!name) {
    return NextResponse.json({ error: "Home name required" }, { status: 400 });
  }
  setHouseName(name);
  logAction("HOUSE_RENAME", { name });
  return NextResponse.json({ name: getHouseName() });
}
