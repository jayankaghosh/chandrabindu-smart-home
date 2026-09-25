"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock, LockOpen, Loader2, ShieldAlert } from "lucide-react";

interface LockInfo {
  at: number;
  reason?: string;
  deviceId?: string;
  code?: string;
}

// The app-wide safety-lock overlay. Non-dismissible: when the loop guard trips,
// every client shows "APP IS LOCKED". Admins get an Unlock button; others just
// see the message.
//
// Preferred: the parent passes `locked`/`info` (Sleek drives these from the SSE
// stream via useHomeData — no polling). When they're omitted (e.g. Classic), it
// falls back to a slow 20s poll of /api/lock so it still works.
export default function LockedOverlay({
  isAdmin,
  locked: lockedProp,
  info: infoProp,
  onUnlocked,
}: {
  isAdmin: boolean;
  locked?: boolean;
  info?: LockInfo | null;
  onUnlocked?: () => void;
}) {
  const controlled = lockedProp !== undefined;
  const [polled, setPolled] = useState<{ locked: boolean; info?: LockInfo | null }>({ locked: false });
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (controlled) return; // parent supplies state via SSE — don't poll
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/lock");
        if (res.ok && !stop) setPolled(await res.json());
      } catch {
        /* keep last state */
      }
    };
    poll();
    const t = setInterval(poll, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [controlled]);

  const state = controlled ? { locked: !!lockedProp, info: infoProp } : polled;

  async function unlock() {
    setUnlocking(true);
    setError(null);
    try {
      const res = await fetch("/api/lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: false }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't unlock");
      if (controlled) onUnlocked?.();
      else setPolled({ locked: !!d.locked, info: d.info });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUnlocking(false);
    }
  }

  if (!state.locked) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/70 p-6 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="card w-full max-w-md p-7 text-center"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-500">
          <Lock size={32} />
        </div>
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">APP IS LOCKED</h1>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          A runaway switch loop was detected and all control has been halted to protect your devices.
        </p>
        {state.info?.reason && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-700 dark:text-amber-300">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>{state.info.reason}</span>
          </div>
        )}

        {isAdmin ? (
          <>
            <button
              onClick={unlock}
              disabled={unlocking}
              className="btn-primary w-full justify-center !py-3.5 text-base"
            >
              {unlocking ? <Loader2 size={18} className="animate-spin" /> : <LockOpen size={18} />}
              Unlock
            </button>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </>
        ) : (
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Ask an administrator to unlock the app.
          </p>
        )}
      </motion.div>
    </div>
  );
}
