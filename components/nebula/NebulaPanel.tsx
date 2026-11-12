"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import ScrambleText from "./ScrambleText";
import { sfx } from "./fx";

// A holographic window over the scene (right side on desktop, a full sheet on
// phones). Swings in on a hinge. The glass blur sits on a background layer,
// not on an ancestor of the content: backdrop-filter would otherwise trap the
// fixed-position editors (builders, sheets) that panels open.
export default function NebulaPanel({
  title,
  icon: Icon,
  hue,
  wide,
  tabs,
  onClose,
  children,
}: {
  title: string;
  icon: LucideIcon;
  /** "r g b" accent. */
  hue: string;
  wide?: boolean;
  tabs?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <motion.section
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, x: 80, rotateY: -14 }}
      animate={{ opacity: 1, x: 0, rotateY: 0 }}
      exit={{ opacity: 0, x: 80, rotateY: -10 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      // No transformPerspective: at rest the transform must be "none", or it
      // would become the containing block for the editors' fixed overlays.
      style={{ transformOrigin: "100% 50%", ["--nb-hue" as string]: hue }}
      className={`fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col sm:inset-x-auto sm:bottom-[104px] sm:right-4 sm:top-[84px] ${
        wide ? "sm:w-[min(1000px,calc(100vw-32px))]" : "sm:w-[min(580px,calc(100vw-32px))]"
      }`}
    >
      <div aria-hidden className="absolute inset-0 rounded-t-[30px] border border-white/[0.09] bg-[rgba(6,8,22,0.78)] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.95),0_0_0_1px_rgb(var(--nb-hue)/0.06)] backdrop-blur-2xl sm:rounded-[30px]" />
      {/* HUD corner brackets */}
      <span aria-hidden className="pointer-events-none absolute left-3 top-3 h-4 w-4 rounded-tl-lg border-l-2 border-t-2 border-[rgb(var(--nb-hue)/0.7)]" />
      <span aria-hidden className="pointer-events-none absolute right-3 top-3 h-4 w-4 rounded-tr-lg border-r-2 border-t-2 border-[rgb(var(--nb-hue)/0.7)]" />
      <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 hidden h-4 w-4 rounded-bl-lg border-b-2 border-l-2 border-[rgb(var(--nb-hue)/0.4)] sm:block" />
      <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 hidden h-4 w-4 rounded-br-lg border-b-2 border-r-2 border-[rgb(var(--nb-hue)/0.4)] sm:block" />

      <header className="relative flex items-center justify-between gap-3 px-6 pb-3 pt-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--nb-hue)/0.14)] text-[rgb(var(--nb-hue))]"
            style={{ boxShadow: "0 0 24px -6px rgb(var(--nb-hue) / 0.8)" }}
          >
            <Icon size={19} />
          </span>
          <h2 className="truncate text-2xl font-semibold tracking-tight text-white">
            <ScrambleText text={title} duration={450} />
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {tabs}
          <button
            onClick={() => {
              sfx("back");
              onClose();
            }}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-400 transition hover:border-white/30 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      </header>
      <div className="relative mx-6 h-px overflow-hidden bg-gradient-to-r from-[rgb(var(--nb-hue)/0.5)] via-white/10 to-transparent">
        <span className="nb-scan absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-5">{children}</div>
    </motion.section>
  );
}

/** Live / Manage switch shown in a panel header for admins in Edit Mode. */
export function ManageTabs({ manage, onChange }: { manage: boolean; onChange: (m: boolean) => void }) {
  return (
    <div className="nb-mono flex rounded-full border border-white/10 bg-black/30 p-0.5 text-[10px] uppercase">
      {(["Live", "Manage"] as const).map((t) => {
        const on = (t === "Manage") === manage;
        return (
          <button
            key={t}
            onClick={() => onChange(t === "Manage")}
            className={`relative rounded-full px-3 py-1.5 transition-colors ${on ? "text-slate-950" : "text-slate-400 hover:text-white"}`}
          >
            {on && <motion.span layoutId="nb-manage-tab" className="absolute inset-0 rounded-full bg-[rgb(var(--nb-hue))]" />}
            <span className="relative">{t}</span>
          </button>
        );
      })}
    </div>
  );
}
