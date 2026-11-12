"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { Star, Play, Zap, Command, Link2, BarChart3, Sparkles, Mic, Moon, Monitor, Search, type LucideIcon } from "lucide-react";
import { sfx } from "./fx";

export type PanelKind = "favourites" | "routines" | "automations" | "shortcuts" | "switchGroups" | "usage" | "insights" | "voice" | "screensaver";
export type DockKey = PanelKind | "goodnight" | "search";

export const DOCK: { key: DockKey; label: string; icon: LucideIcon; hue: string }[] = [
  { key: "favourites", label: "Favourites", icon: Star, hue: "250 191 36" },
  { key: "routines", label: "Routines", icon: Play, hue: "236 72 153" },
  { key: "automations", label: "Automations", icon: Zap, hue: "52 211 153" },
  { key: "shortcuts", label: "Shortcuts", icon: Command, hue: "96 165 250" },
  { key: "switchGroups", label: "Switch Groups", icon: Link2, hue: "167 139 250" },
  { key: "usage", label: "Usage", icon: BarChart3, hue: "251 113 133" },
  { key: "insights", label: "Insights", icon: Sparkles, hue: "34 211 238" },
  { key: "voice", label: "Voice", icon: Mic, hue: "192 132 252" },
  { key: "goodnight", label: "Goodnight", icon: Moon, hue: "129 140 248" },
  { key: "screensaver", label: "Screensaver", icon: Monitor, hue: "148 163 184" },
  { key: "search", label: "Command", icon: Search, hue: "226 232 240" },
];

export function dockItem(key: DockKey) {
  return DOCK.find((d) => d.key === key)!;
}

// The system dock: every non-room feature lives here and opens over the scene.
// With a mouse, icons swell as the pointer passes (fisheye); on touch it is a
// plain swipeable row. The open panel's icon carries a lit dot.
export default function Dock({ active, onPick }: { active: DockKey | null; onPick: (k: DockKey) => void }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-[96px] sm:px-4">
      <motion.nav
        aria-label="Systems"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 22, delay: 0.25 }}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="pointer-events-auto flex max-w-full items-end gap-1.5 overflow-x-auto rounded-[26px] border border-white/[0.08] bg-[rgba(6,8,22,0.6)] px-2.5 pb-2 pt-2 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl [scrollbar-width:none] sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {DOCK.map((d, i) => (
          <DockIcon key={d.key} item={d} mouseX={mouseX} active={active === d.key} divider={d.key === "search"} index={i} onPick={onPick} />
        ))}
      </motion.nav>
    </div>
  );
}

function DockIcon({
  item,
  mouseX,
  active,
  divider,
  onPick,
}: {
  item: (typeof DOCK)[number];
  mouseX: MotionValue<number>;
  active: boolean;
  divider: boolean;
  index: number;
  onPick: (k: DockKey) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const dist = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const sizeRaw = useTransform(dist, [-160, 0, 160], [46, 70, 46], { clamp: true });
  const size = useSpring(sizeRaw, { stiffness: 380, damping: 26, mass: 0.4 });
  const Icon = item.icon;
  return (
    <>
      {divider && <span aria-hidden className="mx-1 mb-2 h-9 w-px shrink-0 self-center bg-white/10" />}
      <motion.button
        ref={ref}
        type="button"
        aria-label={item.label}
        aria-pressed={active}
        onClick={() => {
          sfx("nav");
          onPick(item.key);
        }}
        style={{ width: size, height: size, ["--nb-hue" as string]: item.hue }}
        whileTap={{ scale: 0.86 }}
        className="group relative flex shrink-0 items-center justify-center rounded-[18px] border border-white/[0.07] bg-[radial-gradient(circle_at_35%_25%,rgba(255,255,255,0.12),rgba(14,16,40,0.85))] text-[rgb(var(--nb-hue))] transition-[border-color,box-shadow] hover:border-[rgb(var(--nb-hue)/0.5)] hover:shadow-[0_0_24px_-4px_rgb(var(--nb-hue)/0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
      >
        <Icon className="h-[42%] w-[42%]" />
        <span className="nb-mono pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[rgba(4,5,16,0.92)] px-2 py-1 text-[10px] uppercase text-slate-200 opacity-0 transition-opacity group-hover:opacity-100 sm:block">
          {item.label}
        </span>
        {active && <span className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-[rgb(var(--nb-hue))] shadow-[0_0_8px_rgb(var(--nb-hue))]" />}
      </motion.button>
    </>
  );
}
