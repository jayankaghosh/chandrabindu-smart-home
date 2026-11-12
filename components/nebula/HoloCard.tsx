"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { emitPulse, haptic, sfx } from "./fx";

/** "r g b" (0-255) from a 0..1 RGB triplet, for the --nb-hue CSS variable. */
export function cssHue(h: [number, number, number]): string {
  return h.map((v) => Math.round(v * 255)).join(" ");
}

// Mouse-precise devices get the 3D tilt; touch devices skip it (a tilt that
// follows a finger feels like lag) but keep the spotlight and press.
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    try {
      setFine(window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      /* ignore */
    }
  }, []);
  return fine;
}

// A holographic glass card: tilts in 3D towards the pointer, carries a
// cursor-tracked spotlight and a running light round its border, and sends a
// shockwave through the sky when pressed.
export default function HoloCard({
  hue,
  onClick,
  children,
  className = "",
  lit = true,
  ariaLabel,
  sound = "nav",
}: {
  hue: [number, number, number];
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  /** Show the running border light (off for quieter cards). */
  lit?: boolean;
  ariaLabel?: string;
  sound?: "nav" | "on" | "off" | null;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const fine = useFinePointer();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 18 });
  const sry = useSpring(ry, { stiffness: 220, damping: 18 });

  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--spot", "1");
    if (fine) {
      ry.set(((x / r.width) - 0.5) * 14);
      rx.set(-((y / r.height) - 0.5) * 14);
    }
  }
  function leave() {
    ref.current?.style.setProperty("--spot", "0");
    rx.set(0);
    ry.set(0);
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      onPointerMove={move}
      onPointerLeave={leave}
      onClick={(e) => {
        const r = ref.current?.getBoundingClientRect();
        const x = e.clientX || (r ? r.left + r.width / 2 : 0);
        const y = e.clientY || (r ? r.top + r.height / 2 : 0);
        emitPulse(x, y, hue, 0.8);
        if (sound) sfx(sound);
        haptic(8);
        onClick?.();
      }}
      whileTap={{ scale: 0.965 }}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900, ["--nb-hue" as string]: cssHue(hue) }}
      className={`nb-spot group relative overflow-hidden rounded-[26px] border border-white/[0.08] bg-[rgba(8,10,28,0.55)] text-left shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_30px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-[border-color,box-shadow] duration-300 hover:border-white/[0.16] hover:shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_30px_70px_-28px_rgb(var(--nb-hue)/0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
        lit ? "nb-border nb-border-idle" : ""
      } ${className}`}
    >
      <span className="relative z-[2] block h-full [transform:translateZ(24px)]">{children}</span>
    </motion.button>
  );
}
