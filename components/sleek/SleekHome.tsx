"use client";

import { motion } from "framer-motion";
import { Star, LayoutGrid, Play, Zap, Sparkles, Lightbulb, WifiOff, Mic } from "lucide-react";
import NavTile from "./NavTile";
import { gridContainer } from "./motion";

export type Section = "favourites" | "rooms" | "routines" | "automations" | "insights" | "voice";

const SECTIONS: { key: Section; title: string; subtitle: string; icon: any; accent: string }[] = [
  { key: "favourites", title: "Favourites", subtitle: "Your starred switches", icon: Star, accent: "from-amber-400 to-orange-500" },
  { key: "rooms", title: "Rooms", subtitle: "Browse by room", icon: LayoutGrid, accent: "from-brand-500 to-brand-400" },
  { key: "routines", title: "Routines", subtitle: "Run a scene", icon: Play, accent: "from-fuchsia-500 to-pink-500" },
  { key: "automations", title: "Automations", subtitle: "If this, then that", icon: Zap, accent: "from-emerald-400 to-teal-500" },
  { key: "insights", title: "Insights", subtitle: "Your home at a glance", icon: Sparkles, accent: "from-sky-400 to-cyan-500" },
  { key: "voice", title: "Voice", subtitle: "Talk to your home", icon: Mic, accent: "from-violet-500 to-purple-600" },
];

export default function SleekHome({
  onCount,
  offline,
  onOpen,
}: {
  onCount: number;
  offline: number;
  onOpen: (s: Section) => void;
}) {
  return (
    <div>
      {/* Glanceable status strip */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/50 px-3.5 py-1.5 text-sm font-medium text-slate-700 backdrop-blur-xl dark:bg-white/[0.06] dark:text-slate-200">
          <Lightbulb size={15} className={onCount > 0 ? "text-amber-500" : "text-slate-400"} />
          {onCount} on
        </span>
        {offline > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3.5 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
            <WifiOff size={15} />
            {offline} offline
          </span>
        )}
      </div>

      <motion.div
        variants={gridContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {SECTIONS.map((s) => (
          <NavTile
            key={s.key}
            icon={s.icon}
            title={s.title}
            subtitle={s.subtitle}
            accent={s.accent}
            onClick={() => onOpen(s.key)}
          />
        ))}
      </motion.div>
    </div>
  );
}
