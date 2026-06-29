import { NextResponse } from "next/server";
import { isOnboarded } from "@/lib/config";
import { heartbeat } from "@/lib/local";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";
// Reading every device can take a while on a cold start (discovery + version
// detection across many devices), so allow plenty of time.
export const maxDuration = 120;

// Keep-alive heartbeat. Meant to be called by a cron (e.g. every 15 min):
//
//   curl -fsS "http://<hub>/api/heartbeat"                       # if no secret set
//   curl -fsS -H "x-heartbeat-secret: <s>" "http://<hub>/api/heartbeat"
//   curl -fsS "http://<hub>/api/heartbeat?key=<s>"               # secret via query
//
// It reads every device over the LAN, which warms the IP/version caches and
// wakes idle radios — so a person opening the dashboard afterwards gets fast
// status reads instead of the ~20s cold start.
//
// Auth: optional. If HEARTBEAT_SECRET is set in the environment it must be
// presented (header or ?key=). If it's NOT set, the endpoint is open — fine for
// a hub reachable only on your LAN; set the secret if it's exposed more widely.

function authorized(req: Request): boolean {
  const secret = process.env.HEARTBEAT_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const presented =
    req.headers.get("x-heartbeat-secret") ?? url.searchParams.get("key") ?? "";
  return presented === secret;
}

async function run(req: Request) {
  if (!isOnboarded()) {
    return NextResponse.json({ ok: false, error: "Not set up yet" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const started = Date.now();
  const r = await heartbeat();
  const durationMs = Date.now() - started;

  // "ok" = every device responded. "degraded" = some did. "down" = none (or no
  // devices). The check itself always succeeds (HTTP 200) so a cron sees the body.
  const ok = r.total > 0 && r.unreachable === 0;
  const status = r.reachable > 0 ? (ok ? "ok" : "degraded") : "down";

  logAction("HEARTBEAT", {
    reachable: r.reachable,
    total: r.total,
    scanning: r.scanning,
    durationMs,
  });

  return NextResponse.json({
    ok,
    status,
    total: r.total,
    reachable: r.reachable,
    unreachable: r.unreachable,
    scanning: r.scanning,
    durationMs,
    checkedAt: started,
    devices: r.devices,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
