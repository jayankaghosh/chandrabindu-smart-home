"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, Check, Wand2, Plus, Pencil, Trash2, Copy } from "lucide-react";
import type { EnrichedRoutine, Room } from "@/lib/types";
import { gridContainer, gridItem } from "./motion";
import SleekRoutineBuilder from "./SleekRoutineBuilder";
import { ExportButton, ImportButton, Notice } from "./ItemTransfer";

export default function SleekRoutines({
  rooms = [],
  isAdmin = false,
  editMode = false,
}: {
  rooms?: Room[];
  isAdmin?: boolean;
  editMode?: boolean;
} = {}) {
  const [routines, setRoutines] = useState<EnrichedRoutine[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  // Builder modal: new, edit an existing routine, or duplicate one into a new.
  const [builder, setBuilder] = useState<
    { mode: "new" } | { mode: "edit" | "duplicate"; item: EnrichedRoutine } | null
  >(null);
  const canEdit = isAdmin && editMode;
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    fetch("/api/routines")
      .then((r) => (r.ok ? r.json() : { routines: [] }))
      .then((d) => setRoutines(d.routines ?? []))
      .catch(() => setRoutines([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

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

  async function del(r: EnrichedRoutine) {
    if (!confirm(`Delete routine "${r.name}"?`)) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/routines/${r.id}`, { method: "DELETE" });
      if (res.ok) load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  if (!routines) return <Center><Loader2 className="animate-spin" /></Center>;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setBuilder({ mode: "new" })} className="btn-primary">
            <Plus size={16} />
            New routine
          </button>
          <ImportButton
            kind="routine"
            onDone={(text, ok) => {
              setNotice({ text, ok });
              if (ok) load();
            }}
          />
        </div>
      )}
      {notice && <Notice text={notice.text} ok={notice.ok} onClose={() => setNotice(null)} />}

      {routines.length === 0 ? (
        <Center><Wand2 size={30} className="mb-2 opacity-60" />No routines yet</Center>
      ) : (
        <motion.div variants={gridContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routines.map((r) => (
            <motion.div key={r.id} variants={gridItem} className="card flex flex-col justify-between gap-4 p-5">
              <div>
                <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{r.name}</p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {r.actions.length} action{r.actions.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => run(r.id)}
                  disabled={busy === r.id}
                  className="btn-primary flex-1 justify-center !py-4 text-base"
                >
                  {busy === r.id ? <Loader2 size={18} className="animate-spin" /> : done[r.id] ? <Check size={18} /> : <Play size={18} />}
                  {done[r.id] || "Run"}
                </motion.button>
                {canEdit && (
                  <>
                    <button onClick={() => setBuilder({ mode: "edit", item: r })} aria-label={`Edit ${r.name}`} className="icon-btn h-12 w-12">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => setBuilder({ mode: "duplicate", item: r })} aria-label={`Duplicate ${r.name}`} title="Duplicate" className="icon-btn h-12 w-12">
                      <Copy size={16} />
                    </button>
                    <ExportButton kind="routine" id={r.id} name={r.name} />
                    <button onClick={() => del(r)} aria-label={`Delete ${r.name}`} className="icon-btn h-12 w-12 text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {builder && (
        <SleekRoutineBuilder
          rooms={rooms}
          initial={builder.mode === "new" ? undefined : builder.item}
          duplicate={builder.mode === "duplicate"}
          onCancel={() => setBuilder(null)}
          onSaved={() => {
            setBuilder(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}
