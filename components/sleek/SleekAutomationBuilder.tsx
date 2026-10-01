"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Check, X, Trash2, Pencil, ArrowRight, Clock, Sunrise, Plus, Sparkles, Layers, CalendarClock } from "lucide-react";
import type {
  Automation,
  AutomationAction,
  AutomationCondition,
  DeviceCondition,
  GroupCondition,
  Room,
  Shortcut,
  ShortcutCondition,
  WindowPoint,
} from "@/lib/types";
import { isRoutineAction } from "@/lib/types";
import { valueLabel } from "./labels";
import SleekActionPicker from "./SleekActionPicker";

type AnyCondition = AutomationCondition | ShortcutCondition;
type CondKind = "device" | "time" | "sun" | "group" | "window";

function isDeviceCondition(c: AnyCondition | undefined): c is DeviceCondition {
  return !!c && (c.type === undefined || c.type === "device");
}

/** Replace the item at `idx` (edit in place), or append when `idx` is null. */
function replaceOrAppend<T>(arr: T[], idx: number | null, item: T): T[] {
  return idx !== null ? arr.map((x, j) => (j === idx ? item : x)) : [...arr, item];
}
/** Fix up an "editing" index after the row at `removed` is deleted. */
function adjustAfterDelete(idx: number | null, removed: number): number | null {
  if (idx === null) return null;
  if (idx === removed) return null;
  return idx > removed ? idx - 1 : idx;
}

interface Clause {
  deviceId: string;
  code: string;
  value: unknown;
}

function pointLabel(p: WindowPoint): string {
  if (p.kind === "time") return p.time;
  const off = p.offsetMin ?? 0;
  return `${p.event}${off === 0 ? "" : off > 0 ? ` +${off}m` : ` ${off}m`}`;
}

/** Human label for a condition of any type. */
function describeCondition(
  c: AnyCondition,
  byId: Map<string, Room["devices"][number]>,
  roomName: (id: string) => string,
): string {
  if (c.type === "time") return `At ${c.time}`;
  if (c.type === "window") return `Between ${pointLabel(c.from)} and ${pointLabel(c.to)}`;
  if (c.type === "group") {
    const where = c.scope === "house" ? "the house" : roomName(c.scope);
    return c.state === "allOff"
      ? `All ${c.kind} in ${where} are off`
      : `Any ${c.kind === "lights" ? "light" : "switch"} in ${where} is on`;
  }
  if (c.type === "sun") {
    const off = c.offsetMin ?? 0;
    const suffix = off === 0 ? "" : off > 0 ? ` +${off} min` : ` ${off} min`;
    return `At ${c.event}${suffix}`;
  }
  const d = byId.get(c.deviceId);
  const f = d?.functions.find((x) => x.code === c.code);
  return `${d?.name ?? "?"} · ${f?.name ?? c.code} = ${f ? valueLabel(f, c.value) : String(c.value)}`;
}

/** A window end point: a clock time, or sunrise/sunset with an offset. */
function PointEditor({ value, onChange }: { value: WindowPoint; onChange: (p: WindowPoint) => void }) {
  const selected = value.kind === "time" ? "time" : value.event;
  return (
    <>
      <select
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          onChange(
            v === "time"
              ? { kind: "time", time: value.kind === "time" ? value.time : "18:00" }
              : { kind: "sun", event: v as "sunrise" | "sunset", offsetMin: value.kind === "sun" ? value.offsetMin ?? 0 : 0 },
          );
        }}
        className="field !py-2"
      >
        <option value="time">a time</option>
        <option value="sunset">sunset</option>
        <option value="sunrise">sunrise</option>
      </select>
      {value.kind === "time" ? (
        <input type="time" value={value.time} onChange={(e) => onChange({ kind: "time", time: e.target.value })} className="field !py-2 w-32" />
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <input
            type="number"
            value={value.offsetMin ?? 0}
            onChange={(e) => onChange({ ...value, offsetMin: Math.round(Number(e.target.value) || 0) })}
            className="field !py-2 w-24"
            placeholder="± min"
            title="Minutes before (-) or after (+)"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">min (+ after, - before)</span>
        </span>
      )}
    </>
  );
}

