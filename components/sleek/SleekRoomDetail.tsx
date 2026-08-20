"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, LockOpen, Loader2, Bluetooth, Pencil, Check, X } from "lucide-react";
import type { Room, UiDevice } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { favKey } from "../favKey";
import { CONTROLLABLE } from "./labels";
import { gridContainer, gridItem } from "./motion";
import SleekControlTile from "./SleekControlTile";
import SleekDeviceEditSheet from "./SleekDeviceEditSheet";

export default function SleekRoomDetail({
  room,
  statusByDevice,
  isAdmin,
  favourites,
  onCommand,
  onToggleFavourite,
  onUnlocked,
  editMode = false,
  allRooms = [],
  onChanged,
}: {
  room: Room;
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  favourites: Set<string>;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
  onUnlocked: () => void;
  editMode?: boolean;
  allRooms?: { id: string; name: string }[];
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState<UiDevice | null>(null);
  const canEdit = isAdmin && editMode;
  const refresh = onChanged ?? (() => {});

  if (room.locked && !room.unlocked) {
    return <LockedRoom room={room} onUnlocked={onUnlocked} />;
  }

  const devices = room.devices.filter((d) => d.functions.some((f) => CONTROLLABLE.includes(f.type)));

  return (
    <div className="space-y-7">
      {canEdit && <RoomRenameBar room={room} onSaved={refresh} />}

      {devices.length === 0 && (
        <p className="px-1 py-10 text-center text-slate-500 dark:text-slate-400">No controllable switches in this room.</p>
      )}

      {devices.map((device) => {
        const controls = device.functions.filter((f) => CONTROLLABLE.includes(f.type));
        const values = statusByDevice[device.id]?.values ?? {};
        const reachable = statusByDevice[device.id]?.reachable ?? null;
        if (device.bluetooth) {
          return (
            <div key={device.id}>
              <DeviceLabel device={device} canEdit={canEdit} onEdit={() => setEditing(device)} />
              <div className="tile-off flex items-center gap-3 rounded-[26px] p-5 text-slate-500 dark:text-slate-400">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-500 dark:bg-white/10">
                  <Bluetooth size={22} />
                </span>
                <div>
                  <p className="font-semibold text-slate-700 dark:text-slate-200">Bluetooth device</p>
                  <p className="text-sm">Can’t be controlled from here — use the Smart Life app.</p>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={device.id}>
            <DeviceLabel
              device={device}
              canEdit={canEdit}
              onEdit={() => setEditing(device)}
              offline={reachable === false}
            />
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

      {editing && (
        <SleekDeviceEditSheet
          device={editing}
          rooms={allRooms}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// Device name row, with an Edit pencil in Edit Mode.
function DeviceLabel({
  device,
  canEdit,
  onEdit,
  offline,
}: {
  device: UiDevice;
  canEdit: boolean;
  onEdit: () => void;
  offline?: boolean;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2 px-1">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {device.name}
        {offline && <span className="ml-2 text-amber-600 dark:text-amber-400">· offline</span>}
      </p>
      {canEdit && (
        <button
          onClick={onEdit}
          aria-label={`Edit ${device.name}`}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-black/[0.04] hover:text-slate-600 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
}

// Inline room-rename bar shown at the top of a room in Edit Mode.
function RoomRenameBar({ room, onSaved }: { room: Room; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Couldn't rename");
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setName(room.name);
          setEditing(true);
        }}
        className="inline-flex items-center gap-2 rounded-2xl border border-white/60 bg-white/40 px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
      >
        <Pencil size={14} />
        Rename room
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.05]">
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="field !py-2" placeholder="Room name" />
        <button onClick={save} disabled={busy || !name.trim()} aria-label="Save room name" className="btn-primary !px-3">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        </button>
        <button onClick={() => setEditing(false)} aria-label="Cancel" className="icon-btn">
          <X size={15} />
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
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
