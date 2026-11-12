"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bluetooth, Lock, LockOpen, Loader2, Pencil, Check, X, PowerOff, WifiOff } from "lucide-react";
import type { Room, UiDevice } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { favKey } from "../favKey";
import { isChildLock } from "@/lib/panelLock";
import { countsAsOn } from "@/lib/onCount";
import { CONTROLLABLE } from "../sleek/labels";
import { isCountable } from "../sleek/nav";
import { roomIcon, roomOnCount } from "../sleek/SleekRoomList";
import PanelLockToggle from "../PanelLockToggle";
import SleekDeviceEditSheet from "../sleek/SleekDeviceEditSheet";
import SleekRoomLockSheet from "../sleek/SleekRoomLockSheet";
import ControlOrb from "./ControlOrb";
import Planet, { roomHue } from "./Planet";
import ScrambleText from "./ScrambleText";
import { HUES, emitPulse, emitWarp, haptic, sfx } from "./fx";
import { rise, stagger } from "./motion";

// A room after the fly-in: the planet docks to the side as a live readout
// (and the room's power-down), and each device is a constellation of control
// orbs joined by a thread. Edit Mode adds rename, lock and per-device edit.
export default function RoomFocus({
  room,
  rooms,
  statusByDevice,
  isAdmin,
  editMode,
  favourites,
  groupedKeys,
  onCommand,
  onToggleFavourite,
  onChanged,
  onBack,
  onSwitchRoom,
}: {
  room: Room;
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  editMode: boolean;
  favourites: Set<string>;
  groupedKeys: Set<string>;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
  onChanged: () => void;
  onBack: () => void;
  onSwitchRoom: (roomId: string) => void;
}) {
  const [editing, setEditing] = useState<UiDevice | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const canEdit = isAdmin && editMode;
  const locked = !!room.locked && !room.unlocked;
  const on = roomOnCount(room, statusByDevice);
  const total = room.devices.reduce((n, d) => n + d.functions.filter(isCountable).length, 0);
  const devices = room.devices.filter((d) => d.functions.some((f) => CONTROLLABLE.includes(f.type)));
  const others = rooms.filter((r) => r.devices.length > 0);

  // Power the room down: every switch and fan that's on goes off. Protected,
  // lifeline and panel locks never count as on, so they're never touched.
  function powerDown() {
    let n = 0;
    for (const d of room.devices) {
      if (d.bluetooth || statusByDevice[d.id]?.reachable === false) continue;
      const vals = statusByDevice[d.id]?.values ?? {};
      for (const f of d.functions) {
        if (!countsAsOn(f, vals[f.code])) continue;
        if (f.type === "Boolean") onCommand(d.id, f.code, false);
        else if (f.range?.includes("0")) onCommand(d.id, f.code, "0");
        else continue;
        n++;
      }
    }
    if (n > 0) {
      emitPulse(innerWidth * 0.2, innerHeight * 0.4, HUES.white, 1.6);
      sfx("off");
      haptic(24);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-8 px-3 pb-44 pt-4 sm:px-6 lg:grid-cols-[minmax(300px,360px)_1fr]">
      {/* Docked planet */}
      <aside className="self-start">
        <button
          onClick={onBack}
          className="nb-mono mb-5 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-[11px] uppercase text-slate-300 transition hover:border-cyan-300/50 hover:text-white"
        >
          <ArrowLeft size={14} /> Orbit
        </button>
        <div className="flex items-center gap-5 lg:flex-col lg:items-start">
          <motion.div
            layoutId={`planet-${room.id}`}
            className="shrink-0"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 20 }}
          >
            <span className="block lg:hidden">
              <Planet size={104} hue={roomHue(on, locked)} frac={total ? on / total : 0} icon={locked ? Lock : roomIcon(room.name)} ringed={on > 0} />
            </span>
            <span className="hidden lg:block lg:p-10">
              <Planet size={200} hue={roomHue(on, locked)} frac={total ? on / total : 0} icon={locked ? Lock : roomIcon(room.name)} ringed={on > 0} />
            </span>
          </motion.div>
          <div className="min-w-0">
            {canEdit ? <RoomName room={room} onSaved={onChanged} /> : (
              <h1 className="nb-gradient-text text-4xl font-semibold tracking-tight sm:text-5xl">
                <ScrambleText text={room.name} duration={500} />
              </h1>
            )}
            <p className="nb-mono mt-2 text-[11px] uppercase text-slate-400">
              {locked ? "Secured" : `${on} of ${total} active · ${room.devices.length} device${room.devices.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {!locked && on > 0 && <HoldButton label="Hold to power down" onDone={powerDown} />}
          {canEdit && (
            <button onClick={() => setLockOpen(true)} className="btn-ghost !rounded-full">
              {room.locked ? <Lock size={14} className="text-amber-400" /> : <LockOpen size={14} />}
              {room.locked ? "Manage lock" : "Lock room"}
            </button>
          )}
        </div>

        {/* Moons sit under the planet on wide screens, after the controls on phones. */}
        <div className="hidden lg:block">
          <Moons rooms={others} activeId={room.id} statusByDevice={statusByDevice} onSwitchRoom={onSwitchRoom} />
        </div>
      </aside>

      {/* Constellations */}
      <section>
        {locked ? (
          <UnlockRoom room={room} onUnlocked={onChanged} />
        ) : devices.length === 0 ? (
          <p className="py-16 text-center text-slate-400">No controllable switches in this room.</p>
        ) : (
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
            {devices.map((device) => {
              const values = statusByDevice[device.id]?.values ?? {};
              const reachable = statusByDevice[device.id]?.reachable ?? null;
              const offline = reachable === false;
              const controls = device.functions.filter((f) => CONTROLLABLE.includes(f.type) && !isChildLock(f.code));
              const lockFn = device.functions.find((f) => isChildLock(f.code));
              return (
                <motion.div
                  key={device.id}
                  variants={rise}
                  className="rounded-[28px] border border-white/[0.06] bg-[rgba(6,8,22,0.38)] p-3 backdrop-blur-md sm:p-5"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${offline ? "bg-amber-400" : "bg-emerald-400 shadow-[0_0_8px_#34d399]"}`} />
                      <p className="nb-mono truncate text-[11px] uppercase text-slate-300">{device.name}</p>
                      {offline && (
                        <span className="nb-mono inline-flex items-center gap-1 text-[10px] uppercase text-amber-300">
                          <WifiOff size={11} /> offline
                        </span>
                      )}
                      {canEdit && (
                        <button onClick={() => setEditing(device)} aria-label={`Edit ${device.name}`} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white/[0.06] hover:text-white">
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                    {lockFn && (
                      <PanelLockToggle locked={values[lockFn.code] === true} isAdmin={isAdmin} disabled={offline} onToggle={(v) => onCommand(device.id, lockFn.code, v)} />
                    )}
                  </div>
                  {device.bluetooth ? (
                    <div className="flex items-center gap-3 text-slate-400">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-sky-300/20 bg-sky-400/10 text-sky-300">
                        <Bluetooth size={20} />
                      </span>
                      <p className="text-sm">This is a Bluetooth device. It can’t be controlled from here; use the Smart Life app.</p>
                    </div>
                  ) : (
                    <div className="nb-thread flex flex-wrap gap-x-2 gap-y-5">
                      {controls.map((fn) => (
                        <ControlOrb
                          key={fn.code}
                          fn={fn}
                          value={values[fn.code]}
                          disabled={offline || (!!fn.protected && !isAdmin)}
                          isProtected={!!fn.protected}
                          isAdmin={isAdmin}
                          isFavourite={favourites.has(favKey(device.id, fn.code))}
                          inGroup={groupedKeys.has(favKey(device.id, fn.code))}
                          onCommand={(v) => onCommand(device.id, fn.code, v)}
                          onToggleFavourite={() => onToggleFavourite(device.id, fn.code)}
                          onEdit={canEdit ? () => setEditing(device) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
        <p className="nb-mono mt-6 text-center text-[10px] uppercase text-slate-600">Long-press or right-click a control for favourites{canEdit ? " and editing" : ""}</p>
        <div className="lg:hidden">
          <Moons rooms={others} activeId={room.id} statusByDevice={statusByDevice} onSwitchRoom={onSwitchRoom} />
        </div>
      </section>

      {/* Portalled: the fly-in wrapper's transform would trap fixed sheets. */}
      {editing &&
        createPortal(
          <SleekDeviceEditSheet device={editing} rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} onClose={() => setEditing(null)} onSaved={onChanged} />,
          document.body,
        )}
      {lockOpen && createPortal(<SleekRoomLockSheet room={room} onClose={() => setLockOpen(false)} onSaved={onChanged} />, document.body)}
    </div>
  );
}

// Other rooms as small lit moons, to jump between rooms without the orbit.
function Moons({
  rooms,
  activeId,
  statusByDevice,
  onSwitchRoom,
}: {
  rooms: Room[];
  activeId: string;
  statusByDevice: Record<string, DeviceStatusState>;
  onSwitchRoom: (roomId: string) => void;
}) {
  if (rooms.length < 2) return null;
  return (
    <div className="mt-8">
      <p className="nb-mono mb-3 text-[10px] uppercase text-slate-500">Other worlds</p>
      <div className="flex flex-wrap gap-2">
        {rooms.map((r) => {
          const rOn = roomOnCount(r, statusByDevice);
          const active = r.id === activeId;
          return (
            <button
              key={r.id}
              disabled={active}
              onClick={() => {
                sfx("tick");
                emitWarp(1);
                onSwitchRoom(r.id);
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                active
                  ? "border-cyan-300/50 bg-cyan-300/10 text-white"
                  : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${rOn > 0 ? "bg-amber-300 shadow-[0_0_8px_#fcd34d]" : "bg-cyan-300/40"}`} />
              {r.name}
              {rOn > 0 && <span className="nb-mono text-[10px] text-amber-300">{rOn}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Press and hold to confirm: a ring fills, and letting go early cancels.
function HoldButton({ label, onDone }: { label: string; onDone: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const start = () => {
    setHolding(true);
    sfx("tick");
    timer.current = window.setTimeout(() => {
      setHolding(false);
      onDone();
    }, 750);
  };
  const cancel = () => {
    setHolding(false);
    if (timer.current) window.clearTimeout(timer.current);
  };
  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !holding && start()}
      onKeyUp={cancel}
      className="relative inline-flex select-none items-center gap-2 overflow-hidden rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-100"
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-slate-200/30 to-white/40"
        initial={false}
        animate={{ width: holding ? "100%" : "0%" }}
        transition={{ duration: holding ? 0.75 : 0.2, ease: "linear" }}
      />
      <PowerOff size={15} className="relative" />
      <span className="relative">{label}</span>
    </button>
  );
}

function RoomName({ room, onSaved }: { room: Room; onSaved: () => void }) {
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
      <button onClick={() => { setName(room.name); setEditing(true); }} className="group flex items-center gap-3 text-left">
        <h1 className="nb-gradient-text text-4xl font-semibold tracking-tight sm:text-5xl">{room.name}</h1>
        <Pencil size={16} className="text-slate-500 group-hover:text-white" />
      </button>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="field !py-2 text-lg" placeholder="Room name" />
        <button onClick={save} disabled={busy || !name.trim()} aria-label="Save room name" className="btn-primary !px-3">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
        </button>
        <button onClick={() => setEditing(false)} aria-label="Cancel" className="icon-btn">
          <X size={15} />
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

function UnlockRoom({ room, onUnlocked }: { room: Room; onUnlocked: () => void }) {
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
      sfx("power");
      onUnlocked();
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-sm rounded-[28px] border border-rose-300/20 bg-[rgba(6,8,22,0.5)] p-6 text-center backdrop-blur-md">
      <p className="nb-mono mb-1 text-[11px] uppercase text-rose-300">Access restricted</p>
      <p className="mb-5 text-sm text-slate-400">Enter the room password to control {room.name}.</p>
      <form onSubmit={unlock} className="space-y-3">
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Room password" className="field !py-3.5 text-center text-lg" />
        <button type="submit" disabled={busy || !password} className="btn-primary w-full justify-center !py-3.5">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <LockOpen size={18} />}
          Unlock
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
