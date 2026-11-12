"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { rise, stagger } from "../motion";

// Small shared building blocks for Nebula's panels.

export function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-cyan-200/70">
      <Loader2 size={22} className="animate-spin" />
      <span className="nb-mono text-[10px] uppercase">Receiving</span>
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[rgb(var(--nb-hue))]">{icon}</div>
      <p className="text-base font-medium text-white">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <motion.ul variants={stagger} initial="hidden" animate="show" className="space-y-3">
      {children}
    </motion.ul>
  );
}

/** A glass row with an accent edge that lights when `lit`. */
export function Row({ lit, children }: { lit?: boolean; children: ReactNode }) {
  return (
    <motion.li
      variants={rise}
      className={`relative overflow-hidden rounded-[22px] border bg-white/[0.025] p-4 transition-colors ${
        lit ? "border-[rgb(var(--nb-hue)/0.35)]" : "border-white/[0.07]"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${lit ? "bg-[rgb(var(--nb-hue))] shadow-[0_0_12px_rgb(var(--nb-hue))]" : "bg-white/10"}`}
      />
      {children}
    </motion.li>
  );
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "when" | "if" | "then" }) {
  const cls =
    tone === "when"
      ? "border-sky-300/25 bg-sky-300/[0.07] text-sky-200"
      : tone === "if"
        ? "border-violet-300/25 bg-violet-300/[0.07] text-violet-200"
        : tone === "then"
          ? "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-200"
          : "border-white/10 bg-white/[0.03] text-slate-300";
  return <span className={`inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-[11px] ${cls}`}>{children}</span>;
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="nb-mono mr-1 text-[9px] uppercase text-slate-500">{children}</span>;
}
