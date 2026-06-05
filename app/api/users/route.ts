import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { addUser, listUsers } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// List the standard users (superadmin only). Never returns password hashes.
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json({ users: listUsers() });
}

// Create a new standard user (superadmin only).
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let body: { username?: unknown; password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    addUser(username, password);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  logAction("USER_CREATE", { username: username.trim() });
  return NextResponse.json({ ok: true });
}