// Sleek-native IF/THEN builder, shown as a full-screen modal overlay. Used for
// automations (device/time/sun conditions; time and sun are triggers) and, with
// mode="shortcut", for shortcuts (run on demand: device, all/any group and
// time-window conditions, plus the API-access toggle). Both clause lists are
// composed with the shared SleekActionPicker.
export default function SleekAutomationBuilder({
  rooms,
  initial,
  duplicate = false,
  mode = "automation",
  onSaved,
  onCancel,
}: {
  rooms: Room[];
  initial?: Automation | Shortcut;
  /** Seed from `initial` but save as a NEW record (not overwrite the original). */
  duplicate?: boolean;
  mode?: "automation" | "shortcut";
  onSaved: () => void;
  onCancel: () => void;
}) {
  const noun = mode === "shortcut" ? "shortcut" : "automation";
  const isEdit = !!initial && !duplicate;
  const [name, setName] = useState(initial ? (duplicate ? `Copy of ${initial.name}` : initial.name) : "");
  const [match, setMatch] = useState<"all" | "any">(initial?.match ?? "all");
  const [conditions, setConditions] = useState<AnyCondition[]>(initial?.conditions ?? []);
  const [apiEnabled, setApiEnabled] = useState(Boolean(initial && "apiEnabled" in initial && initial.apiEnabled));
  const [actions, setActions] = useState<AutomationAction[]>(initial?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which kind of condition the user is adding, plus the time/sun inputs, plus
  // the index of the condition being edited in place (null = adding new).
  const [condKind, setCondKind] = useState<CondKind>("device");
  const [timeVal, setTimeVal] = useState("18:00");
  const [sunEvent, setSunEvent] = useState<"sunrise" | "sunset">("sunset");
  const [sunOffset, setSunOffset] = useState("0");
  const [editingCondIndex, setEditingCondIndex] = useState<number | null>(null);
  // Shortcut-only condition inputs: all/any group, and a time window.
  const [groupScope, setGroupScope] = useState("house");
  const [groupKind, setGroupKind] = useState<GroupCondition["kind"]>("lights");
  const [groupState, setGroupState] = useState<GroupCondition["state"]>("allOff");
  const [winFrom, setWinFrom] = useState<WindowPoint>({ kind: "sun", event: "sunset", offsetMin: 0 });
  const [winTo, setWinTo] = useState<WindowPoint>({ kind: "sun", event: "sunrise", offsetMin: 0 });

  // THEN action kind (device set vs run a routine), the edited index, and the
  // routine list.
  const [actKind, setActKind] = useState<"device" | "routine">("device");
  const [editingActIndex, setEditingActIndex] = useState<number | null>(null);
  const [routines, setRoutines] = useState<{ id: string; name: string }[]>([]);
  const [pickRoutine, setPickRoutine] = useState("");
  useEffect(() => {
    fetch("/api/routines")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.routines ?? []).map((r: any) => ({ id: r.id, name: r.name }));
        setRoutines(list);
        if (list[0]) setPickRoutine(list[0].id);
      })
      .catch(() => {});
  }, []);
  const routineName = (id: string) => routines.find((r) => r.id === id)?.name ?? "routine";

  const byId = useMemo(() => new Map(rooms.flatMap((r) => r.devices).map((d) => [d.id, d])), [rooms]);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "a removed room";
  const describe = (c: Clause) => {
    const d = byId.get(c.deviceId);
    const f = d?.functions.find((x) => x.code === c.code);
    return {
      deviceName: d?.name ?? "?",
      controlName: f?.name ?? c.code,
      label: f ? valueLabel(f, c.value) : String(c.value),
    };
  };

  // Pull an existing condition/action back into its composer to edit in place.
  function editCondition(i: number) {
    const c = conditions[i];
    if (c.type === "time") {
      setCondKind("time");
      setTimeVal(c.time);
    } else if (c.type === "sun") {
      setCondKind("sun");
      setSunEvent(c.event);
      setSunOffset(String(c.offsetMin ?? 0));
    } else if (c.type === "group") {
      setCondKind("group");
      setGroupScope(c.scope);
      setGroupKind(c.kind);
      setGroupState(c.state);
    } else if (c.type === "window") {
      setCondKind("window");
      setWinFrom(c.from);
      setWinTo(c.to);
    } else {
      setCondKind("device"); // device picker seeds from `deviceCondInitial`
    }
    setEditingCondIndex(i);
  }
  function editAction(i: number) {
    const a = actions[i];
    if (isRoutineAction(a)) {
      setActKind("routine");
      setPickRoutine(a.routineId);
    } else {
      setActKind("device"); // device picker seeds from `deviceActInitial`
    }
    setEditingActIndex(i);
  }
  // Switching the composer kind abandons any in-place edit of the other kind.
  function chooseCondKind(k: CondKind) {
    setCondKind(k);
    setEditingCondIndex(null);
  }
  function chooseActKind(k: "device" | "routine") {
    setActKind(k);
    setEditingActIndex(null);
  }

  const editingCond = editingCondIndex !== null ? conditions[editingCondIndex] : undefined;
  const deviceCondInitial = isDeviceCondition(editingCond)
    ? { deviceId: editingCond.deviceId, code: editingCond.code, value: editingCond.value }
    : undefined;
  const editingAct = editingActIndex !== null ? actions[editingActIndex] : undefined;
  const deviceActInitial =
    editingAct && !isRoutineAction(editingAct)
      ? { deviceId: editingAct.deviceId, code: editingAct.code, value: editingAct.value }
      : undefined;

  async function save() {
    setError(null);
    if (!name.trim()) return setError(`Give the ${noun} a name`);
    if (mode === "automation" && conditions.length === 0) return setError("Add at least one IF condition");
    if (actions.length === 0) return setError("Add at least one THEN action");
    setSaving(true);
    try {
      const base = mode === "shortcut" ? "/api/shortcuts" : "/api/automations";
      const url = isEdit ? `${base}/${initial!.id}` : base;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), match, conditions, actions, ...(mode === "shortcut" ? { apiEnabled } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Couldn't save ${noun}`);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }


  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="card max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {isEdit ? `Edit ${noun}` : duplicate ? `Duplicate ${noun}` : `New ${noun}`}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {mode === "shortcut" ? "Shortcut name" : "Automation name"}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder={mode === "shortcut" ? "e.g. Welcome home" : "e.g. Evening lights"}
          className="field mb-5"
        />

        {mode === "shortcut" && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/50 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.06]">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Accessible via API</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Run it from a URL with the shortcut token, e.g. from an iPhone Shortcut.
              </span>
            </span>
            <button
              onClick={() => setApiEnabled((v) => !v)}
              role="switch"
              aria-checked={apiEnabled}
              aria-label="Accessible via API"
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${apiEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${apiEnabled ? "left-6" : "left-1"}`} />
            </button>
          </div>
        )}

        {/* IF */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">If</span>
          <div className="inline-flex rounded-xl border border-white/60 bg-white/40 p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
            {(["all", "any"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMatch(m)}
                className={`rounded-lg px-2.5 py-1 font-semibold ${match === m ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
              >
                {m === "all" ? "match all" : "match any"}
              </button>
            ))}
          </div>
        </div>
        {/* Existing conditions (any type) */}
        {conditions.length > 0 && (
          <ul className="mb-3 space-y-2">
            {conditions.map((c, i) => (
              <li
                key={i}
                className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-sm ${
                  editingCondIndex === i
                    ? "border-brand-400 bg-brand-500/10 dark:border-brand-400/60"
                    : "border-white/60 bg-white/50 dark:border-white/10 dark:bg-white/[0.06]"
                }`}
              >
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{describeCondition(c, byId, roomName)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => editCondition(i)} aria-label="Edit" className="text-slate-400 hover:text-brand-500">
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => {
                      setConditions((x) => x.filter((_, j) => j !== i));
                      setEditingCondIndex((cur) => adjustAfterDelete(cur, i));
                    }}
                    aria-label="Remove"
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {mode === "shortcut" && conditions.length === 0 && (
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">No conditions: it runs every time it&apos;s triggered.</p>
        )}

        {/* Condition-kind selector */}
        <div className="mb-2 inline-flex rounded-xl border border-white/60 bg-white/40 p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
          {(mode === "shortcut"
            ? ([
                ["device", "Device"],
                ["group", "All / any"],
                ["window", "Time window"],
              ] as const)
            : ([
                ["device", "Device"],
                ["time", "Time"],
                ["sun", "Sun"],
              ] as const)
          ).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => chooseCondKind(k)}
              className={`rounded-lg px-2.5 py-1 font-semibold ${condKind === k ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {condKind === "device" && (
          <SleekActionPicker
            key={`cond-${editingCondIndex ?? "new"}`}
            rooms={rooms}
            addLabel={editingCondIndex !== null ? "Update condition" : "Add condition"}
            initial={deviceCondInitial}
            onAdd={(a) => {
              setConditions((x) => replaceOrAppend(x, editingCondIndex, { type: "device", deviceId: a.deviceId, code: a.code, value: a.value }));
              setEditingCondIndex(null);
            }}
          />
        )}
        {condKind === "group" && (
          <div className="flex flex-wrap items-center gap-2">
            <Layers size={16} className="text-slate-400" />
            <select value={groupState} onChange={(e) => setGroupState(e.target.value as GroupCondition["state"])} className="field !py-2">
              <option value="allOff">All</option>
              <option value="anyOn">Any</option>
            </select>
            <select value={groupKind} onChange={(e) => setGroupKind(e.target.value as GroupCondition["kind"])} className="field !py-2">
              <option value="lights">lights</option>
              <option value="switches">switches</option>
            </select>
            <span className="text-sm text-slate-500 dark:text-slate-400">in</span>
            <select value={groupScope} onChange={(e) => setGroupScope(e.target.value)} className="field !py-2 flex-1">
              <option value="house">the whole house</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="text-sm text-slate-500 dark:text-slate-400">{groupState === "allOff" ? "are off" : "is on"}</span>
            <button
              onClick={() => {
                setConditions((x) => replaceOrAppend(x, editingCondIndex, { type: "group", scope: groupScope, kind: groupKind, state: groupState }));
                setEditingCondIndex(null);
              }}
              className="btn-primary !px-3"
            >
              <Plus size={15} /> {editingCondIndex !== null ? "Update" : "Add"}
            </button>
          </div>
        )}
        {condKind === "window" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock size={16} className="text-slate-400" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Between</span>
              <PointEditor value={winFrom} onChange={setWinFrom} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <span className="text-sm text-slate-500 dark:text-slate-400">and</span>
              <PointEditor value={winTo} onChange={setWinTo} />
              <button
                onClick={() => {
                  if ((winFrom.kind === "time" && !winFrom.time) || (winTo.kind === "time" && !winTo.time)) return;
                  setConditions((x) => replaceOrAppend(x, editingCondIndex, { type: "window", from: winFrom, to: winTo }));
                  setEditingCondIndex(null);
                }}
                className="btn-primary !px-3"
              >
                <Plus size={15} /> {editingCondIndex !== null ? "Update" : "Add"}
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Sunrise and sunset use the location in Settings. A window can cross midnight.
            </p>
          </div>
        )}
        {condKind === "time" && (
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            <input type="time" value={timeVal} onChange={(e) => setTimeVal(e.target.value)} className="field !py-2 flex-1" />
            <button
              onClick={() => {
                if (!timeVal) return;
                setConditions((x) => replaceOrAppend(x, editingCondIndex, { type: "time", time: timeVal }));
                setEditingCondIndex(null);
              }}
              className="btn-primary !px-3"
            >
              <Plus size={15} /> {editingCondIndex !== null ? "Update" : "Add"}
            </button>
          </div>
        )}
        {condKind === "sun" && (
          <div className="flex flex-wrap items-center gap-2">
            <Sunrise size={16} className="text-slate-400" />
            <select
              value={sunEvent}
              onChange={(e) => setSunEvent(e.target.value as "sunrise" | "sunset")}
              className="field !py-2 flex-1"
            >
              <option value="sunrise">Sunrise</option>
              <option value="sunset">Sunset</option>
            </select>
            <input
              type="number"
              value={sunOffset}
              onChange={(e) => setSunOffset(e.target.value)}
              className="field !py-2 w-24"
              placeholder="± min"
              title="Offset in minutes (negative = before)"
            />
            <button
              onClick={() => {
                setConditions((x) => replaceOrAppend(x, editingCondIndex, { type: "sun", event: sunEvent, offsetMin: Math.round(Number(sunOffset) || 0) }));
                setEditingCondIndex(null);
              }}
              className="btn-primary !px-3"
            >
              <Plus size={15} /> {editingCondIndex !== null ? "Update" : "Add"}
            </button>
          </div>
        )}

        {/* THEN */}
        <div className="mb-2 mt-5 flex items-center gap-1.5">
          <ArrowRight size={14} className="text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Then</span>
        </div>
        {/* Existing actions (device set or run-routine) */}
        {actions.length > 0 && (
          <ul className="mb-3 space-y-2">
            {actions.map((a, i) => {
              const routine = isRoutineAction(a);
              const l = routine ? null : describe(a);
              return (
                <li
                  key={i}
                  className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-sm ${
                    editingActIndex === i
                      ? "border-emerald-400 bg-emerald-500/10 dark:border-emerald-400/60"
                      : "border-white/60 bg-white/50 dark:border-white/10 dark:bg-white/[0.06]"
                  }`}
                >
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                    {routine ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles size={13} className="text-emerald-500" /> Run{" "}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{routineName(a.routineId)}</span>
                      </span>
                    ) : (
                      <>
                        <span className="text-slate-400 dark:text-slate-500">{l!.deviceName}</span> {l!.controlName}{" "}
                        <span className="text-slate-300 dark:text-slate-600">=</span>{" "}
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{l!.label}</span>
                      </>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => editAction(i)} aria-label="Edit" className="text-slate-400 hover:text-emerald-500">
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setActions((x) => x.filter((_, j) => j !== i));
                        setEditingActIndex((cur) => adjustAfterDelete(cur, i));
                      }}
                      aria-label="Remove"
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Action-kind selector */}
        <div className="mb-2 inline-flex rounded-xl border border-white/60 bg-white/40 p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
          {([
            ["device", "Device"],
            ["routine", "Routine"],
          ] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => chooseActKind(k)}
              className={`rounded-lg px-2.5 py-1 font-semibold ${actKind === k ? "bg-emerald-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {actKind === "device" ? (
          <SleekActionPicker
            key={`act-${editingActIndex ?? "new"}`}
            rooms={rooms}
            addLabel={editingActIndex !== null ? "Update action" : "Add action"}
            initial={deviceActInitial}
            onAdd={(a) => {
              setActions((x) => replaceOrAppend(x, editingActIndex, { type: "device", deviceId: a.deviceId, code: a.code, value: a.value }));
              setEditingActIndex(null);
            }}
          />
        ) : routines.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No routines yet — create one under Routines first.</p>
        ) : (
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-slate-400" />
            <select value={pickRoutine} onChange={(e) => setPickRoutine(e.target.value)} className="field !py-2 flex-1">
              {routines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                if (!pickRoutine) return;
                setActions((x) => replaceOrAppend(x, editingActIndex, { type: "routine", routineId: pickRoutine }));
                setEditingActIndex(null);
              }}
              className="btn-primary !px-3"
            >
              <Plus size={15} /> {editingActIndex !== null ? "Update" : "Add"}
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">
            <X size={15} />
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {isEdit ? "Save changes" : `Save ${noun}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
