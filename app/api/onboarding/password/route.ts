import { NextResponse } from "next/server";
import {
  isOnboarded,
  setPassword,
  setHouseName,
  SUPERADMIN_USERNAME,
} from "@/lib/config";
import {
  COOKIE_NAME,
  createSessionToken,
  authCookieOptions,
  SESSION_MAX_AGE,
} from "@/lib/auth";

// Step 1 of onboarding: set the admin password. Only allowed once (until the
// app is reset by deleting data/config.json). Logs the user in on success.
export async function POST(req: Request) {
  if (isOnboarded()) {
    return NextResponse.json({ error: "Already set up" }, { status: 409 });
  }

  let password = "";
  let houseName = "";
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
    houseName = typeof body?.houseName === "string" ? body.houseName.trim() : "";
  } catch {
    password = "";
  }

  if (password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 },
    );
  }

  setPassword(password);
  if (houseName) setHouseName(houseName);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    COOKIE_NAME,
    createSessionToken({ username: SUPERADMIN_USERNAME, role: "admin" }),
    authCookieOptions(req, SESSION_MAX_AGE),
  );
  return res;
}
