import { NextResponse } from "next/server";
import {
  COOKIE_NAME,
  createSessionToken,
  authCookieOptions,
  getSession,
  guard,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import {
  authenticate,
  setPassword,
  setUserPassword,
  verifyPassword,
} from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Change your own password: supply the current password + a new one. Works for
// the admin (the superadmin password) and for standard users (their own entry).
// setPassword/setUserPassword preserve the session secret, so you stay signed in.
export async function POST(req: Request) {
  const denied = guard();
  if (denied) return denied;
  const session = getSession()!;

  let body: { currentPassword?: unknown; newPassword?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";

  // Admin's password is the top-level (superadmin) password; standard users
  // each have their own. Verify the current one against the right credential.
  const currentOk =
    session.role === "admin"
      ? verifyPassword(currentPassword)
      : authenticate(session.username, currentPassword) !== null;
  if (!currentOk) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 400 },
    );
  }

  // Admin passwords allow 4+ chars (matching onboarding); user passwords 6+.
  const minLength = session.role === "admin" ? 4 : 6;
  if (newPassword.length < minLength) {
    return NextResponse.json(
      { error: `New password must be at least ${minLength} characters` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current one" },
      { status: 400 },
    );
  }

  try {
    if (session.role === "admin") setPassword(newPassword);
    else setUserPassword(session.username, newPassword);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  logAction("PASSWORD_CHANGE", { user: session.username, role: session.role });

  // Changing the password invalidates every existing session for this account
  // (their credential stamp is now stale). Re-issue a fresh cookie so the device
  // that made the change stays signed in; other devices are logged out.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    COOKIE_NAME,
    createSessionToken(session),
    authCookieOptions(req, SESSION_MAX_AGE),
  );
  return res;
}
