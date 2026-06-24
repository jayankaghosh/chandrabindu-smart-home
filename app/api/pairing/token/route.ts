import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth";
import { isOnboarded } from "@/lib/config";
import { consumePairingCode } from "@/lib/pairing";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Exchange a pairing code for a session token. Called by an external client (the
// Telegram bot, a TV app, a POS terminal, …) that has no session yet, so this
// route is NOT behind guard(). It is gated instead by:
//   1. A shared secret header that only trusted clients know (PAIRING_SECRET).
//   2. A single-use, short-lived pairing code the user minted in the web app.
//   3. A small in-memory rate limit.
// Fails closed: if the shared secret is not configured, the route is disabled.

let recentFailures = 0;
let windowStart = Date.now();

function constantTimeEqual(a: string, b: string): boolean {
  // Length leak is acceptable here; compare bytes in constant time otherwise.
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) diff |= aBuf[i] ^ bBuf[i];
  return diff === 0;
}

export async function POST(req: Request) {
  if (!isOnboarded()) {
    return NextResponse.json({ error: "Not set up yet" }, { status: 409 });
  }

  const expectedSecret = process.env.PAIRING_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Device pairing is not configured on the server." },
      { status: 503 },
    );
  }
  const presented = req.headers.get("x-pairing-secret") ?? "";
  if (!constantTimeEqual(presented, expectedSecret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (Date.now() - windowStart > 60_000) {
    recentFailures = 0;
    windowStart = Date.now();
  }
  if (recentFailures > 10) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let code = "";
  let client = "";
  try {
    const body = await req.json();
    code = typeof body?.code === "string" ? body.code : "";
    // Optional self-reported client label, for audit only (e.g. "telegram").
    client = typeof body?.client === "string" ? body.client.slice(0, 32) : "";
  } catch {
    code = "";
  }

  await new Promise((r) => setTimeout(r, 250));

  const identity = consumePairingCode(code);
  if (!identity) {
    recentFailures++;
    return NextResponse.json(
      { error: "Invalid or expired pairing code" },
      { status: 401 },
    );
  }

  const token = createSessionToken(identity);
  logAction("DEVICE_PAIRED", {
    username: identity.username,
    role: identity.role,
    client: client || "unknown",
  });
  return NextResponse.json({
    ok: true,
    token,
    username: identity.username,
    role: identity.role,
  });
}
