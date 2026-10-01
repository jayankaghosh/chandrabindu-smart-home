"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Command, Loader2, Play, Plus, Pencil, Trash2, Copy, Check, Globe, Link as LinkIcon } from "lucide-react";
import type { Room, Shortcut } from "@/lib/types";
import { gridContainer, gridItem } from "./motion";
import SleekAutomationBuilder from "./SleekAutomationBuilder";
import { ExportButton, ImportButton, Notice, copyText } from "./ItemTransfer";

// Shortcuts: IF/THEN rules that run only when triggered, by the Run button
// here or (with API access on) by URL with the shortcut token. Anyone can run
// them; admins author them in Edit Mode.
export default function SleekShortcuts({
  rooms = [],
  isAdmin,
  editMode = false,
}: {
  rooms?: Room[];
  isAdmin: boolean;
  editMode?: boolean;
}) {
  const [items, setItems] = useState<Shortcut[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { text: string; ok: boolean } | undefined>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [builder, setBuilder] = useState<{ mode: "new" } | { mode: "edit" | "duplicate"; item: Shortcut } | null>(null);
  const canEdit = isAdmin && editMode;

  const load = useCallback(async () => {
    const res = await fetch("/api/shortcuts");
    setItems(res.ok ? (await res.json()).shortcuts ?? [] : []);
  }, []);

  useEffect(() => {
    load();
    if (isAdmin) {
      fetch("/api/shortcuts/token")
        .then((r) => (r.ok ? r.json() : { token: null }))
        .then((d) => setToken(d.token ?? null))
        .catch(() => {});
    }
  }, [load, isAdmin]);

  function flash(id: string, text: string, ok: boolean) {
    setResult((r) => ({ ...r, [id]: { text, ok } }));
    setTimeout(() => setResult((r) => (r[id]?.text === text ? { ...r, [id]: undefined } : r)), 4500);
  }

  async function run(s: Shortcut) {
    setBusy(s.id);
    try {
      const res = await fetch(`/api/shortcuts/${s.id}/run`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) flash(s.id, d.error || "Failed", false);
      else flash(s.id, d.ran ? d.message : "Conditions not met", d.ran);
    } catch {
      flash(s.id, "Failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function toggleApi(s: Shortcut) {
    setBusy(s.id);
    try {
      await fetch(`/api/shortcuts/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiEnabled: !s.apiEnabled }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function del(s: Shortcut) {
    if (!confirm(`Delete shortcut "${s.name}"?`)) return;
    setBusy(s.id);
    try {
      const res = await fetch(`/api/shortcuts/${s.id}`, { method: "DELETE" });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  const apiUrl = (s: Shortcut) =>
    token ? `${window.location.origin}/api/shortcuts/${s.id}/run?shortcut_token=${encodeURIComponent(token)}` : null;

  async function copyUrl(s: Shortcut) {
    const url = apiUrl(s);
    if (url && (await copyText(url))) {
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 2000);
    }
  }

  if (!items) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setBuilder({ mode: "new" })} className="btn-primary">
            <Plus size={16} />
            New shortcut
          </button>
          <ImportButton
            kind="shortcut"
            onDone={(text, ok) => {
              setNotice({ text, ok });
              if (ok) load();
            }}
          />
        </div>
      )}
      {notice && <Notice text={notice.text} ok={notice.ok} onClose={() => setNotice(null)} />}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-slate-500 dark:text-slate-400">
          <Command size={30} className="mb-2 opacity-60" />
          No shortcuts yet
          <span className="max-w-sm text-sm">
            A shortcut checks its IF when you run it, and only then does its THEN. Run it here or from a URL, e.g. an
            iPhone Shortcut when you get home.
          </span>
        </div>
      ) : (
        <motion.div variants={gridContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            const r = result[s.id];
            return (
              <motion.div key={s.id} variants={gridItem} className="card flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{s.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {s.conditions.length === 0
                        ? "Always"
                        : `If ${s.match === "all" ? "all" : "any"} of ${s.conditions.length} condition${s.conditions.length === 1 ? "" : "s"}`}
                      {" · "}
                      {s.actions.length} action{s.actions.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {s.apiEnabled && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                      <Globe size={12} /> API
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => run(s)}
                    disabled={busy === s.id}
                    className="btn-primary flex-1 justify-center !py-4 text-base"
                  >
                    {busy === s.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : r ? (
                      r.ok ? <Check size={18} /> : null
                    ) : (
                      <Play size={18} />
                    )}
                    {r ? r.text : "Run"}
                  </motion.button>
                  {canEdit && (
                    <>
                      <button onClick={() => setBuilder({ mode: "edit", item: s })} aria-label={`Edit ${s.name}`} className="icon-btn h-12 w-12">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => setBuilder({ mode: "duplicate", item: s })} aria-label={`Duplicate ${s.name}`} title="Duplicate" className="icon-btn h-12 w-12">
                        <Copy size={16} />
                      </button>
                      <ExportButton kind="shortcut" id={s.id} name={s.name} />
                      <button onClick={() => del(s)} aria-label={`Delete ${s.name}`} className="icon-btn h-12 w-12 text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>

                {canEdit && (
                  <div className="space-y-2 rounded-2xl bg-white/40 p-3 text-sm dark:bg-white/[0.05]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Accessible via API</span>
                      <button
                        onClick={() => toggleApi(s)}
                        disabled={busy === s.id}
                        role="switch"
                        aria-checked={s.apiEnabled}
                        aria-label={`API access for ${s.name}`}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${s.apiEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${s.apiEnabled ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </div>
                    {s.apiEnabled &&
                      (apiUrl(s) ? (
                        <button
                          onClick={() => copyUrl(s)}
                          className="flex w-full items-center gap-2 rounded-xl bg-black/[0.04] px-3 py-2 text-left font-mono text-xs text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"
                          title="Copy the run URL"
                        >
                          {copied === s.id ? <Check size={13} className="shrink-0 text-emerald-500" /> : <LinkIcon size={13} className="shrink-0" />}
                          <span className="truncate">{copied === s.id ? "Copied" : apiUrl(s)}</span>
                        </button>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Set a shortcut token in Settings → Shortcut API first.</p>
                      ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {builder && (
        <SleekAutomationBuilder
          mode="shortcut"
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
