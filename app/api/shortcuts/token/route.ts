import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { clearShortcutToken, getShortcutToken, regenerateShortcutToken } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// The shared secret API-enabled shortcuts accept in ?shortcut_token=… (admin).
export async function GET() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  return NextResponse.json({ token: getShortcutToken() });
}

// Generate a new token (old shortcut URLs stop working).
export async function POST() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  const token = regenerateShortcutToken();
  logAction("SHORTCUT_TOKEN_REGENERATE", {});
  return NextResponse.json({ token });
}

// Remove the token: running shortcuts by URL is then off entirely.
export async function DELETE() {
  const denied = guard({ admin: true });
  if (denied) return denied;
  clearShortcutToken();
  logAction("SHORTCUT_TOKEN_CLEAR", {});
  return NextResponse.json({ token: null });
}
