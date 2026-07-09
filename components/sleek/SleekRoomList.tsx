"use client";

import { motion } from "framer-motion";
import {
  BedDouble, Sofa, CookingPot, Bath, Utensils, Laptop, Car, Trees, DoorOpen, Sparkles, Lock,
  type LucideIcon,
} from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import NavTile from "./NavTile";
import { gridContainer } from "./motion";

function roomIcon(name: string): LucideIcon {
  const s = name.toLowerCase();
  if (/bed|bedroom|\bbr\b|mbr|gbr|fbr/.test(s)) return BedDouble;
  if (/living|lounge|drawing|hall|sofa/.test(s)) return Sofa;
  if (/kitchen/.test(s)) return CookingPot;
  if (/bath|wash|toilet/.test(s)) return Bath;
  if (/dining/.test(s)) return Utensils;
  if (/office|study|work/.test(s)) return Laptop;
  if (/garage|parking|car/.test(s)) return Car;
  if (/balcony|garden|terrace|lawn|outdoor/.test(s)) return Trees;
  if (/pooja|temple|prayer/.test(s)) return Sparkles;
  return DoorOpen;
}

function roomOnCount(room: Room, statusByDevice: Record<string, DeviceStatusState>): number {
  let n = 0;
  for (const d of room.devices) {
    const vals = statusByDevice[d.id]?.values ?? {};
    for (const f of d.functions) if (f.type === "Boolean" && vals[f.code] === true) n++;
  }
  return n;
}

export default function SleekRoomList({
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
    <motion.div
      variants={gridContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {withDevices.map((room) => {
        const locked = room.locked && !room.unlocked;
        const on = roomOnCount(room, statusByDevice);
        return (
          <NavTile
            key={room.id}
            icon={locked ? Lock : roomIcon(room.name)}
            title={room.name}
            subtitle={locked ? "Locked" : `${room.devices.length} device${room.devices.length === 1 ? "" : "s"}`}
            badge={!locked && on > 0 ? `${on} on` : undefined}
            accent={locked ? "from-slate-400 to-slate-500" : "from-brand-500 to-brand-400"}
            onClick={() => onOpenRoom(room.id)}
          />
        );
      })}
    </motion.div>
  );
}
