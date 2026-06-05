import { NextResponse } from "next/server";
import { COOKIE_NAME, UNLOCK_COOKIE } from "@/lib/auth";
import { logAction } from "@/lib/logger";

export async function POST() {
  logAction("LOGOUT");
  const res = NextResponse.json({ ok: true });
  const clear = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(COOKIE_NAME, "", clear);
  res.cookies.set(UNLOCK_COOKIE, "", clear);
  return res;
}
