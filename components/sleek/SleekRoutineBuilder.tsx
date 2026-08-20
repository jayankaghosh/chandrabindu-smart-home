"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Check, X, Trash2 } from "lucide-react";
import type { EnrichedRoutine, Room } from "@/lib/types";
import { valueLabel } from "./labels";
import SleekActionPicker from "./SleekActionPicker";

interface Draft {
  deviceId: string;
  code: string;
  value: unknown;
  delayMs?: number;
}

// Sleek-native routine builder, shown as a full-screen modal overlay (the same
// robust pattern as the device/room sheets — avoids the screen-transition
// machinery). Create or edit a routine: name + an ordered list of actions
// composed with SleekActionPicker.
export default function SleekRoutineBuilder({
  rooms,
  initial,
  onSaved,
  onCancel,
}: {
  rooms: Room[];
  initial?: EnrichedRoutine;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [actions, setActions] = useState<Draft[]>(
    initial?.actions.map((a) => ({ deviceId: a.deviceId, code: a.code, value: a.value, delayMs: a.delayMs ?? 0 })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(rooms.flatMap((r) => r.devices).map((d) => [d.id, d])), [rooms]);
  const describe = (a: Draft) => {
    const d = byId.get(a.deviceId);
    const f = d?.functions.find((x) => x.code === a.code);
    return {
      deviceName: d?.name ?? "?",
      controlName: f?.name ?? a.code,
      label: f ? valueLabel(f, a.value) : String(a.value),
    };
  };

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the routine a name");
    if (actions.length === 0) return setError("Add at least one action");
    setSaving(true);
    try {
      const url = initial ? `/api/routines/${initial.id}` : "/api/routines";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), actions }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save routine");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="card max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {initial ? "Edit routine" : "New routine"}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Routine name
        </label>
      <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Movie night" className="field mb-5" />

      {actions.length > 0 && (
        <ul className="mb-4 space-y-2">
          {actions.map((a, i) => {
            const l = describe(a);
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/50 px-3.5 py-3 text-sm dark:border-white/10 dark:bg-white/[0.06]"
              >
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                  <span className="text-slate-400 dark:text-slate-500">{l.deviceName}</span> {l.controlName}{" "}
                  <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{l.label}</span>
                  {a.delayMs ? <span className="ml-1 text-xs text-slate-400">· after {a.delayMs}ms</span> : null}
                </span>
                <button
                  onClick={() => setActions((x) => x.filter((_, j) => j !== i))}
                  aria-label="Remove action"
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Add an action</p>
      <SleekActionPicker rooms={rooms} showDelay onAdd={(a) => setActions((x) => [...x, a])} />

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          <X size={15} />
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {initial ? "Save changes" : "Save routine"}
        </button>
        </div>
      </motion.div>
    </div>
  );
}
