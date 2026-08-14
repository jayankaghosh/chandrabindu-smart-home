"use client";

import { motion } from "framer-motion";
import { ShieldAlert, Power, X } from "lucide-react";

// A protected control that is currently off. Structurally shared by both the
// Sleek data hook (useHomeData.ProtectedControl) and the Classic Dashboard's
// protected state, so both themes can pass their items straight in.
export interface ProtectedAlertItem {
  deviceId: string;
  code: string;
  deviceName: string;
  controlName: string;
}

// Intrusive popup shown on load when any protected control is OFF. Each can be
// turned on right here, or the whole thing dismissed until the next load. Used
// by both themes (Classic Dashboard + Sleek). The gateway also auto-restores
// protected controls when it's running; this popup is the notification + the
// manual fallback for when the gateway is down.
export default function ProtectedAlert({
  items,
  onTurnOn,
  onDismiss,
}: {
  items: ProtectedAlertItem[];
  onTurnOn: (deviceId: string, code: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        className="card w-full max-w-md overflow-hidden p-6"
      >
        <div className="mb-2 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500 dark:bg-white/10 dark:text-rose-300">
            <ShieldAlert size={26} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Protected control{items.length > 1 ? "s" : ""} off
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">These should stay on.</p>
          </div>
        </div>

        <ul className="my-4 max-h-72 space-y-2 overflow-y-auto">
          {items.map((c) => (
            <li
              key={`${c.deviceId}:${c.code}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/50 bg-white/40 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.05]"
            >
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{c.controlName}</span>
                <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{c.deviceName}</span>
              </span>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => onTurnOn(c.deviceId, c.code)}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-md active:scale-95"
              >
                <Power size={15} />
                Turn on
              </motion.button>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onDismiss} className="btn-ghost">
            <X size={15} />
            Not now
          </button>
          <button
            onClick={() => items.forEach((c) => onTurnOn(c.deviceId, c.code))}
            className="btn-primary"
          >
            <Power size={15} />
            Turn all on
          </button>
        </div>
      </motion.div>
    </div>
  );
}
