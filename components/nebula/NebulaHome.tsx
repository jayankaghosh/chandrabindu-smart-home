"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, WifiOff, Lock } from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { SECTIONS, type Section } from "../sleek/SleekHome";
import { roomIcon, roomOnCount } from "../sleek/SleekRoomList";
import EnergyCore from "./EnergyCore";
import HoloCard from "./HoloCard";
import ScrambleText from "./ScrambleText";
import { HUES, sfx } from "./fx";
import { rise, stagger } from "./motion";

// Each home section's colour in the sky (Sleek's section list, Nebula's hues).
const SECTION_HUE: Record<Section, [number, number, number]> = {
  favourites: HUES.light,
  rooms: HUES.fan,
  goodnight: [0.45, 0.5, 1],
  routines: [0.93, 0.35, 0.8],
  automations: HUES.socket,
  shortcuts: [0.35, 0.65, 1],
  switchGroups: HUES.switch,
  usage: HUES.lock,
  screensaver: [0.7, 0.75, 0.85],
  insights: [0.25, 0.85, 1],
  voice: [0.75, 0.45, 1],
};

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function NebulaHome({
  houseName,
  greet,
  onCount,
  switchCount,
  offline,
  roomCount,
  deviceCount,
  live,
  rooms,
  statusByDevice,
  onOpen,
  onOpenRoom,
}: {
  houseName: string;
  greet: string;
  onCount: number;
  switchCount: number;
  offline: number;
  roomCount: number;
  deviceCount: number;
  live: boolean;
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  onOpen: (s: Section) => void;
  onOpenRoom: (roomId: string) => void;
}) {
  const now = useClock();
  const time = now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";
  const date = now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : "";
  const roomsWithDevices = rooms.filter((r) => r.devices.length > 0);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
        <motion.div initial={{ opacity: 0, x: -30, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
          <p className="nb-mono mb-3 text-xs uppercase text-cyan-200/80">
            <ScrambleText text={greet || " "} />
          </p>
          <h2 className="nb-gradient-text pb-2 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">{houseName}</h2>
          <div className="mt-5 flex items-baseline gap-4">
            <span className="nb-mono text-3xl font-light text-white sm:text-4xl">{time}</span>
            <span className="text-sm text-slate-400">{date}</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { k: "Rooms", v: roomCount },
              { k: "Devices", v: deviceCount },
              { k: "Online", v: Math.max(0, deviceCount - offline) },
            ].map((c) => (
              <span key={c.k} className="nb-mono inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[11px] uppercase text-slate-300 backdrop-blur">
                <span className="text-white">{c.v}</span> {c.k}
              </span>
            ))}
            {offline > 0 && (
              <span className="nb-mono inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1.5 text-[11px] uppercase text-amber-300">
                <WifiOff size={12} /> {offline} offline
              </span>
            )}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.7, filter: "blur(16px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}>
          <EnergyCore on={onCount} total={switchCount} live={live} />
        </motion.div>
      </section>

      {/* Room rail */}
      {roomsWithDevices.length > 0 && (
        <section>
          <SectionLabel>Rooms</SectionLabel>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
            {roomsWithDevices.map((room, i) => {
              const locked = room.locked && !room.unlocked;
              const on = roomOnCount(room, statusByDevice);
              const Icon = locked ? Lock : roomIcon(room.name);
              return (
                <motion.button
                  key={room.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.04, type: "spring", stiffness: 300, damping: 26 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    sfx("nav");
                    onOpenRoom(room.id);
                  }}
                  className={`group relative flex shrink-0 snap-start items-center gap-3 rounded-2xl border py-3 pl-3 pr-4 backdrop-blur-xl transition-colors ${
                    on > 0 ? "border-amber-300/30 bg-amber-300/[0.07]" : "border-white/[0.08] bg-white/[0.03] hover:border-cyan-300/40"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      on > 0 ? "bg-amber-300/20 text-amber-200 shadow-[0_0_18px_-4px_rgba(252,211,77,0.8)]" : "bg-white/[0.06] text-slate-400"
                    }`}
                  >
                    <Icon size={17} />
                  </span>
                  <span className="text-left">
                    <span className="block whitespace-nowrap text-sm font-medium text-white">{room.name}</span>
                    <span className="nb-mono block text-[10px] uppercase text-slate-500">{locked ? "Secured" : on > 0 ? `${on} on` : "All off"}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>
      )}

      {/* Sections */}
      <section>
        <SectionLabel>Systems</SectionLabel>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.key} variants={rise}>
                <HoloCard hue={SECTION_HUE[s.key]} onClick={() => onOpen(s.key)} className="w-full" ariaLabel={s.title}>
                  <span className="flex min-h-[150px] flex-col justify-between p-4 sm:p-5">
                    <span className="flex items-start justify-between">
                      <span
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgb(var(--nb-hue)/0.14)] text-[rgb(var(--nb-hue))] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-[-6deg]"
                        style={{ boxShadow: "0 0 28px -6px rgb(var(--nb-hue) / 0.7), inset 0 0 10px rgb(var(--nb-hue) / 0.2)" }}
                      >
                        <Icon size={22} />
                      </span>
                      <span className="nb-mono text-[10px] text-slate-600 transition-colors group-hover:text-[rgb(var(--nb-hue))]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="block">
                      <span className="flex items-center gap-1 text-base font-semibold tracking-tight text-white sm:text-lg">
                        {s.title}
                        <ArrowUpRight size={16} className="text-slate-600 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
                      </span>
                      <span className="block text-xs text-slate-400 sm:text-sm">{s.subtitle}</span>
                    </span>
                  </span>
                </HoloCard>
              </motion.div>
            );
          })}
        </motion.div>
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="nb-mono text-[11px] uppercase text-slate-400">{children}</span>
      <span className="relative h-px flex-1 overflow-hidden bg-gradient-to-r from-white/15 to-transparent">
        <span className="nb-scan absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      </span>
    </div>
  );
}
