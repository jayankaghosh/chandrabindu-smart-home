import { NextResponse } from "next/server";
import { getSession, guard } from "@/lib/auth";
import { isAppLocked, verifyShortcutToken } from "@/lib/config";
import { AppLockedError } from "@/lib/local";
import { getShortcut, runShortcut } from "@/lib/shortcuts";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// Brute-force speed bump for the token URL (per server instance).
let failures = 0;
let windowStart = Date.now();

async function run(id: string, via: string) {
  const shortcut = getShortcut(id);
  if (!shortcut) return NextResponse.json({ error: "Shortcut not found" }, { status: 404 });
  if (isAppLocked()) {
    return NextResponse.json({ error: "App is locked (loop protection)." }, { status: 423 });
  }
  try {
    return NextResponse.json({ name: shortcut.name, ...(await runShortcut(shortcut, via)) });
  } catch (e) {
    if (e instanceof AppLockedError) {
      return NextResponse.json({ error: "App is locked (loop protection)." }, { status: 423 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Run from the UI (any signed-in user).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = guard();
  if (denied) return denied;
  return run(params.id, `user:${getSession()!.username}`);
}

// Run from outside (an iPhone Shortcut, a script) with ?shortcut_token=…
// No session needed, but the shortcut must have API access turned on.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (Date.now() - windowStart > 60_000) {
    failures = 0;
    windowStart = Date.now();
  }
  if (failures > 20) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const token = new URL(req.url).searchParams.get("shortcut_token") ?? "";
  if (!verifyShortcutToken(token)) {
    failures++;
    logAction("SHORTCUT_API_DENIED", { id: params.id });
    return NextResponse.json({ error: "Invalid or missing shortcut_token" }, { status: 401 });
  }
  const shortcut = getShortcut(params.id);
  if (shortcut && !shortcut.apiEnabled) {
    return NextResponse.json({ error: "API access is turned off for this shortcut" }, { status: 403 });
  }
  return run(params.id, "api");
}
