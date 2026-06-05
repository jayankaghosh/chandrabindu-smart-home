"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Wifi,
  WifiOff,
  Pencil,
  Check,
  X,
  ChevronDown,
  Lock,
  LockOpen,
  KeyRound,
  Trash2,
} from "lucide-react";
import type { Room, UiDevice } from "@/lib/types";
import ControlTile from "./ControlTile";

export interface DeviceStatusState {
  reachable: boolean | null;
  scanning: boolean;
  values: Record<string, unknown>;
}

function usePersistedOpen(key: string, fallback = false) {
  const [open, setOpen] = useState(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setOpen(v === "1");
    } catch {
      /* ignore */
    }
  }, [key]);
  const toggle = () =>
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  return [open, toggle] as const;
}

export default function RoomCard({
  room,
  index = 0,
  isAdmin,
  statusByDevice,
  rooms,
  onCommand,
  onPoll,
  onChanged,
}: {
  room: Room;
  index?: number;
  isAdmin: boolean;
  statusByDevice: Record<string, DeviceStatusState>;
  rooms: { id: string; name: string }[];
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onPoll: (deviceId: string) => void;
  onChanged: () => void;
}) {
  const [open, toggle] = usePersistedOpen(`room-open:${room.id}`);

  // Locked for this session (admin or not): show the lock overlay instead.
  if (room.locked && !room.unlocked) {
    return (
      <LockedRoomCard
        room={room}
        index={index}
        isAdmin={isAdmin}
        onChanged={onChanged}
      />
    );
  }

  let onCount = 0;
  for (const d of room.devices) {
    const vals = statusByDevice[d.id]?.values ?? {};
    for (const f of d.functions) {
      if (f.type === "Boolean" && vals[f.code] === true) onCount++;
    }
  }

  return (
    <section
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
      className={`card animate-fade-in flex flex-col self-start overflow-hidden ${
        open ? "h-[480px] sm:h-[520px]" : ""
      }`}
    >
      <div className="flex w-full shrink-0 items-center gap-2 px-5 py-4">
        <button
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <h2 className="truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {room.name}
          </h2>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              onCount > 0
                ? "bg-brand-500/15 dark:bg-white/10 text-brand-700 dark:text-white"
                : "bg-white/40 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300"
            }`}
          >
            {onCount > 0
              ? `${onCount} on`
              : `${room.devices.length} device${room.devices.length === 1 ? "" : "s"}`}
          </span>
        </button>
        {isAdmin && <RoomLockButton room={room} onChanged={onChanged} />}
        <button onClick={toggle} aria-label="Expand room" className="shrink-0">
          <ChevronDown
            size={20}
            className={`text-slate-500 dark:text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="min-h-0 flex-1 animate-fade-in space-y-2.5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5">
          {room.devices.map((device) => (
            <DeviceGroup
              key={device.id}
              device={device}
              isAdmin={isAdmin}
              state={statusByDevice[device.id]}
              rooms={rooms}
              onCommand={onCommand}
              onPoll={onPoll}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const CONTROLLABLE = ["Boolean", "Enum", "Integer"];

// Locked room: same card with its controls shown behind a blurred overlay.
// The big lock button reveals the password field to unlock for this session.
function LockedRoomCard({
  room,
  index = 0,
  isAdmin,
  onChanged,
}: {
  room: Room;
  index?: number;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [showInput, setShowInput] = useState(false);
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
      onChanged(); // reloads → card re-renders unlocked (this unmounts)
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(false);
    }
  }

  async function removeLock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/lock`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove lock");
      onChanged();
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <section
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }}
      className="card animate-fade-in relative flex h-[480px] flex-col self-start overflow-hidden sm:h-[520px]"
    >
      {/* Header stays crisp so the room is identifiable */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-4">
        <h2 className="truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {room.name}
        </h2>
        <span className="shrink-0 rounded-full bg-white/40 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-white/[0.05] dark:text-slate-300">
          {room.devices.length} device{room.devices.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Blurred, non-interactive preview of the room's controls */}
      <div
        aria-hidden
        className="pointer-events-none min-h-0 flex-1 select-none space-y-2.5 overflow-hidden px-4 pb-4 sm:px-5"
      >
        {room.devices.map((device) => {
          const controllable = device.functions.filter((f) =>
            CONTROLLABLE.includes(f.type),
          );
          if (controllable.length === 0) return null;
          return (
            <div
              key={device.id}
              className="rounded-2xl border border-white/45 bg-white/25 p-2.5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <p className="mb-2 px-1 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                {device.name}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {controllable.map((fn) => (
                  <ControlTile
                    key={fn.code}
                    fn={fn}
                    value={undefined}
                    disabled
                    onChange={() => {}}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Overlay blurring the contents, with the lock / unlock affordance */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/40 px-6 text-center backdrop-blur-md dark:bg-slate-900/40">
        {!showInput ? (
          <>
            <button
              onClick={() => {
                setError(null);
                setShowInput(true);
              }}
              title="Unlock room"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-[0_12px_30px_-8px_rgba(16,24,40,0.5)] ring-1 ring-black/5 transition hover:scale-105 dark:bg-slate-700/90 dark:text-slate-100"
            >
              <Lock size={26} />
            </button>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Locked · tap to unlock
            </p>
            {isAdmin && (
              <button
                onClick={removeLock}
                disabled={busy}
                className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
              >
                Remove lock
              </button>
            )}
          </>
        ) : (
          <form onSubmit={unlock} className="w-full max-w-[230px] space-y-2">
            <input
              type="password"
              autoFocus
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field text-center"
              placeholder="Room password"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busy || !password}
                className="btn-primary flex-1 justify-center"
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <LockOpen size={15} />
                )}
                Unlock
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowInput(false);
                  setPassword("");
                  setError(null);
                }}
                className="icon-btn h-9 w-9"
                title="Cancel"
              >
                <X size={15} />
              </button>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
        )}
        {!showInput && error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </section>
  );
}

// Admin-only control in an unlocked room's header: lock / change / remove.
function RoomLockButton({
  room,
  onChanged,
}: {
  room: Room;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/lock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed");
      setOpen(false);
      setPassword("");
      onChanged();
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(false);
    }
  }

  async function removeLock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/lock`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setOpen(false);
      onChanged();
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title={room.locked ? "Locked — manage" : "Lock room"}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-700 dark:text-slate-500"
      >
        {room.locked ? (
          <Lock size={14} className="text-amber-600 dark:text-slate-200" />
        ) : (
          <LockOpen size={14} />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-60 rounded-2xl border border-white/60 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/95">
          <form onSubmit={lock} className="space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {room.locked ? "Change room password" : "Lock this room"}
            </p>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="Password (min 4 chars)"
            />
            <button
              type="submit"
              disabled={busy || password.length < 4}
              className="btn-primary w-full justify-center"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}
              {room.locked ? "Update password" : "Lock room"}
            </button>
          </form>
          {room.locked && (
            <button
              onClick={removeLock}
              disabled={busy}
              className="btn-ghost mt-2 w-full justify-center text-red-500"
            >
              <Trash2 size={14} />
              Remove lock
            </button>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

function DeviceGroup({
  device,
  isAdmin,
  state,
  rooms,
  onCommand,
  onPoll,
  onChanged,
}: {
  device: UiDevice;
  isAdmin: boolean;
  state?: DeviceStatusState;
  rooms: { id: string; name: string }[];
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onPoll: (deviceId: string) => void;
  onChanged: () => void;
}) {
  const [open, toggle] = usePersistedOpen(`dev-open:${device.id}`);

  // Poll this device's status ONLY while it's expanded and the tab is visible.
  useEffect(() => {
    if (!open) return;
    const id = device.id;
    const tick = () => {
      if (document.visibilityState === "visible") onPoll(id);
    };
    tick(); // immediate on expand
    const timer = setInterval(tick, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") onPoll(id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, device.id, onPoll]);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [draftRoom, setDraftRoom] = useState(device.roomId);
  const [saving, setSaving] = useState(false);

  const reachable = state?.reachable ?? null;
  const scanning = state?.scanning ?? false;
  const values = state?.values ?? {};
  const controllable = device.functions.filter((f) =>
    ["Boolean", "Enum", "Integer"].includes(f.type),
  );
  const onCount = controllable.filter(
    (f) => f.type === "Boolean" && values[f.code] === true,
  ).length;

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, roomId: draftRoom }),
      });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const status =
    reachable === true
      ? { cls: "text-emerald-600 dark:text-slate-300", icon: <Wifi size={11} /> }
      : scanning
        ? { cls: "text-sky-600 dark:text-slate-300", icon: <Loader2 size={11} className="animate-spin" /> }
        : reachable === false
          ? { cls: "text-amber-600 dark:text-slate-300", icon: <WifiOff size={11} /> }
          : { cls: "text-slate-400 dark:text-slate-500", icon: <Wifi size={11} /> };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/45 dark:border-white/10 bg-white/25 dark:bg-white/[0.04] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <button
          onClick={toggle}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown
            size={15}
            className={`shrink-0 text-slate-500 dark:text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
          <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-slate-200">
            {device.name}
          </span>
          <span className={`shrink-0 ${status.cls}`}>{status.icon}</span>
          {onCount > 0 && (
            <span className="shrink-0 text-xs font-medium text-brand-700 dark:text-white">
              {onCount} on
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={() => {
              setDraftName(device.name);
              setDraftRoom(device.roomId);
              setEditing((v) => !v);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-800"
            title="Rename / move"
          >
            {editing ? <X size={13} /> : <Pencil size={12} />}
          </button>
        )}
      </div>

      {/* Smoothly animated collapse */}
      <div className={`collapse-grid ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-2.5 pb-2.5">
            {editing && (
              <div className="mb-2.5 space-y-2 rounded-xl border border-white/60 dark:border-white/10 bg-white/60 p-3 backdrop-blur-md">
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Device name"
                  className="field"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={draftRoom}
                    onChange={(e) => setDraftRoom(e.target.value)}
                    className="field flex-1"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={save} disabled={saving} className="btn-primary">
                    {saving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    Save
                  </button>
                </div>
              </div>
            )}

            {controllable.length === 0 ? (
              <p className="px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">
                No controllable actions.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {controllable.map((fn) => (
                  <ControlTile
                    key={fn.code}
                    fn={fn}
                    value={values[fn.code]}
                    disabled={reachable === false}
                    onChange={(v) => onCommand(device.id, fn.code, v)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
