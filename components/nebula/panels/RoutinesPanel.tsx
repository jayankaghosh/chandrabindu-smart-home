"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, Wand2 } from "lucide-react";
import type { EnrichedRoutine } from "@/lib/types";
import { HUES, emitWarp, haptic, pulseFrom, sfx } from "../fx";
import { Empty, List, Loading, Row } from "./ui";

// Routines as launch keys: what each one does, and one press to run it.
export default function RoutinesPanel() {
  const [routines, setRoutines] = useState<EnrichedRoutine[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/routines")
      .then((r) => (r.ok ? r.json() : { routines: [] }))
      .then((d) => setRoutines(d.routines ?? []))
      .catch(() => setRoutines([]));
  }, []);
  useEffect(load, [load]);

  async function run(r: EnrichedRoutine, el: HTMLElement) {
    setBusy(r.id);
    pulseFrom(el, HUES.light, 1.5);
    emitWarp(1);
    sfx("power");
    haptic(20);
    try {
      const res = await fetch(`/api/routines/${r.id}/run`, { method: "POST" });
      const d = await res.json();
      const bits = [`${d.ok ?? 0} done`];
      if (d.failed) bits.push(`${d.failed} failed`);
      if (d.ignoredLocked) bits.push(`${d.ignoredLocked} locked`);
      setResult((s) => ({ ...s, [r.id]: bits.join(" · ") }));
    } catch {
      setResult((s) => ({ ...s, [r.id]: "Failed" }));
    } finally {
      setBusy(null);
      setTimeout(() => setResult((s) => ({ ...s, [r.id]: "" })), 4500);
    }
  }

  if (!routines) return <Loading />;
  if (routines.length === 0) return <Empty icon={<Wand2 size={26} />} title="No routines yet" hint="Admins can create them under Manage in Edit Mode." />;

  return (
    <List>
      {routines.map((r, i) => (
        <Row key={r.id} lit={busy === r.id || !!result[r.id]}>
          <div className="flex items-center gap-4 pl-2">
            <div className="min-w-0 flex-1">
              <p className="nb-mono text-[10px] text-slate-600">{String(i + 1).padStart(2, "0")}</p>
              <p className="truncate text-lg font-semibold tracking-tight text-white">{r.name}</p>
              <p className="nb-mono mt-0.5 text-[10px] uppercase text-slate-500">
                {result[r.id] ? <span className="text-[rgb(var(--nb-hue))]">{result[r.id]}</span> : `${r.actions.length} action${r.actions.length === 1 ? "" : "s"}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.actions.slice(0, 4).map((a, j) => (
                  <span key={j} className="truncate rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-400">
                    {a.controlName} → {a.valueLabel}
                  </span>
                ))}
                {r.actions.length > 4 && <span className="px-1 text-[11px] text-slate-500">+{r.actions.length - 4} more</span>}
              </div>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.06 }}
              disabled={busy === r.id}
              onClick={(e) => run(r, e.currentTarget)}
              aria-label={`Run ${r.name}`}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,rgb(var(--nb-hue))_45%,rgb(var(--nb-hue)/0.5))] text-slate-950 shadow-[0_0_30px_-4px_rgb(var(--nb-hue)/0.9)]"
            >
              {busy === r.id ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} className="translate-x-0.5" />}
            </motion.button>
          </div>
        </Row>
      ))}
    </List>
  );
}
