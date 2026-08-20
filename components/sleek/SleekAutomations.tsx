"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Zap, Loader2, Power, ArrowRight, Plus, Pencil, Trash2 } from "lucide-react";
import type { Automation, Room } from "@/lib/types";
import { gridContainer, gridItem } from "./motion";
import SleekAutomationBuilder from "./SleekAutomationBuilder";

// View + enable/disable for everyone (admin acts); create/edit/delete in Edit Mode.
export default function SleekAutomations({
  rooms = [],
  isAdmin,
  editMode = false,
}: {
  rooms?: Room[];
  isAdmin: boolean;
  editMode?: boolean;
}) {
  const [items, setItems] = useState<Automation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [builder, setBuilder] = useState<"new" | Automation | null>(null);
  const canEdit = isAdmin && editMode;

  const load = useCallback(async () => {
    const res = await fetch("/api/automations");
    if (res.ok) setItems((await res.json()).automations ?? []);
    else setItems([]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Automation) {
    if (!isAdmin) return;
    setBusy(a.id);
    try {
      await fetch(`/api/automations/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function del(a: Automation) {
    if (!confirm(`Delete automation "${a.name}"?`)) return;
    setBusy(a.id);
    try {
      const res = await fetch(`/api/automations/${a.id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  if (!items) return <Center><Loader2 className="animate-spin" /></Center>;

  return (
    <div className="space-y-4">
      {canEdit && (
        <button onClick={() => setBuilder("new")} className="btn-primary">
          <Plus size={16} />
          New automation
        </button>
      )}

      {items.length === 0 ? (
        <Center><Zap size={30} className="mb-2 opacity-60" />No automations yet</Center>
      ) : (
        <motion.div variants={gridContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <motion.div key={a.id} variants={gridItem} className={`card flex flex-col gap-3 p-5 ${a.enabled ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{a.name}</p>
                  <p className="text-xs font-medium text-slate-400 dark:text-slate-500">{a.enabled ? "Active" : "Disabled"}</p>
                </div>
                <button
                  onClick={() => toggle(a)}
                  disabled={!isAdmin || busy === a.id}
                  title={isAdmin ? (a.enabled ? "Disable" : "Enable") : "Admin only"}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors disabled:opacity-40 ${
                    a.enabled ? "bg-emerald-500/15 text-emerald-600 dark:bg-white/10 dark:text-emerald-300" : "bg-slate-200/70 text-slate-500 dark:bg-white/10"
                  }`}
                >
                  {busy === a.id ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                </button>
              </div>
              <div className="rounded-2xl bg-white/40 p-3 text-sm dark:bg-white/[0.05]">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-slate-300">
                  If {a.match === "all" ? "all match" : "any match"}
                </p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">{a.conditions.length} condition{a.conditions.length === 1 ? "" : "s"}</p>
                <div className="my-1.5 text-slate-300 dark:text-slate-600"><ArrowRight size={14} /></div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Then</p>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">{a.actions.length} action{a.actions.length === 1 ? "" : "s"}</p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setBuilder(a)} className="btn-ghost flex-1 justify-center">
                    <Pencil size={15} />
                    Edit
                  </button>
                  <button onClick={() => del(a)} aria-label={`Delete ${a.name}`} className="icon-btn h-10 w-10 text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {builder && (
        <SleekAutomationBuilder
          rooms={rooms}
          initial={builder === "new" ? undefined : builder}
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
  return <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500 dark:text-slate-400">{children}</div>;
}
