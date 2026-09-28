"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, PlugZap, Ban } from "lucide-react";
import type { Room } from "@/lib/types";
import { isChildLock } from "@/lib/panelLock";

// Non-dismissible setup gate. The app will not operate until an admin has named
// the lifeline switch that powers the internet / router / hub (or declared that
// the main switch is not smart). A normal user only sees "contact your admin".
export default function SuperProtectedGate({
  isAdmin,
  configured,
  rooms,
  onConfigured,
}: {
  isAdmin: boolean;
  /** undefined while loading (don't gate); false = show the gate; true = hidden. */
  configured: boolean | undefined;
  rooms: Room[];
  onConfigured: () => void;
}) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every Boolean (on/off) control across controllable devices, as pick options.
  const options = useMemo(() => {
    const out: { key: string; deviceId: string; code: string; label: string }[] = [];
    for (const room of rooms) {
      for (const d of room.devices) {
        if (d.bluetooth) continue;
        for (const f of d.functions) {
          if (f.type !== "Boolean" || isChildLock(f.code)) continue;
          out.push({
            key: `${d.id}::${f.code}`,
            deviceId: d.id,
            code: f.code,
            label: `${room.name} · ${d.name} · ${f.name}`,
          });
        }
      }
    }
    return out;
  }, [rooms]);

  if (configured !== false) return null;

  async function save(body: { none: true } | { deviceId: string; code: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/super-protected", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save");
      onConfigured();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveChoice() {
    const opt = options.find((o) => o.key === choice);
    if (!opt) {
      setError("Choose a switch first, or select that your main switch is not smart.");
      return;
    }
    save({ deviceId: opt.deviceId, code: opt.code });
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/70 p-6 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="card w-full max-w-md p-7 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-500">
          <PlugZap size={32} />
        </div>

        {!isAdmin ? (
          <>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Setup incomplete
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This home hasn&apos;t been fully set up yet. Please contact your administrator.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Choose the main power switch
            </h1>
            <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">
              Select the switch that powers your internet, router and this hub. It will be locked
              so it can never be turned off by accident. The app can&apos;t run until this is set.
            </p>

            <div className="text-left">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Lifeline switch
              </label>
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                disabled={busy}
                className="field mb-3 w-full"
              >
                <option value="">
                  {options.length ? "Select a switch…" : "No on/off switches found"}
                </option>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={saveChoice}
              disabled={busy || !choice}
              className="btn-primary w-full justify-center !py-3.5 text-base"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              Set as main switch
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
              or
              <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
            </div>

            <button
              onClick={() => save({ none: true })}
              disabled={busy}
              className="btn-ghost w-full justify-center"
            >
              <Ban size={15} /> My main switch isn&apos;t a smart switch
            </button>

            <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
              You can change this later in Settings.
            </p>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </>
        )}
      </motion.div>
    </div>
  );
}
