"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, X, Check, Zap, ArrowRight, Pencil, Power, Clock, Sunrise, Sparkles } from "lucide-react";
import type {
  Room,
  DeviceFunction,
  UiDevice,
  Automation,
  AutomationCondition,
  AutomationAction,
} from "@/lib/types";
import { isTriggerCondition, isRoutineAction } from "@/lib/types";

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

/** Short label for a time/sun trigger condition. */
function triggerLabel(c: AutomationCondition): string {
  if (c.type === "time") return `At ${c.time}`;
  if (c.type === "sun") {
    const off = c.offsetMin ?? 0;
    return `At ${c.event}${off === 0 ? "" : off > 0 ? ` +${off} min` : ` ${off} min`}`;
  }
  return "";
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

  const [routineNames, setRoutineNames] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const res = await fetch("/api/automations");
    if (res.ok) setAutomations((await res.json()).automations);
  }, []);
  useEffect(() => {
    load();
    fetch("/api/routines")
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, string> = {};
        for (const r of d.routines ?? []) map[r.id] = r.name;
        setRoutineNames(map);
      })
      .catch(() => {});
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

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
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
            <ClauseList label="THEN" tone="then" clauses={a.actions} describe={describe} routineNames={routineNames} />
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
  routineNames,
}: {
  label: string;
  tone: "if" | "then";
  clauses: (AutomationCondition | AutomationAction)[];
  describe: (c: Clause) => { device: string; room: string; control: string; value: string };
  joiner?: string;
  routineNames?: Record<string, string>;
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
          const trigger = isTriggerCondition(c as AutomationCondition);
          const routine = isRoutineAction(c as AutomationAction);
          const d = trigger || routine ? null : describe(c as Clause);
          return (
            <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
              {joiner && i > 0 && (
                <span className="mr-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">{joiner}</span>
              )}
              {routine ? (
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  ▶ Run {routineNames?.[(c as { routineId: string }).routineId] ?? "routine"}
                </span>
              ) : trigger ? (
                <span className="font-medium text-slate-900 dark:text-slate-100">{triggerLabel(c as AutomationCondition)}</span>
              ) : (
                <>
                  <span className="text-slate-400 dark:text-slate-500">{d!.device}</span> {d!.control}{" "}
                  <span className="text-slate-300 dark:text-slate-600">→</span>{" "}
                  <span className="font-medium text-slate-900 dark:text-slate-100">{d!.value}</span>
                </>
              )}
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
  const [conditions, setConditions] = useState<AutomationCondition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<AutomationAction[]>(initial?.actions ?? []);

  // Device actions drive the shared ClauseEditor; routine actions are kept
  // alongside and edited by the RoutineActionEditor below.
  const deviceActions = actions.filter((a) => !isRoutineAction(a)) as Clause[];
  const setDeviceActions = (fn: (c: Clause[]) => Clause[]) =>
    setActions((prev) => {
      const routines = prev.filter(isRoutineAction);
      const next = fn(prev.filter((a) => !isRoutineAction(a)) as Clause[]);
      return [...next.map((d) => ({ type: "device" as const, ...d })), ...routines];
    });

  // The device-guard subset drives the shared ClauseEditor; triggers (time/sun)
  // are kept alongside and edited by the TriggerEditor below.
  const deviceConds = conditions.filter((c) => !isTriggerCondition(c)) as Clause[];
  const setDeviceConds = (fn: (c: Clause[]) => Clause[]) =>
    setConditions((prev) => {
      const triggers = prev.filter(isTriggerCondition);
      const next = fn(prev.filter((c) => !isTriggerCondition(c)) as Clause[]);
      return [...next.map((d) => ({ type: "device" as const, ...d })), ...triggers];
    });
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
          clauses={deviceConds}
          setClauses={setDeviceConds}
          lookup={lookup}
          joiner={match === "all" ? "AND" : "OR"}
        />
        <TriggerEditor
          triggers={conditions.filter(isTriggerCondition)}
          onAdd={(t) => setConditions((prev) => [...prev, t])}
          onRemoveAt={(idx) => {
            // idx is within the trigger subset; map back to the full list.
            let seen = -1;
            setConditions((prev) => prev.filter((c) => (isTriggerCondition(c) ? ++seen !== idx : true)));
          }}
        />
      </div>

      {/* THEN */}
      <div className="mb-4">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
          THEN
        </span>
        <ClauseEditor rooms={rooms} clauses={deviceActions} setClauses={setDeviceActions} lookup={lookup} />
        <RoutineActionEditor
          routineActions={actions.filter(isRoutineAction)}
          onAdd={(routineId) => setActions((prev) => [...prev, { type: "routine", routineId }])}
          onRemoveAt={(idx) => {
            let seen = -1;
            setActions((prev) => prev.filter((a) => (isRoutineAction(a) ? ++seen !== idx : true)));
          }}
        />
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

// Time-of-day and sunrise/sunset triggers for the IF section (a rule fires
// WHEN a trigger is due, IF the device guards above pass).
function TriggerEditor({
  triggers,
  onAdd,
  onRemoveAt,
}: {
  triggers: AutomationCondition[];
  onAdd: (t: AutomationCondition) => void;
  onRemoveAt: (idx: number) => void;
}) {
  const [kind, setKind] = useState<"time" | "sun">("time");
  const [timeVal, setTimeVal] = useState("18:00");
  const [sunEvent, setSunEvent] = useState<"sunrise" | "sunset">("sunset");
  const [sunOffset, setSunOffset] = useState("0");

  const label = (t: AutomationCondition) => {
    if (t.type === "time") return `At ${t.time}`;
    if (t.type === "sun") {
      const off = t.offsetMin ?? 0;
      return `At ${t.event}${off === 0 ? "" : off > 0 ? ` +${off} min` : ` ${off} min`}`;
    }
    return "";
  };

  return (
    <div className="mt-2">
      {triggers.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {triggers.map((t, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/60 bg-white/40 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/[0.05]"
            >
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                {t.type === "time" ? <Clock size={14} className="text-slate-400" /> : <Sunrise size={14} className="text-slate-400" />}
                {label(t)}
              </span>
              <button onClick={() => onRemoveAt(i)} aria-label="Remove trigger" className="text-slate-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-white/60 bg-white/40 p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
          {(["time", "sun"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-2.5 py-1 font-medium ${kind === k ? "bg-white text-slate-900 shadow-sm dark:bg-white/90" : "text-slate-500 dark:text-slate-300"}`}
            >
              {k === "time" ? "Time" : "Sun"}
            </button>
          ))}
        </div>
        {kind === "time" ? (
          <>
            <input type="time" value={timeVal} onChange={(e) => setTimeVal(e.target.value)} className="field !py-1.5 w-32" />
            <button onClick={() => timeVal && onAdd({ type: "time", time: timeVal })} className="btn-ghost !py-1.5">
              <Plus size={14} /> Add time
            </button>
          </>
        ) : (
          <>
            <select value={sunEvent} onChange={(e) => setSunEvent(e.target.value as "sunrise" | "sunset")} className="field !py-1.5 w-28">
              <option value="sunrise">Sunrise</option>
              <option value="sunset">Sunset</option>
            </select>
            <input
              type="number"
              value={sunOffset}
              onChange={(e) => setSunOffset(e.target.value)}
              className="field !py-1.5 w-20"
              title="Offset in minutes (negative = before)"
              placeholder="± min"
            />
            <button
              onClick={() => onAdd({ type: "sun", event: sunEvent, offsetMin: Math.round(Number(sunOffset) || 0) })}
              className="btn-ghost !py-1.5"
            >
              <Plus size={14} /> Add sun
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// "Run a routine" actions for the THEN section.
function RoutineActionEditor({
  routineActions,
  onAdd,
  onRemoveAt,
}: {
  routineActions: AutomationAction[];
  onAdd: (routineId: string) => void;
  onRemoveAt: (idx: number) => void;
}) {
  const [routines, setRoutines] = useState<{ id: string; name: string }[]>([]);
  const [pick, setPick] = useState("");
  useEffect(() => {
    fetch("/api/routines")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.routines ?? []).map((r: any) => ({ id: r.id, name: r.name }));
        setRoutines(list);
        if (list[0]) setPick(list[0].id);
      })
      .catch(() => {});
  }, []);
  const nameOf = (id: string) => routines.find((r) => r.id === id)?.name ?? "routine";

  return (
    <div className="mt-2">
      {routineActions.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {routineActions.map((a, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/60 bg-white/40 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-white/[0.05]"
            >
              <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                <Sparkles size={14} className="text-emerald-500" /> Run{" "}
                <span className="font-medium">{isRoutineAction(a) ? nameOf(a.routineId) : ""}</span>
              </span>
              <button onClick={() => onRemoveAt(i)} aria-label="Remove routine action" className="text-slate-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {routines.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No routines yet — create one under Routines first.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles size={14} className="text-slate-400" />
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="field !py-1.5 w-48">
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button onClick={() => pick && onAdd(pick)} className="btn-ghost !py-1.5">
            <Plus size={14} /> Run routine
          </button>
        </div>
      )}
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
