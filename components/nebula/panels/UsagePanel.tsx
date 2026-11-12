"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { Empty, Loading } from "./ui";

interface Control {
  code: string;
  name: string;
  protected: boolean;
  onMs: number;
  offMs: number;
  toggles: number;
  hasData: boolean;
}
interface RoomUsage {
  id: string;
  name: string;
  devices: { id: string; name: string; controls: Control[] }[];
}

const RANGES = [
  { key: "1h", label: "1H", ms: 3600_000 },
  { key: "3h", label: "3H", ms: 3 * 3600_000 },
  { key: "12h", label: "12H", ms: 12 * 3600_000 },
  { key: "1d", label: "1D", ms: 24 * 3600_000 },
  { key: "3d", label: "3D", ms: 3 * 24 * 3600_000 },
  { key: "7d", label: "7D", ms: 7 * 24 * 3600_000 },
];

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// Usage as light bars: how long each switch burned in the window, brightest
// first, grouped by room. Data comes from the gateway's history store.
export default function UsagePanel() {
  const [range, setRange] = useState("1d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rooms, setRooms] = useState<RoomUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIdle, setShowIdle] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    let f: number;
    let t: number;
    if (range === "custom") {
      f = from ? new Date(from).getTime() : NaN;
      t = to ? new Date(to).getTime() : Date.now();
      if (!Number.isFinite(f)) return setError("Pick a start time");
    } else {
      t = Date.now();
      f = t - (RANGES.find((r) => r.key === range)?.ms ?? 86400_000);
    }
    setRooms(null);
    try {
      const res = await fetch(`/api/usage?from=${f}&to=${t}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setRooms(d.rooms ?? []);
    } catch (e) {
      setError((e as Error).message);
      setRooms([]);
    }
  }, [range, from, to]);
  useEffect(() => {
    if (range !== "custom") load();
  }, [range, load]);

  const flat = useMemo(
    () =>
      (rooms ?? []).flatMap((r) =>
        r.devices.flatMap((d) => d.controls.filter((c) => !c.protected).map((c) => ({ ...c, room: r.name, device: d.name, key: `${d.id}:${c.code}` }))),
      ),
    [rooms],
  );
  const max = Math.max(1, ...flat.map((c) => c.onMs));
  const active = flat.filter((c) => c.hasData && (c.onMs > 0 || c.toggles > 0)).sort((a, b) => b.onMs - a.onMs);
  const idle = flat.filter((c) => !(c.hasData && (c.onMs > 0 || c.toggles > 0)));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {[...RANGES, { key: "custom", label: "Custom", ms: 0 }].map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`nb-mono relative rounded-full px-3 py-1.5 text-[11px] uppercase transition-colors ${range === r.key ? "text-slate-950" : "text-slate-400 hover:text-white"}`}
          >
            {range === r.key && <motion.span layoutId="nb-usage-range" className="absolute inset-0 rounded-full bg-[rgb(var(--nb-hue))] shadow-[0_0_16px_rgb(var(--nb-hue)/0.7)]" />}
            <span className="relative">{r.label}</span>
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="mb-5 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400">
            <span className="mb-1 block">From</span>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="field !py-2" />
          </label>
          <label className="text-xs text-slate-400">
            <span className="mb-1 block">To (blank = now)</span>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="field !py-2" />
          </label>
          <button onClick={load} className="btn-primary">Show</button>
        </div>
      )}
      {error && <p className="mb-4 text-sm text-amber-300">{error}</p>}

      {!rooms ? (
        <Loading />
      ) : active.length === 0 ? (
        <Empty icon={<BarChart3 size={26} />} title="Nothing ran in this window" hint="Usage is recorded by the device gateway while it runs." />
      ) : (
        <ul className="space-y-2.5">
          {active.map((c, i) => (
            <motion.li key={c.key} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 20) * 0.025 }}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-white">
                  {c.name} <span className="text-xs text-slate-500">· {c.device} · {c.room}</span>
                </p>
                <p className="nb-mono shrink-0 text-[11px] text-[rgb(var(--nb-hue))]">
                  {fmtDur(c.onMs)} <span className="text-slate-500">· {c.toggles}×</span>
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[rgb(var(--nb-hue)/0.5)] to-[rgb(var(--nb-hue))] shadow-[0_0_12px_rgb(var(--nb-hue)/0.8)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, (c.onMs / max) * 100)}%` }}
                  transition={{ duration: 0.9, delay: Math.min(i, 20) * 0.025, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </motion.li>
          ))}
        </ul>
      )}
      {rooms && idle.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowIdle((v) => !v)} className="nb-mono text-[10px] uppercase text-slate-500 hover:text-white">
            {showIdle ? "Hide" : "Show"} {idle.length} idle
          </button>
          {showIdle && (
            <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {idle.map((c) => (
                <li key={c.key} className="truncate text-xs text-slate-500">
                  {c.name} · {c.room}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
