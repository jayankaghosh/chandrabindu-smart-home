import { NextResponse } from "next/server";
import { authenticate, isOnboarded } from "@/lib/config";
import {
  COOKIE_NAME,
  UNLOCK_COOKIE,
  createSessionToken,
  SESSION_MAX_AGE,
} from "@/lib/auth";
import { logAction } from "@/lib/logger";

// Tiny in-memory brute-force speed bump (per server instance).
let recentFailures = 0;
let windowStart = Date.now();

export async function POST(req: Request) {
  if (!isOnboarded()) {
    return NextResponse.json(
      { error: "Not set up yet", needsOnboarding: true },
      { status: 409 },
    );
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

  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = typeof body?.username === "string" ? body.username : "";
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    username = "";
    password = "";
  }

  await new Promise((r) => setTimeout(r, 300));

  const identity = authenticate(username, password);
  if (!identity) {
    recentFailures++;
    return NextResponse.json(
      { error: "Invalid username or password" },
      { status: 401 },
    );
  }

  logAction("LOGIN", { username: identity.username, role: identity.role });
  const res = NextResponse.json({
    ok: true,
    username: identity.username,
    role: identity.role,
  });
  res.cookies.set(COOKIE_NAME, createSessionToken(identity), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  // Start each session with no rooms unlocked.
  res.cookies.set(UNLOCK_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
