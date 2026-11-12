"use client";

import type { LucideIcon } from "lucide-react";
import { HUES, cssHue } from "./fx";

/** A room's colour: warm when things are on, cool when idle, rose when locked. */
export function roomHue(on: number, locked: boolean): [number, number, number] {
  if (locked) return HUES.lock;
  return on > 0 ? HUES.light : HUES.fan;
}

// A room drawn as a planet: a lit sphere with an atmosphere that brightens
// with the share of things on, and a tilted ring that spins while anything is
// on. Pure visual; the caller makes it interactive.
export default function Planet({
  size,
  hue,
  frac,
  icon: Icon,
  ringed,
}: {
  size: number;
  hue: [number, number, number];
  /** Share of the room's switches on (0..1). */
  frac: number;
  icon: LucideIcon;
  ringed?: boolean;
}) {
  const glow = 0.25 + frac * 0.75;
  return (
    <span className="relative block" style={{ width: size, height: size, ["--nb-hue" as string]: cssHue(hue) }}>
      {/* Atmosphere */}
      <span
        aria-hidden
        className="absolute -inset-[30%] rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, rgb(var(--nb-hue) / ${0.35 * glow}), transparent 65%)` }}
      />
      {/* Ring, drawn behind the sphere */}
      {ringed && (
        <span aria-hidden className="absolute inset-0 [transform:rotateX(72deg)_rotateZ(-18deg)]" style={{ transformStyle: "preserve-3d" }}>
          <span className="nb-spin-slow absolute -inset-[42%] rounded-full border-[1.5px] border-dashed" style={{ borderColor: "rgb(var(--nb-hue) / 0.55)" }} />
        </span>
      )}
      {/* Sphere */}
      <span
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,${0.35 + glow * 0.4}), rgb(var(--nb-hue) / ${0.35 + glow * 0.5}) 38%, rgba(30,20,80,0.85) 72%, rgba(4,5,16,0.98))`,
          boxShadow: `inset -${size * 0.12}px -${size * 0.1}px ${size * 0.25}px rgba(0,0,0,0.65), 0 0 ${size * 0.35 * glow}px rgb(var(--nb-hue) / ${0.45 * glow})`,
        }}
      >
        <span className="nb-sheen absolute inset-0 rounded-full opacity-60" />
      </span>
      <span className="absolute inset-0 flex items-center justify-center text-white/90 drop-shadow-[0_0_8px_rgba(0,0,0,0.6)]">
        <Icon size={Math.round(size * 0.34)} />
      </span>
    </span>
  );
}
