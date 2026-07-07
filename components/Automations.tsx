"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, X, Check, Zap, ArrowRight, Pencil, Power } from "lucide-react";
import type {
  Room,
  DeviceFunction,
  UiDevice,
  Automation,
  AutomationCondition,
  AutomationAction,
} from "@/lib/types";

type Clause = { deviceId: string; code: string; value: unknown };

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

const FIELD =
  "w-full rounded-xl border border-white/60 dark:border-white/10 bg-white/55 dark:bg-white/[0.07] px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none backdrop-blur-md transition-colors focus:border-brand-500 focus:bg-white/80";

export default function Automations({ rooms, isAdmin }: { rooms: Room[]; isAdmin: boolean }) {
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [builder, setBuilder] = useState<
    { mode: "new" } | { mode: "edit"; automation: Automation } | null
  >(null);
  const [busy, setBusy] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, { device: UiDevice; room: Room }>();
    for (const room of rooms) for (const device of room.devices) m.set(device.id, { device, room });
    return m;
  }, [rooms]);

  const describe = useCallback(
    (c: Clause) => {
      const entry = byId.get(c.deviceId);
      const fn = entry?.device.functions.find((f) => f.code === c.code);
      return {
        device: entry?.device.name ?? "?",
        room: entry?.room.name ?? "",
        control: fn?.name ?? c.code,
        value: valueLabel(fn, c.value),
      };
    },
    [byId],
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/automations");
    if (res.ok) setAutomations((await res.json()).automations);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Automation) {
    setBusy(a.id);
    try {
      await fetch(`/api/automations/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function del(id: string) {
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    load();
  }

  if (builder) {
    return (
      <AutomationBuilder
        rooms={rooms}
        initial={builder.mode === "edit" ? builder.automation : undefined}
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
          {automations ? `${automations.length} automation${automations.length === 1 ? "" : "s"}` : "…"}
          {!isAdmin && automations && automations.length > 0 && (
            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">· view only</span>
          )}
        </p>
        {isAdmin && (
          <button onClick={() => setBuilder({ mode: "new" })} className="btn-primary">
            <Plus size={15} />
            New automation
          </button>
        )}
      </div>

      {automations && automations.length === 0 && (
        <div className="card mx-auto mt-8 max-w-lg p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-600 dark:bg-white/10 dark:text-slate-200">
            <Zap size={26} />
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No automations yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            An automation runs actions when a condition is met — e.g. <em>if</em> the
            FBR study light turns on, <em>then</em> set the fan to medium.
          </p>
          {isAdmin && (
            <button onClick={() => setBuilder({ mode: "new" })} className="btn-primary mx-auto mt-5">
              <Plus size={16} />
              Create your first automation
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        {(automations ?? []).map((a) => (
          <div
            key={a.id}
            className={`card flex flex-col p-5 ${a.enabled ? "" : "opacity-60"}`}
          >
            <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  {a.name}
                </h3>
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {a.enabled ? "Active" : "Disabled"}
                </span>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggle(a)}
                    disabled={busy === a.id}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                      a.enabled
                        ? "text-brand-600 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-white/10"
                        : "text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-white/10"
                    }`}
                    title={a.enabled ? "Disable" : "Enable"}
                  >
                    {busy === a.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={14} />}
                  </button>
                  <button
                    onClick={() => setBuilder({ mode: "edit", automation: a })}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/10"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => del(a.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <ClauseList
              label={`IF ${a.match === "all" ? "· all match" : "· any match"}`}
              tone="if"
              clauses={a.conditions}
              describe={describe}
              joiner={a.match === "all" ? "AND" : "OR"}
            />
            <div className="my-2 flex items-center gap-2 px-1 text-slate-300 dark:text-slate-600">
              <ArrowRight size={14} />
            </div>
            <ClauseList label="THEN" tone="then" clauses={a.actions} describe={describe} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ClauseList({
  label,
  tone,
  clauses,
  describe,
  joiner,
}: {
  label: string;
  tone: "if" | "then";
  clauses: (AutomationCondition | AutomationAction)[];
  describe: (c: Clause) => { device: string; room: string; control: string; value: string };
  joiner?: string;
}) {
  return (
    <div>
      <p
        className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
          tone === "if" ? "text-brand-600 dark:text-slate-300" : "text-emerald-600 dark:text-emerald-300"
        }`}
      >
        {label}
      </p>
      <ul className="space-y-1">
        {clauses.map((c, i) => {
          const d = describe(c);
          return (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
              {joiner && i > 0 && (
                <span className="mr-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">{joiner}</span>
              )}
              <span className="text-slate-400 dark:text-slate-500">{d.device}</span> {d.control}{" "}
              <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
              <span className="font-medium text-slate-900 dark:text-slate-100">{d.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AutomationBuilder({
  rooms,
  initial,
  onSaved,
  onCancel,
}: {
  rooms: Room[];
  initial?: Automation;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(initial?.match ?? "all");
  const [conditions, setConditions] = useState<Clause[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<Clause[]>(initial?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, UiDevice>();
    for (const r of rooms) for (const d of r.devices) m.set(d.id, d);
    return m;
  }, [rooms]);

  const lookup = (c: Clause) => {
    const d = byId.get(c.deviceId);
    const f = d?.functions.find((x) => x.code === c.code);
    return { device: d?.name ?? "?", control: f?.name ?? c.code, value: valueLabel(f, c.value) };
  };

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the automation a name");
    if (conditions.length === 0) return setError("Add at least one IF condition");
    if (actions.length === 0) return setError("Add at least one THEN action");
    setSaving(true);
    try {
      const url = initial ? `/api/automations/${initial.id}` : "/api/automations";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), match, conditions, actions, enabled: initial?.enabled ?? true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="card mx-auto max-w-2xl animate-fade-in p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {initial ? "Edit automation" : "New automation"}
        </h2>
        <button onClick={onCancel} className="icon-btn h-8 w-8">
          <X size={15} />
        </button>
      </div>

      <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Study light on → fan medium"
        className="field mb-5"
        autoFocus
      />

      {/* IF */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-slate-300">
            IF
          </span>
          <div className="inline-flex rounded-lg border border-white/60 bg-white/40 p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
            <button
              onClick={() => setMatch("all")}
              className={`rounded-md px-2.5 py-1 font-medium ${match === "all" ? "bg-white text-slate-900 shadow-sm dark:bg-white/90" : "text-slate-500 dark:text-slate-300"}`}
            >
              Match ALL (and)
            </button>
            <button
              onClick={() => setMatch("any")}
              className={`rounded-md px-2.5 py-1 font-medium ${match === "any" ? "bg-white text-slate-900 shadow-sm dark:bg-white/90" : "text-slate-500 dark:text-slate-300"}`}
            >
              Match ANY (or)
            </button>
          </div>
        </div>
        <ClauseEditor
          rooms={rooms}
          clauses={conditions}
          setClauses={setConditions}
          lookup={lookup}
          joiner={match === "all" ? "AND" : "OR"}
        />
      </div>

      {/* THEN */}
      <div className="mb-4">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          THEN
        </span>
        <ClauseEditor rooms={rooms} clauses={actions} setClauses={setActions} lookup={lookup} />
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {initial ? "Save changes" : "Save automation"}
        </button>
      </div>
    </div>
  );
}

// Editable list of clauses (device → control → value) shared by IF and THEN.
function ClauseEditor({
  rooms,
  clauses,
  setClauses,
  lookup,
  joiner,
}: {
  rooms: Room[];
  clauses: Clause[];
  setClauses: (fn: (c: Clause[]) => Clause[]) => void;
  lookup: (c: Clause) => { device: string; control: string; value: string };
  joiner?: string;
}) {
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const byId = useMemo(() => {
    const m = new Map<string, UiDevice>();
    for (const r of rooms) for (const d of r.devices) m.set(d.id, d);
    return m;
  }, [rooms]);

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const devicesInRoom = roomById.get(roomId)?.devices ?? [];
  const [devId, setDevId] = useState(devicesInRoom[0]?.id ?? "");
  const fns = devId ? controllable(byId.get(devId) ?? ({ functions: [] } as any)) : [];
  const [code, setCode] = useState<string>(fns[0]?.code ?? "");
  const fn = fns.find((f) => f.code === code);
  const [value, setValue] = useState<unknown>(defaultValue(fn));

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

  function add() {
    if (!devId || !code) return;
    setClauses((cs) => [...cs, { deviceId: devId, code, value }]);
  }

  return (
    <div>
      {clauses.length > 0 && (
        <ul className="mb-2 space-y-2">
          {clauses.map((c, i) => {
            const l = lookup(c);
            return (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06]"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">
                  {joiner && i > 0 && (
                    <span className="mr-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">{joiner}</span>
                  )}
                  <span className="text-slate-400 dark:text-slate-500">{l.device}</span> {l.control}{" "}
                  <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">{l.value}</span>
                </span>
                <button
                  onClick={() => setClauses((x) => x.filter((_, j) => j !== i))}
                  className="shrink-0 text-slate-400 hover:text-red-500 dark:text-slate-500"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-2xl border border-white/60 bg-white/40 p-3 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={roomId} onChange={(e) => onRoomChange(e.target.value)} className={FIELD}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select value={devId} onChange={(e) => onDeviceChange(e.target.value)} className={FIELD}>
            {devicesInRoom.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select value={code} onChange={(e) => onControlChange(e.target.value)} className={FIELD}>
            {fns.map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
          </select>
          <ValueInput fn={fn} value={value} onChange={setValue} field={FIELD} />
        </div>
        <button onClick={add} disabled={!code} className="btn-ghost mt-2 w-full justify-center">
          <Plus size={15} />
          Add
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
      <select value={value === true ? "on" : "off"} onChange={(e) => onChange(e.target.value === "on")} className={field}>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    );
  }
  if (fn.type === "Enum") {
    return (
      <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={field}>
        {(fn.range ?? []).map((o) => (
          <option key={o} value={o}>
            {/^\d+$/.test(o) ? `${o}${fn.unit ?? "%"}` : o}
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
