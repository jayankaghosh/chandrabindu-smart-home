import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { getModel } from "@/lib/store";
import { aggregateUsage } from "@/lib/history";

export const dynamic = "force-dynamic";

// Per-control on/off durations + toggle counts over [from, to], grouped by room.
// Boolean controls only (that's what "on/off" means). Range comes from the query
// string (?from=<ms>&to=<ms>); defaults to the last 24h.
export async function GET(req: Request) {
  const denied = guard();
  if (denied) return denied;

  const url = new URL(req.url);
  const now = Date.now();
  const to = Number(url.searchParams.get("to")) || now;
  const from = Number(url.searchParams.get("from")) || to - 24 * 3600_000;

  const stats = aggregateUsage(from, to);
  const { rooms } = await getModel();

  const out = rooms
    .map((room) => ({
      id: room.id,
      name: room.name,
      devices: room.devices
        .filter((d) => !d.bluetooth)
        .map((d) => ({
          id: d.id,
          name: d.name,
          controls: d.functions
            .filter((f) => f.type === "Boolean")
            .map((f) => {
              const s = stats.get(`${d.id}::${f.code}`);
              return {
                code: f.code,
                name: f.name,
                protected: !!f.protected,
                onMs: s?.onMs ?? 0,
                offMs: s?.offMs ?? 0,
                toggles: s?.toggles ?? 0,
                hasData: !!s?.hasData,
              };
            }),
        }))
        .filter((d) => d.controls.length > 0),
    }))
    .filter((r) => r.devices.length > 0);

  return NextResponse.json({ from, to, rooms: out });
}
