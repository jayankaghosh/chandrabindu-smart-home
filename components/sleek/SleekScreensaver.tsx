"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Cfg {
  idleSec: number;
  imageSec: number;
  images: string[];
}

export interface ScreensaverStats {
  rooms: number;
  devices: number;
  on: number;
  offline: number;
  protectedCount: number;
}

const LS_KEY = "sleek-screensaver-on";

// Idle screensaver: after `idleSec` with no input, fades in a fullscreen clock +
// cross-fading admin-uploaded images. Any touch/mouse/key dismisses it. Sits
// below the safety lock (z-[80] < LockedOverlay z-[90]).
export default function SleekScreensaver({ stats }: { stats?: ScreensaverStats }) {
  const [cfg, setCfg] = useState<Cfg>({ idleSec: 120, imageSec: 12, images: [] });
  const [enabled, setEnabled] = useState(false); // per-device (localStorage)
  const [active, setActive] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  // Per-device enable flag: read from localStorage, and react to changes made on
  // the Screensaver screen (custom event) or in another tab (storage event).
  useEffect(() => {
    const read = () => {
      try {
        setEnabled(localStorage.getItem(LS_KEY) === "on");
      } catch {
        setEnabled(false);
      }
    };
    read();
    window.addEventListener("sleek-screensaver-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("sleek-screensaver-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  // Load the shared image set + idle delay while enabled (refresh periodically).
  useEffect(() => {
    if (!enabled) return;
    const load = () =>
      fetch("/api/screensaver")
        .then((r) => r.json())
        .then((d) => setCfg({ idleSec: Number(d.idleSec) || 120, imageSec: Number(d.imageSec) || 12, images: d.images ?? [] }))
        .catch(() => {});
    load();
    const t = setInterval(load, 300_000);
    return () => clearInterval(t);
  }, [enabled]);

  // Idle detection.
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      return;
    }
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setActive(true), cfg.idleSec * 1000);
    };
    const onActivity = () => {
      if (activeRef.current) setActive(false); // an interaction dismisses it
      arm();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    for (const e of events) window.addEventListener(e, onActivity, { passive: true });
    arm();
    return () => {
      for (const e of events) window.removeEventListener(e, onActivity);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, cfg.idleSec]);

  // Tick the clock + rotate images while active.
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const clock = setInterval(() => setNow(new Date()), 1000);
    const rotate =
      cfg.images.length > 1
        ? setInterval(() => setImgIdx((i) => (i + 1) % cfg.images.length), Math.max(2, cfg.imageSec) * 1000)
        : null;
    return () => {
      clearInterval(clock);
      if (rotate) clearInterval(rotate);
    };
  }, [active, cfg.images.length, cfg.imageSec]);

  const time = now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const date = now
    ? now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })
    : "";

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="fixed inset-0 z-[80] overflow-hidden bg-black"
          onClick={() => setActive(false)}
        >
          {/* Cross-fading background images */}
          <AnimatePresence>
            {cfg.images.length > 0 && (
              <motion.img
                key={cfg.images[imgIdx]}
                src={`/api/screensaver/images/${cfg.images[imgIdx]}`}
                alt=""
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2 }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </AnimatePresence>
          {/* Subtle corner scrim so the text stays legible over any image. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tl from-black/70 via-transparent to-transparent" />

          {/* Clock + stats, tucked into the bottom-right so the photo shows. */}
          <div className="absolute bottom-8 right-8 max-w-[90vw] text-right text-white drop-shadow-lg">
            <div className="text-6xl font-bold leading-none tracking-tight tabular-nums sm:text-7xl">{time}</div>
            <div className="mt-1.5 text-base font-medium text-white/80 sm:text-lg">{date}</div>
            {stats && (
              <div className="mt-4 flex justify-end">
                <div className="inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-full bg-black/35 px-4 py-2 text-sm font-medium text-white/85 shadow-lg ring-1 ring-white/15 backdrop-blur-md">
                  <span>{stats.rooms} rooms</span>
                  <span aria-hidden className="text-white/30">·</span>
                  <span>{stats.devices} devices</span>
                  <span aria-hidden className="text-white/30">·</span>
                  <span>{stats.on} on</span>
                  {stats.protectedCount > 0 && (
                    <>
                      <span aria-hidden className="text-white/30">·</span>
                      <span>{stats.protectedCount} protected</span>
                    </>
                  )}
                  {stats.offline > 0 && (
                    <>
                      <span aria-hidden className="text-white/30">·</span>
                      <span>{stats.offline} offline</span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="mt-4 text-[11px] uppercase tracking-widest text-white/40">Tap to wake</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
