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
  Shield,
  ShieldAlert,
} from "lucide-react";
import type { Room, UiDevice } from "@/lib/types";
import ControlTile from "./ControlTile";
import FavouritableControl from "./FavouritableControl";
import { favKey } from "./favKey";

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
  favourites,
  live,
  onCommand,
  onPoll,
  onToggleFavourite,
  onChanged,
}: {
  room: Room;
  index?: number;
  isAdmin: boolean;
  statusByDevice: Record<string, DeviceStatusState>;
  rooms: { id: string; name: string }[];
  favourites: Set<string>;
  live: boolean;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onPoll: (deviceId: string) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
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
    <RoomCardInner
      room={room}
      open={open}
      toggle={toggle}
      onCount={onCount}
      isAdmin={isAdmin}
      statusByDevice={statusByDevice}
      rooms={rooms}
      favourites={favourites}
      live={live}
      onCommand={onCommand}
      onPoll={onPoll}
      onToggleFavourite={onToggleFavourite}
      onChanged={onChanged}
      index={index}
    />
  );
}

function RoomCardInner({
  room,
  open,
  toggle,
  onCount,
  isAdmin,
  statusByDevice,
  rooms,
  favourites,
  live,
  onCommand,
  onPoll,
  onToggleFavourite,
  onChanged,
  index,
}: {
  room: Room;
  open: boolean;
  toggle: () => void;
  onCount: number;
  isAdmin: boolean;
  statusByDevice: Record<string, DeviceStatusState>;
  rooms: { id: string; name: string }[];
  favourites: Set<string>;
  live: boolean;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onPoll: (deviceId: string) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
  onChanged: () => void;
  index: number;
}) {
  const [renaming, setRenaming] = useState(false);
  const [roomDraft, setRoomDraft] = useState(room.name);
  const [savingRoom, setSavingRoom] = useState(false);

  async function saveRoomName(e: React.FormEvent) {
    e.preventDefault();
    const name = roomDraft.trim();
    if (!name) return;
    setSavingRoom(true);
    try {
      await fetch(`/api/rooms/${room.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setRenaming(false);
      onChanged();
    } finally {
      setSavingRoom(false);
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
        {renaming ? (
          <form onSubmit={saveRoomName} className="flex min-w-0 flex-1 items-center gap-2">
            <input
              autoFocus
              value={roomDraft}
              onChange={(e) => setRoomDraft(e.target.value)}
              placeholder="Room name"
              className="field"
            />
            <button
              type="submit"
              disabled={savingRoom || !roomDraft.trim()}
              className="icon-btn h-8 w-8 shrink-0"
              title="Save"
            >
              {savingRoom ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="icon-btn h-8 w-8 shrink-0"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </form>
        ) : (
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
        )}
        {isAdmin && !renaming && (
          <button
            onClick={() => {
              setRoomDraft(room.name);
              setRenaming(true);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-700 dark:text-slate-500"
            title="Rename room"
          >
            <Pencil size={13} />
          </button>
        )}
        {isAdmin && <RoomLockButton room={room} onChanged={onChanged} />}
        {!renaming && (
          <button onClick={toggle} aria-label="Expand room" className="shrink-0">
            <ChevronDown
              size={20}
              className={`text-slate-500 dark:text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            />
          </button>
        )}
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
              favourites={favourites}
              live={live}
              onCommand={onCommand}
              onPoll={onPoll}
              onToggleFavourite={onToggleFavourite}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const CONTROLLABLE = ["Boolean", "Enum", "Integer"];

// The device edit panel sits on a light frosted card in BOTH themes, so its
// inputs always use dark text (the default `.field` flips to light text in dark
// mode, which is unreadable here).
const PANEL_FIELD =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500";

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
  favourites,
  live,
  onCommand,
  onPoll,
  onToggleFavourite,
  onChanged,
}: {
  device: UiDevice;
  isAdmin: boolean;
  state?: DeviceStatusState;
  rooms: { id: string; name: string }[];
  favourites: Set<string>;
  live: boolean;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onPoll: (deviceId: string) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
  onChanged: () => void;
}) {
  const [open, toggle] = usePersistedOpen(`dev-open:${device.id}`);

  // Poll this device's status ONLY while it's expanded and the tab is visible —
  // and only when NOT live. When the SSE stream is connected, state arrives via
  // the initial snapshot + real-time push, so no polling is needed.
  useEffect(() => {
    if (!open || live) return;
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
  }, [open, device.id, onPoll, live]);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(device.name);
  const [draftRoom, setDraftRoom] = useState(device.roomId);
  const [draftControls, setDraftControls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingCmd, setPendingCmd] = useState<{ code: string; value: unknown } | null>(null);
  const [unprotectCode, setUnprotectCode] = useState<string | null>(null);
  const [protecting, setProtecting] = useState(false);

  const reachable = state?.reachable ?? null;
  const scanning = state?.scanning ?? false;
  const values = state?.values ?? {};
  const controllable = device.functions.filter((f) =>
    ["Boolean", "Enum", "Integer"].includes(f.type),
  );
  const hasProtected = controllable.some((f) => f.protected);
  const onCount = controllable.filter(
    (f) => f.type === "Boolean" && values[f.code] === true,
  ).length;

  const controlName = (code: string) =>
    controllable.find((f) => f.code === code)?.name ?? code;

  // Protected controls: non-admins can't command; admins must confirm first.
  function requestCommand(code: string, value: unknown) {
    const isProt = !!controllable.find((f) => f.code === code)?.protected;
    if (isProt && !isAdmin) return;
    if (isProt && isAdmin) {
      setPendingCmd({ code, value });
      return;
    }
    onCommand(device.id, code, value);
  }

  async function setControlProtected(code: string, next: boolean) {
    setProtecting(true);
    try {
      await fetch(`/api/devices/${device.id}/protect`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, protected: next }),
      });
      setUnprotectCode(null);
      onChanged();
    } finally {
      setProtecting(false);
    }
  }

  function startEditing() {
    setDraftName(device.name);
    setDraftRoom(device.roomId);
    setDraftControls(
      Object.fromEntries(controllable.map((f) => [f.code, f.name])),
    );
    setEditing((v) => !v);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          roomId: draftRoom,
          controls: draftControls,
        }),
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
          {hasProtected && (
            <Shield
              size={12}
              className="shrink-0 text-brand-600 dark:text-slate-200"
            />
          )}
          <span className={`shrink-0 ${status.cls}`}>{status.icon}</span>
          {onCount > 0 && (
            <span className="shrink-0 text-xs font-medium text-brand-700 dark:text-white">
              {onCount} on
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={startEditing}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-800"
            title="Rename / move / relabel controls"
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
                  className={PANEL_FIELD}
                />
                <select
                  value={draftRoom}
                  onChange={(e) => setDraftRoom(e.target.value)}
                  className={PANEL_FIELD}
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                {controllable.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-white/60 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.05]">
                    <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Control labels & protection
                    </p>
                    {controllable.map((f) => (
                      <div key={f.code} className="flex items-center gap-1.5">
                        <input
                          value={draftControls[f.code] ?? ""}
                          onChange={(e) =>
                            setDraftControls((c) => ({ ...c, [f.code]: e.target.value }))
                          }
                          placeholder={f.code}
                          className={PANEL_FIELD}
                        />
                        <button
                          type="button"
                          disabled={protecting}
                          onClick={() =>
                            f.protected
                              ? setUnprotectCode(f.code)
                              : setControlProtected(f.code, true)
                          }
                          title={
                            f.protected
                              ? "Protected — click to remove protection"
                              : "Protect this control (never auto-toggled; admin-only)"
                          }
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border disabled:opacity-50 ${
                            f.protected
                              ? "border-brand-500 bg-brand-500/10 text-brand-600"
                              : "border-slate-300 bg-white text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          <Shield size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary w-full justify-center"
                >
                  {saving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  Save
                </button>
              </div>
            )}

            {hasProtected && !isAdmin && (
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-brand-600 dark:text-slate-300">
                <Shield size={12} /> Protected controls can only be changed by an admin.
              </p>
            )}
            {controllable.length === 0 ? (
              <p className="px-1 pb-1 text-xs text-slate-500 dark:text-slate-400">
                No controllable actions.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
                {controllable.map((fn) => (
                  <FavouritableControl
                    key={fn.code}
                    fn={fn}
                    value={values[fn.code]}
                    disabled={reachable === false || (!!fn.protected && !isAdmin)}
                    isProtected={!!fn.protected}
                    isFavourite={favourites.has(favKey(device.id, fn.code))}
                    onToggleFavourite={() => onToggleFavourite(device.id, fn.code)}
                    onChange={(v) => requestCommand(fn.code, v)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm a command on a protected control (admin only) */}
      {pendingCmd && (
        <ConfirmModal
          title="Protected control"
          body={`"${controlName(pendingCmd.code)}" on ${device.name} is protected. Apply this change anyway?`}
          confirmLabel="Yes, change it"
          onCancel={() => setPendingCmd(null)}
          onConfirm={() => {
            onCommand(device.id, pendingCmd.code, pendingCmd.value);
            setPendingCmd(null);
          }}
        />
      )}

      {/* Confirm removing protection from a control */}
      {unprotectCode && (
        <ConfirmModal
          title="Remove protection?"
          body={`"${controlName(unprotectCode)}" will no longer be protected — routines and non-admins will be able to switch it off.`}
          confirmLabel="Remove protection"
          danger
          busy={protecting}
          onCancel={() => setUnprotectCode(null)}
          onConfirm={() => setControlProtected(unprotectCode, false)}
        />
      )}
    </div>
  );
}

// Small reusable confirmation dialog.
function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  danger,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="card w-full max-w-sm animate-scale-in p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              danger
                ? "bg-red-500/15 text-red-600 dark:bg-white/10 dark:text-slate-200"
                : "bg-brand-500/15 text-brand-600 dark:bg-white/10 dark:text-slate-200"
            }`}
          >
            {danger ? <ShieldAlert size={18} /> : <Shield size={18} />}
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h2>
        </div>
        <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">{body}</p>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            <X size={15} />
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`btn-primary ${danger ? "!bg-red-500" : ""}`}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
