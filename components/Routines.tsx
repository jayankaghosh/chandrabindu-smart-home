"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Play,
  Plus,
  Trash2,
  Loader2,
  X,
  Check,
  Sparkles,
  ArrowRight,
  Pencil,
  Clock,
} from "lucide-react";
import type {
  Room,
  DeviceFunction,
  EnrichedRoutine,
  UiDevice,
} from "@/lib/types";

type Draft = { deviceId: string; code: string; value: unknown; delayMs: number };

const controllable = (d: UiDevice) =>
  d.functions.filter((f) => ["Boolean", "Enum", "Integer"].includes(f.type));

function defaultValue(fn?: DeviceFunction): unknown {
  if (!fn) return null;
  if (fn.type === "Boolean") return true;
  if (fn.type === "Enum") return fn.range?.[0] ?? "";
  if (fn.type === "Integer") return fn.min ?? 0;
  return null;
}

function valueLabel(fn: DeviceFunction | undefined, v: unknown): string {
  if (fn?.type === "Boolean") return v === true ? "On" : "Off";
  if (fn?.type === "Enum" && /^\d+$/.test(String(v))) return `${v}${fn.unit ?? "%"}`;
  return `${v}${fn?.unit ?? ""}`;
}

/** Group a routine's actions by room name, preserving first-seen order. */
function groupByRoom(actions: EnrichedRoutine["actions"]) {
  const groups: { room: string; items: EnrichedRoutine["actions"] }[] = [];
  for (const a of actions) {
    let g = groups.find((x) => x.room === a.roomName);
    if (!g) {
      g = { room: a.roomName, items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }
  return groups;
}

export default function Routines({
  rooms,
  isAdmin,
}: {
  rooms: Room[];
  isAdmin: boolean;
}) {
  const [routines, setRoutines] = useState<EnrichedRoutine[] | null>(null);
  const [builder, setBuilder] = useState<
    { mode: "new" } | { mode: "edit"; routine: EnrichedRoutine } | null
  >(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/routines");
    if (res.ok) setRoutines((await res.json()).routines);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(id: string) {
    setBusyRun(id);
    setMsg((m) => ({ ...m, [id]: "" }));
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      let summary: string;
      if (!d.failed && !d.ignoredLocked && !d.ignoredProtected) {
        summary = `Done · ${d.ok} action${d.ok === 1 ? "" : "s"}`;
      } else {
        const bits = [`${d.ok} ran`];
        if (d.failed) bits.push(`${d.failed} failed`);
        if (d.ignoredLocked)
          bits.push(
            `${d.ignoredLocked} skipped (locked room${d.ignoredLocked === 1 ? "" : "s"})`,
          );
        if (d.ignoredProtected)
          bits.push(
            `${d.ignoredProtected} skipped (protected)`,
          );
        summary = bits.join(" · ");
      }
      setMsg((m) => ({ ...m, [id]: summary }));
    } catch (e) {
      setMsg((m) => ({ ...m, [id]: (e as Error).message }));
    } finally {
      setBusyRun(null);
      setTimeout(() => setMsg((m) => ({ ...m, [id]: "" })), 5000);
    }
  }

  async function del(id: string) {
    await fetch(`/api/routines/${id}`, { method: "DELETE" });
    load();
  }

  if (builder) {
    return (
      <RoutineBuilder
        rooms={rooms}
        initial={builder.mode === "edit" ? builder.routine : undefined}
        onCancel={() => setBuilder(null)}
        onSaved={() => {
          setBuilder(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between px-1">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {routines ? `${routines.length} routine${routines.length === 1 ? "" : "s"}` : "…"}
        </p>
        {isAdmin && (
          <button onClick={() => setBuilder({ mode: "new" })} className="btn-primary">
            <Plus size={15} />
            New routine
          </button>
        )}
      </div>

      {routines && routines.length === 0 && (
        <div className="card mx-auto mt-8 max-w-lg p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 dark:bg-white/10 text-brand-600 dark:text-slate-200">
            <Sparkles size={26} />
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No routines yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            A routine runs several device actions at once — like “MBR dim light”
            turning on the striplight, setting the fan to 50, and lights off.
          </p>
          {isAdmin && (
            <button
              onClick={() => setBuilder({ mode: "new" })}
              className="btn-primary mx-auto mt-5"
            >
              <Plus size={16} />
              Create your first routine
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
        {(routines ?? []).map((r) => (
          <div key={r.id} className="card flex h-[320px] flex-col p-5">
            <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
              <h3 className="text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {r.name}
              </h3>
              {isAdmin && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setBuilder({ mode: "edit", routine: r })}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    title="Edit routine"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => del(r.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Delete routine"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="mb-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
              {groupByRoom(r.actions).map((g) => (
                <div key={g.room}>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {g.room}
                  </p>
                  <ul className="space-y-1.5">
                    {g.items.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                      >
                        <span className="truncate">{a.controlName}</span>
                        <ArrowRight size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
                        <span className="shrink-0 font-medium text-slate-900 dark:text-slate-100">
                          {a.valueLabel}
                        </span>
                        {a.delayMs ? (
                          <span className="flex shrink-0 items-center gap-0.5 text-xs text-slate-400 dark:text-slate-500">
                            <Clock size={10} />
                            {a.delayMs}ms
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => run(r.id)}
                disabled={busyRun === r.id}
                className="btn-primary"
              >
                {busyRun === r.id ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Play size={15} />
                )}
                Run
              </button>
              {msg[r.id] && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{msg[r.id]}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutineBuilder({
  rooms,
  initial,
  onSaved,
  onCancel,
}: {
  rooms: Room[];
  initial?: EnrichedRoutine;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [actions, setActions] = useState<Draft[]>(
    initial?.actions.map((a) => ({
      deviceId: a.deviceId,
      code: a.code,
      value: a.value,
      delayMs: a.delayMs ?? 0,
    })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allDevices = useMemo(() => rooms.flatMap((r) => r.devices), [rooms]);
  const byId = useMemo(
    () => new Map(allDevices.map((d) => [d.id, d])),
    [allDevices],
  );
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const devicesInRoom = roomById.get(roomId)?.devices ?? [];
  const [devId, setDevId] = useState(devicesInRoom[0]?.id ?? "");
  const fns = devId
    ? controllable(byId.get(devId) ?? ({ functions: [] } as any))
    : [];
  const [code, setCode] = useState<string>(fns[0]?.code ?? "");
  const fn = fns.find((f) => f.code === code);
  const [value, setValue] = useState<unknown>(defaultValue(fn));
  const [delayMs, setDelayMs] = useState(0);

  function onRoomChange(id: string) {
    setRoomId(id);
    const nd = (roomById.get(id)?.devices ?? [])[0];
    setDevId(nd?.id ?? "");
    const nf = nd ? controllable(nd) : [];
    setCode(nf[0]?.code ?? "");
    setValue(defaultValue(nf[0]));
  }
  function onDeviceChange(id: string) {
    setDevId(id);
    const nf = controllable(byId.get(id) ?? ({ functions: [] } as any));
    setCode(nf[0]?.code ?? "");
    setValue(defaultValue(nf[0]));
  }
  function onControlChange(c: string) {
    setCode(c);
    setValue(defaultValue(fns.find((f) => f.code === c)));
  }

  function addAction() {
    if (!devId || !code) return;
    setActions((a) => [
      ...a,
      { deviceId: devId, code, value, delayMs: Math.max(0, delayMs) },
    ]);
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the routine a name");
    if (actions.length === 0) return setError("Add at least one action");
    setSaving(true);
    try {
      const url = initial ? `/api/routines/${initial.id}` : "/api/routines";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), actions }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const lookup = (a: Draft) => {
    const d = byId.get(a.deviceId);
    const f = d?.functions.find((x) => x.code === a.code);
    return {
      deviceName: d?.name ?? "?",
      controlName: f?.name ?? a.code,
      label: valueLabel(f, a.value),
    };
  };

  const field2 =
    "w-full rounded-xl border border-white/60 dark:border-white/10 bg-white/55 dark:bg-white/[0.07] px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none backdrop-blur-md transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:bg-white/80";

  return (
    <div className="card mx-auto max-w-xl animate-fade-in p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {initial ? "Edit routine" : "New routine"}
        </h2>
        <button onClick={onCancel} className="icon-btn h-8 w-8">
          <X size={15} />
        </button>
      </div>

      <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
        Routine name
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. MBR dim light"
        className="field mb-5"
        autoFocus
      />

      {actions.length > 0 && (
        <ul className="mb-4 space-y-2">
          {actions.map((a, i) => {
            const l = lookup(a);
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/60 dark:border-white/10 bg-white/50 dark:bg-white/[0.06] px-3 py-2 text-sm backdrop-blur-md"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">
                  <span className="text-slate-400 dark:text-slate-500">{l.deviceName}</span>{" "}
                  {l.controlName} <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">{l.label}</span>
                  {a.delayMs ? (
                    <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                      · after {a.delayMs}ms
                    </span>
                  ) : null}
                </span>
                <button
                  onClick={() => setActions((x) => x.filter((_, j) => j !== i))}
                  className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-red-500"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mb-4 rounded-2xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.05] p-3 backdrop-blur-md">
        <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Add an action</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={roomId} onChange={(e) => onRoomChange(e.target.value)} className={field2}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select value={devId} onChange={(e) => onDeviceChange(e.target.value)} className={field2}>
            {devicesInRoom.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select value={code} onChange={(e) => onControlChange(e.target.value)} className={field2}>
            {fns.map((f) => (
              <option key={f.code} value={f.code}>
                {f.name}
              </option>
            ))}
          </select>
          <ValueInput fn={fn} value={value} onChange={setValue} field={field2} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/60 dark:border-white/10 bg-white/55 dark:bg-white/[0.07] px-2.5 backdrop-blur-md">
            <Clock size={14} className="text-slate-400 dark:text-slate-500" />
            <input
              type="number"
              min={0}
              step={100}
              value={delayMs}
              onChange={(e) => setDelayMs(Math.max(0, Number(e.target.value)))}
              className="w-20 bg-transparent py-2 text-sm text-slate-900 dark:text-slate-100 outline-none"
              title="Delay before this action (ms)"
            />
            <span className="pr-1 text-xs text-slate-400 dark:text-slate-500">ms</span>
          </div>
          <button onClick={addAction} disabled={!code} className="btn-ghost flex-1">
            <Plus size={15} />
            Add action
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {initial ? "Save changes" : "Save routine"}
        </button>
      </div>
    </div>
  );
}

function ValueInput({
  fn,
  value,
  onChange,
  field,
}: {
  fn?: DeviceFunction;
  value: unknown;
  onChange: (v: unknown) => void;
  field: string;
}) {
  if (!fn) return <div className={field}>—</div>;
  if (fn.type === "Boolean") {
    return (
      <select
        value={value === true ? "on" : "off"}
        onChange={(e) => onChange(e.target.value === "on")}
        className={field}
      >
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    );
  }
  if (fn.type === "Enum") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      >
        {(fn.range ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      min={fn.min}
      max={fn.max}
      step={fn.step ?? 1}
      value={typeof value === "number" ? value : (fn.min ?? 0)}
      onChange={(e) => onChange(Number(e.target.value))}
      className={field}
    />
  );
}
