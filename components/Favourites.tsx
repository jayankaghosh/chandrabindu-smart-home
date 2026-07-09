"use client";

import { useEffect, useMemo } from "react";
import { Star } from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "./RoomCard";
import { favKey } from "./favKey";
import FavouritableControl from "./FavouritableControl";

const CONTROLLABLE = ["Boolean", "Enum", "Integer"];

// The Favourites screen: a flat grid of the user's starred controls, gathered
// from across all rooms. Reuses the dashboard's command/status plumbing.
export default function Favourites({
  rooms,
  favourites,
  statusByDevice,
  isAdmin,
  live,
  onCommand,
  onPoll,
  onToggleFavourite,
}: {
  rooms: Room[];
  favourites: Set<string>;
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  live: boolean;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onPoll: (deviceId: string) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
}) {
  // Resolve stored (deviceId, code) pairs to live device/room/function context.
  const entries = useMemo(() => {
    const out: {
      key: string;
      roomName: string;
      accessible: boolean;
      deviceId: string;
      deviceName: string;
      fn: Room["devices"][number]["functions"][number];
    }[] = [];
    for (const room of rooms) {
      const accessible = !room.locked || room.unlocked === true;
      for (const device of room.devices) {
        if (device.bluetooth) continue; // not locally controllable
        for (const fn of device.functions) {
          if (!CONTROLLABLE.includes(fn.type)) continue;
          const key = favKey(device.id, fn.code);
          if (!favourites.has(key)) continue;
          out.push({
            key,
            roomName: room.name,
            accessible,
            deviceId: device.id,
            deviceName: device.name,
            fn,
          });
        }
      }
    }
    return out;
  }, [rooms, favourites]);

  // Poll the devices behind the favourites while this view is visible.
  const deviceIds = useMemo(
    () => Array.from(new Set(entries.map((e) => e.deviceId))),
    [entries],
  );
  useEffect(() => {
    if (deviceIds.length === 0 || live) return; // live: state pushed via SSE
    const tick = () => {
      if (document.visibilityState === "visible") deviceIds.forEach(onPoll);
    };
    tick();
    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deviceIds, onPoll, live]);

  if (entries.length === 0) {
    return (
      <div className="card animate-fade-in mx-auto mt-10 max-w-lg p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-500 dark:bg-white/10">
          <Star size={26} />
        </div>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          No favourites yet
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Open the <span className="font-medium">Rooms</span> tab and tap the
          <Star size={13} className="mx-1 inline -translate-y-px" />
          on any switch to pin it here for quick access.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
      {entries.map((e) => {
        const reachable = statusByDevice[e.deviceId]?.reachable ?? null;
        const value = statusByDevice[e.deviceId]?.values?.[e.fn.code];
        const blockedProtected = !!e.fn.protected && !isAdmin;
        return (
          <FavouritableControl
            key={e.key}
            fn={e.fn}
            value={value}
            disabled={reachable === false || blockedProtected || !e.accessible}
            isProtected={!!e.fn.protected}
            isFavourite
            caption={
              e.accessible
                ? `${e.deviceName} · ${e.roomName}`
                : `${e.deviceName} · ${e.roomName} · 🔒`
            }
            onToggleFavourite={() => onToggleFavourite(e.deviceId, e.fn.code)}
            onChange={(v) => {
              if (e.accessible) onCommand(e.deviceId, e.fn.code, v);
            }}
          />
        );
      })}
    </div>
  );
}
