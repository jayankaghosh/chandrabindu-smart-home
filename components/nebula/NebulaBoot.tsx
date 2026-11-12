"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { prefersReducedMotion, sfx } from "./fx";

const KEY = "nebula-booted";

// A short boot sequence the first time Nebula opens in a browser tab session:
// rings expand round the logo while status lines type in, then the whole
// overlay dissolves into the sky. Tap anywhere to skip. Sits below the app
// lock and setup gate (z-[85] < z-[90]), so safety screens always win.
export default function NebulaBoot({ houseName, deviceCount }: { houseName: string; deviceCount: number }) {
  const [show, setShow] = useState(false);
  const [line, setLine] = useState(0);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) || prefersReducedMotion()) return;
      sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    }
    setShow(true);
    sfx("boot");
  }, []);

  // The timers live in their own effect: a remount (React's dev double-mount)
  // restarts them instead of losing them after the session flag is set.
  useEffect(() => {
    if (!show) return;
    const timers = [350, 750, 1150].map((ms, i) => window.setTimeout(() => setLine(i + 1), ms));
    timers.push(window.setTimeout(() => setShow(false), 2100));
    return () => timers.forEach(clearTimeout);
  }, [show]);

  const lines = [
    "Linking the local mesh",
    `Syncing ${deviceCount || "all"} devices`,
    `Welcome to ${houseName}`,
  ];

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="boot"
          onClick={() => setShow(false)}
          className="fixed inset-0 z-[85] flex flex-col items-center justify-center bg-[#02030a]"
          exit={{ opacity: 0, scale: 1.25, filter: "blur(18px)" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="relative flex h-56 w-56 items-center justify-center">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-full border border-cyan-300/40"
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: [0.2, 1.6], opacity: [0, 0.9, 0] }}
                transition={{ duration: 1.8, delay: i * 0.35, ease: "easeOut", repeat: Infinity }}
              />
            ))}
            <motion.div
              className="absolute inset-6 rounded-full"
              style={{ background: "conic-gradient(from 0deg, transparent, rgba(34,211,238,0.8), transparent 40%, rgba(168,85,247,0.8), transparent 75%)" }}
              initial={{ rotate: 0, opacity: 0 }}
              animate={{ rotate: 360, opacity: 1 }}
              transition={{ rotate: { duration: 2.2, ease: "linear", repeat: Infinity }, opacity: { duration: 0.4 } }}
            />
            <div className="absolute inset-[30px] rounded-full bg-[#02030a]" />
            <motion.img
              src="/logo.png"
              alt=""
              className="relative h-24 w-24 rounded-3xl object-cover shadow-[0_0_60px_rgba(34,211,238,0.5)]"
              initial={{ scale: 0.6, opacity: 0, filter: "blur(10px)" }}
              animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="nb-mono mt-10 h-20 space-y-1.5 text-center text-xs uppercase text-cyan-200/80">
            {lines.slice(0, line).map((l, i) => (
              <motion.p key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={i === 2 ? "text-sm text-white" : ""}>
                <span className="text-fuchsia-300/80">›</span> {l}
                {i < 2 && <span className="ml-2 text-emerald-300">OK</span>}
              </motion.p>
            ))}
          </div>
          <div className="mt-2 h-px w-56 overflow-hidden bg-white/10">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-300 via-violet-400 to-pink-400"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.8, ease: [0.65, 0, 0.35, 1] }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
