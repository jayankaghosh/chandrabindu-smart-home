"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { favKey } from "../favKey";
import { CONTROLLABLE } from "./labels";
import { gridContainer, gridItem } from "./motion";
import SleekControlTile from "./SleekControlTile";

export default function SleekFavourites({
  rooms,
  favourites,
  statusByDevice,
  isAdmin,
  onCommand,
  onToggleFavourite,
}: {
  rooms: Room[];
  favourites: Set<string>;
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
}) {
  const entries = useMemo(() => {
    const out: { key: string; deviceId: string; caption: string; accessible: boolean; fn: Room["devices"][number]["functions"][number] }[] = [];
    for (const room of rooms) {
      const accessible = !room.locked || room.unlocked === true;
      for (const device of room.devices) {
        if (device.bluetooth) continue; // not locally controllable
        for (const fn of device.functions) {
          if (!CONTROLLABLE.includes(fn.type)) continue;
          const key = favKey(device.id, fn.code);
          if (!favourites.has(key)) continue;
          out.push({ key, deviceId: device.id, caption: `${device.name} · ${room.name}`, accessible, fn });
        }
      }
    }
    return out;
  }, [rooms, favourites]);

  if (entries.length === 0) {
    return (
      <div className="mx-auto mt-10 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-400/15 text-amber-500 dark:bg-white/10">
          <Star size={34} />
        </div>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No favourites yet</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500 dark:text-slate-400">
          Open a room and tap the <Star size={13} className="mx-0.5 inline -translate-y-px" /> on any switch to pin it here.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      variants={gridContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {entries.map((e) => {
        const reachable = statusByDevice[e.deviceId]?.reachable ?? null;
        const value = statusByDevice[e.deviceId]?.values?.[e.fn.code];
        return (
          <motion.div key={e.key} variants={gridItem} className={e.fn.type === "Boolean" ? "" : "col-span-2"}>
            <SleekControlTile
              fn={e.fn}
              value={value}
              caption={e.accessible ? e.caption : `${e.caption} · 🔒`}
              disabled={reachable === false || !e.accessible || (!!e.fn.protected && !isAdmin)}
              isProtected={!!e.fn.protected}
              isAdmin={isAdmin}
              isFavourite
              onCommand={(v) => e.accessible && onCommand(e.deviceId, e.fn.code, v)}
              onToggleFavourite={() => onToggleFavourite(e.deviceId, e.fn.code)}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
}
