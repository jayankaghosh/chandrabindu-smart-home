import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { gatewayConfigured, openGatewayEvents } from "@/lib/gateway";

export const dynamic = "force-dynamic";
// A long-lived stream — don't let the platform time it out.
export const maxDuration = 3600;

// Server-Sent Events: relays the device gateway's real-time state stream to the
// browser (snapshot + live change/state events), so the dashboard updates
// instantly instead of polling. Requires a signed-in session.
//
// Returns 204 when there's no gateway to stream from; the client then falls
// back to interval polling. EventSource treats a non-200 as "closed", so it
// won't hammer this endpoint when no gateway is present.
export async function GET(req: Request) {
  const denied = guard();
  if (denied) return denied;
  if (!gatewayConfigured()) return new NextResponse(null, { status: 204 });

  const upstream = await openGatewayEvents(req.signal);
  if (!upstream || !upstream.body) return new NextResponse(null, { status: 204 });

  // Pipe the gateway's SSE body straight through to the browser. When the
  // browser disconnects, req.signal aborts the upstream fetch (see openGatewayEvents).
  return new NextResponse(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // disable proxy buffering (nginx)
    },
  });
}
