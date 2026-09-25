"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Power } from "lucide-react";

interface Control {
  code: string;
  name: string;
  protected: boolean;
  onMs: number;
  offMs: number;
  toggles: number;
  hasData: boolean;
}
interface Device {
  id: string;
  name: string;
  controls: Control[];
}
interface RoomUsage {
  id: string;
  name: string;
  devices: Device[];
}

const RANGES: { key: string; label: string; ms: number }[] = [
  { key: "1h", label: "1 hour", ms: 3600_000 },
  { key: "3h", label: "3 hours", ms: 3 * 3600_000 },
  { key: "12h", label: "12 hours", ms: 12 * 3600_000 },
  { key: "1d", label: "1 day", ms: 24 * 3600_000 },
  { key: "3d", label: "3 days", ms: 3 * 24 * 3600_000 },
  { key: "7d", label: "7 days", ms: 7 * 24 * 3600_000 },
];

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export default function SleekUsage() {
  const [range, setRange] = useState<string>("1d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rooms, setRooms] = useState<RoomUsage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let from: number;
    let to: number;
    if (range === "custom") {
      from = customFrom ? new Date(customFrom).getTime() : NaN;
      to = customTo ? new Date(customTo).getTime() : Date.now();
      if (!Number.isFinite(from)) {
        setError("Pick a start date");
        setLoading(false);
        return;
      }
    } else {
      to = Date.now();
      from = to - (RANGES.find((r) => r.key === range)?.ms ?? 24 * 3600_000);
    }
    try {
      const res = await fetch(`/api/usage?from=${from}&to=${to}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setRooms(d.rooms);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo]);

  useEffect(() => {
    if (range !== "custom") load();
  }, [range, load]);

  return (
    <div className="space-y-4">
      {/* Range chips */}
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              range === r.key
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "border border-white/60 bg-white/50 text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300"
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={() => setRange("custom")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            range === "custom"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-white/60 bg-white/50 text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300"
          }`}
        >
          Custom
        </button>
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            <span className="mb-1 block">From</span>
            <input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="field !py-2" />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            <span className="mb-1 block">To</span>
            <input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="field !py-2" />
          </label>
          <button onClick={load} className="btn-primary">Apply</button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : rooms && rooms.length > 0 ? (
        <div className="space-y-5">
          {rooms.map((room) => (
            <div key={room.id}>
              <h3 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {room.name}
              </h3>
              <div className="space-y-2">
                {room.devices.flatMap((d) =>
                  d.controls.map((c) => (
                    <div
                      key={`${d.id}:${c.code}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.06]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {d.name} · {c.name}
                          {c.protected && <span className="ml-1 text-xs text-amber-500">[P]</span>}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {c.hasData ? `${c.toggles} toggle${c.toggles === 1 ? "" : "s"}` : "no activity recorded"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-sm">
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                          <Power size={13} /> {fmtDur(c.onMs)}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">off {fmtDur(c.offMs)}</span>
                      </div>
                    </div>
                  )),
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          No usage data for this range yet. History records going forward once the gateway is running.
        </p>
      )}
    </div>
  );
}
