"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Power, PowerOff, Zap, X, Loader2 } from "lucide-react";

// A persistent floating control (bottom-left, opposite the Assistant) that turns
// every switch on or off at once. Both actions confirm first; master-off leaves
// protected controls on (enforced server-side in /api/master).
export default function SleekMasterControl({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | boolean>(null); // true=all on, false=all off
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run(on: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed");
      setResult(`${on ? "Turned on" : "Turned off"} ${d.ok} switch${d.ok === 1 ? "" : "es"}${d.skippedProtected ? ` · ${d.skippedProtected} protected kept` : ""}`);
      onDone();
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
      setOpen(false);
      setTimeout(() => setResult(null), 3500);
    }
  }

  return (
    <>
      {/* Floating trigger + expandable menu (bottom-left). */}
      <div className="fixed bottom-6 left-6 z-40 flex flex-col items-start gap-2">
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="flex flex-col gap-2"
            >
              <button
                onClick={() => setConfirm(true)}
                className="flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white shadow-lg"
              >
                <Power size={18} /> All On
              </button>
              <button
                onClick={() => setConfirm(false)}
                className="flex items-center gap-2 rounded-2xl bg-slate-700 px-4 py-3 font-semibold text-white shadow-lg dark:bg-slate-600"
              >
                <PowerOff size={18} /> All Off
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setOpen((v) => !v)}
          aria-label="Master on/off"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-400 text-white shadow-xl"
        >
          {open ? <X size={22} /> : <Zap size={22} />}
        </motion.button>
      </div>

      {/* Toast-ish result */}
      {result && (
        <div className="fixed bottom-24 left-6 z-40 max-w-xs rounded-2xl bg-slate-900/90 px-4 py-2.5 text-sm text-white shadow-lg backdrop-blur">
          {result}
        </div>
      )}

      {/* Confirm dialog */}
      {confirm !== null && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-sm" onClick={() => !busy && setConfirm(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${confirm ? "bg-emerald-500/15 text-emerald-500" : "bg-slate-500/15 text-slate-500"}`}>
              {confirm ? <Power size={26} /> : <PowerOff size={26} />}
            </div>
            <h2 className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {confirm ? "Turn everything on?" : "Turn everything off?"}
            </h2>
            <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
              {confirm
                ? "Every switch in every unlocked room will turn on."
                : "Every switch will turn off. Protected controls stay on."}
            </p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setConfirm(null)} disabled={busy} className="btn-ghost">
                Cancel
              </button>
              <button onClick={() => run(confirm)} disabled={busy} className="btn-primary">
                {busy ? <Loader2 size={15} className="animate-spin" /> : confirm ? <Power size={15} /> : <PowerOff size={15} />}
                {confirm ? "Turn all on" : "Turn all off"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
