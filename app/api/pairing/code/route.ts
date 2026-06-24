import { NextResponse } from "next/server";
import { getSession, guard } from "@/lib/auth";
import { createPairingCode, PAIRING_TTL_MS } from "@/lib/pairing";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// A signed-in user mints a short-lived pairing code to link an external client
// (the Telegram bot, a TV app, a POS terminal, …) to their own account WITHOUT
// typing a password into that client. The client redeems the code for a session
// token at POST /api/pairing/token.
export async function POST() {
  const denied = guard();
  if (denied) return denied;
  const session = getSession()!;

  const { code, expiresAt } = createPairingCode(session.username, session.role);
  logAction("PAIRING_CODE_CREATED", { username: session.username, role: session.role });
  return NextResponse.json({ code, expiresAt, ttlMs: PAIRING_TTL_MS });
}
