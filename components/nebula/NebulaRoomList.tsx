"use client";

import { motion } from "framer-motion";
import { Lock, ChevronRight } from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { roomIcon, roomOnCount } from "../sleek/SleekRoomList";
import { isCountable } from "../sleek/nav";
import HoloCard from "./HoloCard";
import { HUES } from "./fx";
import { stagger, rise } from "./motion";

/** A small ring showing what share of a room is on. */
export function MiniRing({ frac, size = 44 }: { frac: number; size?: number }) {
  const r = 18;
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(148,163,255,0.14)" strokeWidth="3" />
      <motion.circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        // Hidden at 0: a round cap would otherwise leave a dot.
        animate={{ pathLength: frac, opacity: frac > 0 ? 1 : 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        // var() only works in CSS, not SVG presentation attributes.
        style={{ stroke: "rgb(var(--nb-hue))", filter: frac > 0 ? "drop-shadow(0 0 4px rgb(var(--nb-hue)))" : undefined }}
      />
    </svg>
  );
}

export default function NebulaRoomList({
  rooms,
  statusByDevice,
  onOpenRoom,
}: {
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  onOpenRoom: (roomId: string) => void;
}) {
  const withDevices = rooms.filter((r) => r.devices.length > 0);
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {withDevices.map((room, i) => {
        const locked = room.locked && !room.unlocked;
        const on = roomOnCount(room, statusByDevice);
        const total = room.devices.reduce((n, d) => n + d.functions.filter(isCountable).length, 0);
        const Icon = locked ? Lock : roomIcon(room.name);
        const hue = locked ? HUES.lock : on > 0 ? HUES.light : HUES.fan;
        return (
          <motion.div key={room.id} variants={rise}>
            <HoloCard hue={hue} onClick={() => onOpenRoom(room.id)} className="w-full" ariaLabel={`${room.name}${on ? `, ${on} on` : ""}`}>
              <span className="flex min-h-[150px] flex-col justify-between p-5">
                <span className="flex items-start justify-between">
                  <span className="relative flex h-14 w-14 items-center justify-center">
                    <MiniRing frac={total ? on / total : 0} size={56} />
                    <Icon size={22} className="absolute text-[rgb(var(--nb-hue))]" />
                  </span>
                  <span className="nb-mono text-[10px] text-slate-500">{String(i + 1).padStart(2, "0")}</span>
                </span>
                <span className="flex items-end justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-semibold tracking-tight text-white">{room.name}</span>
                    <span className="nb-mono block text-[10px] uppercase text-slate-400">
                      {locked ? "Secured" : on > 0 ? `${on} of ${total} active` : `${room.devices.length} device${room.devices.length === 1 ? "" : "s"} · standby`}
                    </span>
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </span>
              </span>
            </HoloCard>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
