import { NextResponse } from "next/server";
import { COOKIE_NAME, UNLOCK_COOKIE, authCookieOptions } from "@/lib/auth";
import { logAction } from "@/lib/logger";

export async function POST(req: Request) {
  logAction("LOGOUT");
  const res = NextResponse.json({ ok: true });
  const clear = authCookieOptions(req, 0);
  res.cookies.set(COOKIE_NAME, "", clear);
  res.cookies.set(UNLOCK_COOKIE, "", clear);
  return res;
}
