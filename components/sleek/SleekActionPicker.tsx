"use client";

import { useMemo, useState } from "react";
import { Plus, Clock } from "lucide-react";
import type { DeviceFunction, Room } from "@/lib/types";
import { CONTROLLABLE, enumLabel } from "./labels";

// One composed action/condition: pick device (grouped by room) → control →
// value. Emits { deviceId, code, value, delayMs? } via onAdd. Shared big-button
// picker used by the Sleek routine and automation builders. `showDelay` adds a
// per-action delay field (routines only); `addLabel` names the button.
export default function SleekActionPicker({
  rooms,
  onAdd,
  addLabel = "Add action",
  showDelay = false,
}: {
  rooms: Room[];
  onAdd: (a: { deviceId: string; code: string; value: unknown; delayMs?: number }) => void;
  addLabel?: string;
  showDelay?: boolean;
}) {
  // Only rooms/devices with a controllable (non-BT) function.
  const usableRooms = useMemo(
    () =>
      rooms
        .map((r) => ({
          ...r,
          devices: r.devices.filter((d) => !d.bluetooth && d.functions.some((f) => CONTROLLABLE.includes(f.type))),
        }))
        .filter((r) => r.devices.length > 0),
    [rooms],
  );
  const roomById = useMemo(() => new Map(usableRooms.map((r) => [r.id, r])), [usableRooms]);

  const [roomId, setRoomId] = useState(usableRooms[0]?.id ?? "");
  const devicesInRoom = roomById.get(roomId)?.devices ?? [];
  const [devId, setDevId] = useState(devicesInRoom[0]?.id ?? "");
  const device = devicesInRoom.find((d) => d.id === devId) ?? devicesInRoom[0];
  const fns = (device?.functions ?? []).filter((f) => CONTROLLABLE.includes(f.type));
  const [code, setCode] = useState(fns[0]?.code ?? "");
  const fn = fns.find((f) => f.code === code) ?? fns[0];
  const [value, setValue] = useState<unknown>(defaultValue(fn));
  const [delayMs, setDelayMs] = useState(0);

  function onRoom(id: string) {
    setRoomId(id);
    const nd = (roomById.get(id)?.devices ?? [])[0];
    setDevId(nd?.id ?? "");
    const nf = (nd?.functions ?? []).filter((f) => CONTROLLABLE.includes(f.type));
    setCode(nf[0]?.code ?? "");
    setValue(defaultValue(nf[0]));
  }
  function onDevice(id: string) {
    setDevId(id);
    const nd = devicesInRoom.find((d) => d.id === id);
    const nf = (nd?.functions ?? []).filter((f) => CONTROLLABLE.includes(f.type));
    setCode(nf[0]?.code ?? "");
    setValue(defaultValue(nf[0]));
  }
  function onControl(c: string) {
    setCode(c);
    setValue(defaultValue(fns.find((f) => f.code === c)));
  }

  function add() {
    if (!devId || !code) return;
    onAdd({ deviceId: devId, code, value, delayMs: showDelay ? Math.max(0, delayMs) : undefined });
  }

  if (usableRooms.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No controllable devices to add.</p>;
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.05]">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select value={roomId} onChange={(e) => onRoom(e.target.value)} className="field !py-2.5">
          {usableRooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={devId} onChange={(e) => onDevice(e.target.value)} className="field !py-2.5">
          {devicesInRoom.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select value={code} onChange={(e) => onControl(e.target.value)} className="field !py-2.5">
          {fns.map((f) => (
            <option key={f.code} value={f.code}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {fn && (
        <div className="mt-3">
          <ValueEditor fn={fn} value={value} onChange={setValue} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {showDelay && (
          <div className="flex items-center gap-1.5 rounded-xl border border-white/60 bg-white/55 px-2.5 dark:border-white/10 dark:bg-white/[0.07]">
            <Clock size={14} className="text-slate-400" />
            <input
              type="number"
              min={0}
              step={100}
              value={delayMs}
              onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value)))}
              className="w-16 bg-transparent py-2 text-sm text-slate-900 outline-none dark:text-slate-100"
              title="Delay before this action (ms)"
            />
            <span className="pr-1 text-xs text-slate-400">ms</span>
          </div>
        )}
        <button onClick={add} disabled={!code} className="btn-primary flex-1 justify-center">
          <Plus size={15} />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

// Big-button value editor: Boolean → On/Off; Enum → one button per option;
// Integer → a slider with a live label.
function ValueEditor({
  fn,
  value,
  onChange,
}: {
  fn: DeviceFunction;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (fn.type === "Boolean") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: true, label: "On" },
          { v: false, label: "Off" },
        ].map((o) => (
          <button
            key={o.label}
            onClick={() => onChange(o.v)}
            className={pill(value === o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (fn.type === "Enum") {
    const opts = fn.range ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={pill(String(value) === String(o))}>
            {enumLabel(o, fn)}
          </button>
        ))}
      </div>
    );
  }
  // Integer
  const min = fn.min ?? 0;
  const max = fn.max ?? 100;
  const step = fn.step && fn.step > 0 ? fn.step : 1;
  const n = Number(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(n) ? n : min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-brand-500"
      />
      <span className="w-16 shrink-0 text-right text-sm font-medium text-slate-700 dark:text-slate-200">
        {Number.isFinite(n) ? n : min}
        {fn.unit ?? ""}
      </span>
    </div>
  );
}

function pill(active: boolean): string {
  return `rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
    active ? "bg-brand-500 text-white shadow" : "bg-black/[0.03] text-slate-600 dark:bg-white/[0.05] dark:text-slate-300"
  }`;
}

// Sensible starting value for a freshly-picked control.
function defaultValue(fn?: DeviceFunction): unknown {
  if (!fn) return true;
  if (fn.type === "Boolean") return true;
  if (fn.type === "Enum") return fn.range?.[0] ?? "";
  if (fn.type === "Integer") return fn.max ?? fn.min ?? 0;
  return true;
}
