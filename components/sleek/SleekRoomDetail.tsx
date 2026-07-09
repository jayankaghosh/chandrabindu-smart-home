"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, LockOpen, Loader2 } from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { favKey } from "../favKey";
import { CONTROLLABLE } from "./labels";
import { gridContainer, gridItem } from "./motion";
import SleekControlTile from "./SleekControlTile";

export default function SleekRoomDetail({
  room,
  statusByDevice,
  isAdmin,
  favourites,
  onCommand,
  onToggleFavourite,
  onUnlocked,
}: {
  room: Room;
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  favourites: Set<string>;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
  onUnlocked: () => void;
}) {
  if (room.locked && !room.unlocked) {
    return <LockedRoom room={room} onUnlocked={onUnlocked} />;
  }

  const devices = room.devices.filter((d) => d.functions.some((f) => CONTROLLABLE.includes(f.type)));

  if (devices.length === 0) {
    return <p className="px-1 py-10 text-center text-slate-500 dark:text-slate-400">No controllable switches in this room.</p>;
  }

  return (
    <div className="space-y-7">
      {devices.map((device) => {
        const controls = device.functions.filter((f) => CONTROLLABLE.includes(f.type));
        const values = statusByDevice[device.id]?.values ?? {};
        const reachable = statusByDevice[device.id]?.reachable ?? null;
        return (
          <div key={device.id}>
            <p className="mb-2.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {device.name}
              {reachable === false && <span className="ml-2 text-amber-600 dark:text-amber-400">· offline</span>}
            </p>
            <motion.div
              variants={gridContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {controls.map((fn) => (
                <motion.div key={fn.code} variants={gridItem} className={fn.type === "Boolean" ? "" : "col-span-2"}>
                  <SleekControlTile
                    fn={fn}
                    value={values[fn.code]}
                    disabled={reachable === false || (!!fn.protected && !isAdmin)}
                    isProtected={!!fn.protected}
                    isAdmin={isAdmin}
                    isFavourite={favourites.has(favKey(device.id, fn.code))}
                    onCommand={(v) => onCommand(device.id, fn.code, v)}
                    onToggleFavourite={() => onToggleFavourite(device.id, fn.code)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function LockedRoom({ room, onUnlocked }: { room: Room; onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't unlock");
      onUnlocked();
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-sm text-center">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/70 text-slate-600 shadow-lg dark:bg-slate-700/70 dark:text-slate-200">
        <Lock size={34} />
      </div>
      <p className="mb-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{room.name} is locked</p>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Enter the room password to control it.</p>
      <form onSubmit={unlock} className="space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Room password"
          className="field !py-4 text-center text-lg"
        />
        <button type="submit" disabled={busy || !password} className="btn-primary w-full justify-center !py-4 text-base">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <LockOpen size={18} />}
          Unlock
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </div>
  );
}
