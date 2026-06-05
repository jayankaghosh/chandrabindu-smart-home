import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { removeUser, setUserPassword, SUPERADMIN_USERNAME } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Reset a user's password (superadmin only).
export async function PUT(
  req: Request,
  { params }: { params: { username: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  const username = decodeURIComponent(params.username);
  if (username.toLowerCase() === SUPERADMIN_USERNAME) {
    return NextResponse.json(
      { error: "Change the admin password from onboarding, not here." },
      { status: 400 },
    );
  }

  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const password = typeof body.password === "string" ? body.password : "";

  try {
    setUserPassword(username, password);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  logAction("USER_PASSWORD_RESET", { username });
  return NextResponse.json({ ok: true });
}

// Delete a user (superadmin only).
export async function DELETE(
  _req: Request,
  { params }: { params: { username: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  const username = decodeURIComponent(params.username);
  if (username.toLowerCase() === SUPERADMIN_USERNAME) {
    return NextResponse.json(
      { error: "The admin account cannot be removed." },
      { status: 400 },
    );
  }
  removeUser(username);
  logAction("USER_DELETE", { username });
  return NextResponse.json({ ok: true });
}
