"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, Check, Wand2 } from "lucide-react";
import type { EnrichedRoutine } from "@/lib/types";
import { gridContainer, gridItem } from "./motion";

export default function SleekRoutines() {
  const [routines, setRoutines] = useState<EnrichedRoutine[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/routines")
      .then((r) => (r.ok ? r.json() : { routines: [] }))
      .then((d) => setRoutines(d.routines ?? []))
      .catch(() => setRoutines([]));
  }, []);

  async function run(id: string) {
    setBusy(id);
    setDone((d) => ({ ...d, [id]: "" }));
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: "POST" });
      const d = await res.json();
      const bits = [`${d.ok ?? 0} done`];
      if (d.failed) bits.push(`${d.failed} failed`);
      if (d.ignoredLocked) bits.push(`${d.ignoredLocked} locked`);
      setDone((s) => ({ ...s, [id]: bits.join(" · ") }));
    } catch {
      setDone((s) => ({ ...s, [id]: "Failed" }));
    } finally {
      setBusy(null);
      setTimeout(() => setDone((s) => ({ ...s, [id]: "" })), 4000);
    }
  }

  if (!routines) return <Center><Loader2 className="animate-spin" /></Center>;
  if (routines.length === 0)
    return <Center><Wand2 size={30} className="mb-2 opacity-60" />No routines yet</Center>;

  return (
    <motion.div variants={gridContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {routines.map((r) => (
        <motion.div key={r.id} variants={gridItem} className="card flex flex-col justify-between gap-4 p-5">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{r.name}</p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {r.actions.length} action{r.actions.length === 1 ? "" : "s"}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => run(r.id)}
            disabled={busy === r.id}
            className="btn-primary w-full justify-center !py-4 text-base"
          >
            {busy === r.id ? <Loader2 size={18} className="animate-spin" /> : done[r.id] ? <Check size={18} /> : <Play size={18} />}
            {done[r.id] || "Run"}
          </motion.button>
        </motion.div>
      ))}
    </motion.div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}
