"use client";

import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { gridItem } from "./motion";

// A big, touch-friendly navigation button — used for the home sections and the
// room list. Icon-forward with an optional badge (e.g. "6 on") and subtitle.
export default function NavTile({
  icon: Icon,
  title,
  subtitle,
  badge,
  accent = "from-brand-500 to-brand-400",
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: string;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      variants={gridItem}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="card group flex min-h-[132px] w-full flex-col justify-between p-5 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/60"
    >
      <div className="flex items-start justify-between">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg dark:from-white dark:to-white dark:text-slate-900`}
        >
          <Icon size={26} />
        </span>
        {badge ? (
          <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-white/10 dark:text-white">
            {badge}
          </span>
        ) : (
          <ChevronRight size={22} className="text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
        )}
      </div>
      <div>
        <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
    </motion.button>
  );
}
