"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

const TICKS = 72;

// The home "reactor": a breathing orb inside rotating rings. The tick ring and
// arc fill with the share of switches on; the orb burns brighter as the house
// wakes up. The centre counter rolls to the live on-count.
export default function EnergyCore({ on, total, live }: { on: number; total: number; live: boolean }) {
  const frac = total > 0 ? Math.min(1, on / total) : 0;
  const count = useMotionValue(on);
  const shown = useTransform(count, (v) => Math.round(v).toString());
  useEffect(() => {
    const c = animate(count, on, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [on, count]);

  const lit = Math.round(frac * TICKS);
  const glow = 0.25 + frac * 0.75;

  return (
    <div className="relative mx-auto aspect-square w-[min(78vw,300px)]">
      {/* Halo */}
      <div
        className="nb-breathe absolute inset-[8%] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, rgba(34,211,238,${0.35 * glow}), rgba(168,85,247,${0.3 * glow}) 45%, transparent 70%)` }}
      />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="nb-arc" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="200">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        {/* Outer dashed ring, slow spin */}
        <g className="nb-spin-slow" style={{ transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(148,163,255,0.25)" strokeWidth="0.6" strokeDasharray="2 6" />
          <circle cx="100" cy="4" r="1.6" fill="#22d3ee" />
        </g>
        {/* Tick ring: lit share = switches on */}
        <g>
          {Array.from({ length: TICKS }).map((_, i) => {
            const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
            const r1 = 84;
            const r2 = i % 6 === 0 ? 76 : 79;
            const isLit = i < lit;
            return (
              <line
                key={i}
                x1={100 + Math.cos(a) * r1}
                y1={100 + Math.sin(a) * r1}
                x2={100 + Math.cos(a) * r2}
                y2={100 + Math.sin(a) * r2}
                stroke={isLit ? "url(#nb-arc)" : "rgba(148,163,255,0.18)"}
                strokeWidth={isLit ? 1.6 : 1}
                strokeLinecap="round"
                style={{ transition: `stroke 0.4s ${i * 6}ms` }}
              />
            );
          })}
        </g>
        {/* Progress arc */}
        <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(148,163,255,0.08)" strokeWidth="2" />
        <motion.circle
          cx="100"
          cy="100"
          r="70"
          fill="none"
          stroke="url(#nb-arc)"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform="rotate(-90 100 100)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: frac }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: "drop-shadow(0 0 4px rgba(168,85,247,0.9))" }}
        />
        {/* Counter-rotating inner ring */}
        <g className="nb-spin-rev" style={{ transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r="62" fill="none" stroke="rgba(34,211,238,0.35)" strokeWidth="0.6" strokeDasharray="30 12 4 12" />
        </g>
      </svg>
      {/* Orb */}
      <div className="absolute inset-[29%] overflow-hidden rounded-full">
        <div
          className="nb-breathe absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,${0.35 + glow * 0.4}), rgba(34,211,238,${0.25 + glow * 0.5}) 30%, rgba(124,58,237,${0.35 + glow * 0.4}) 62%, rgba(10,8,40,0.9) 100%)`,
            boxShadow: `0 0 ${30 + glow * 60}px rgba(34,211,238,${0.3 + glow * 0.4}), inset 0 0 30px rgba(255,255,255,0.15)`,
          }}
        />
        <div className="nb-sheen absolute inset-0 rounded-full" />
      </div>
      {/* Readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.span className="text-5xl font-semibold tabular-nums tracking-tight text-white drop-shadow-[0_0_18px_rgba(34,211,238,0.8)]">
          {shown}
        </motion.span>
        <span className="nb-mono mt-0.5 text-[10px] uppercase text-cyan-100/80">of {total} active</span>
      </div>
      {/* Link state */}
      <div className="nb-mono absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] uppercase text-slate-300 backdrop-blur">
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "nb-blink bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"}`} />
        {live ? "Live link" : "Polling"}
      </div>
    </div>
  );
}
