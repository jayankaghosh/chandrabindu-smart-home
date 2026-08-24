"use client";

import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Clock } from "lucide-react";

// Intrusive one-time notice shown to non-admin users still on the Classic theme,
// nudging them to the Sleek theme (Classic is being phased out). "Switch to
// Sleek" changes the theme; "Remind me in 7 days" snoozes it. The caller owns
// the show/snooze logic (localStorage) and the theme switch.
export default function ClassicDeprecationNotice({
  onSwitch,
  onRemind,
}: {
  onSwitch: () => void;
  onRemind: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
        className="card w-full max-w-md overflow-hidden p-6"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-400 text-white shadow-md">
            <Sparkles size={26} />
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Meet the new Sleek theme
          </h2>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          The Classic dashboard is being retired in favour of <span className="font-semibold text-slate-900 dark:text-slate-100">Sleek</span> —
          our new modern experience: bigger buttons, guided navigation, and a
          smoother feel on phones, tablets and wall panels. Would you like to
          switch now? You can always change back in Settings.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button onClick={onRemind} className="btn-ghost justify-center">
            <Clock size={15} />
            Remind me in 7 days
          </button>
          <button onClick={onSwitch} className="btn-primary justify-center">
            <ArrowRight size={15} />
            Switch to Sleek
          </button>
        </div>
      </motion.div>
    </div>
  );
}
