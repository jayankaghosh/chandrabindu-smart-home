import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public app metadata — intentionally NOT behind `guard()`. The Android wrapper
// app hits this first (before any login) to confirm it's talking to a real
// Chandrabindu server on the home network before loading the site in a WebView.
//
// `name` is a stable identifier the wrapper matches against; keep it in sync
// with the EXPECTED_NAME constant in the mobile app.
//
// NOTE: not exported — a Next.js route file may only export route handlers and
// known config fields (GET, dynamic, …); exporting anything else fails the
// production type check (`next build`).
const APP_METADATA = {
  name: "Chandrabindu Smart Home",
  description: "Local-first control for your smart home, served from your home hub.",
  version: "1.0.0",
} as const;

export async function GET() {
  return NextResponse.json(APP_METADATA);
}
