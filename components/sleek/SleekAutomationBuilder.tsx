"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Check, X, Trash2, ArrowRight, Clock, Sunrise, Plus } from "lucide-react";
import type { Automation, AutomationCondition, Room } from "@/lib/types";
import { valueLabel } from "./labels";
import SleekActionPicker from "./SleekActionPicker";

interface Clause {
  deviceId: string;
  code: string;
  value: unknown;
}

/** Human label for a condition of any type. */
function describeCondition(
  c: AutomationCondition,
  byId: Map<string, Room["devices"][number]>,
): string {
  if (c.type === "time") return `At ${c.time}`;
  if (c.type === "sun") {
    const off = c.offsetMin ?? 0;
    const suffix = off === 0 ? "" : off > 0 ? ` +${off} min` : ` ${off} min`;
    return `At ${c.event}${suffix}`;
  }
  const d = byId.get(c.deviceId);
  const f = d?.functions.find((x) => x.code === c.code);
  return `${d?.name ?? "?"} · ${f?.name ?? c.code} = ${f ? valueLabel(f, c.value) : String(c.value)}`;
}

// Sleek-native automation builder, shown as a full-screen modal overlay.
// IF (match all/any) a set of conditions → THEN a set of actions. Both clause
// lists are composed with the shared SleekActionPicker.
export default function SleekAutomationBuilder({
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
  const [actions, setActions] = useState<Clause[]>(
    initial?.actions.map((a) => ({ deviceId: a.deviceId, code: a.code, value: a.value })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which kind of condition the user is adding, plus the time/sun inputs.
  const [condKind, setCondKind] = useState<"device" | "time" | "sun">("device");
  const [timeVal, setTimeVal] = useState("18:00");
  const [sunEvent, setSunEvent] = useState<"sunrise" | "sunset">("sunset");
  const [sunOffset, setSunOffset] = useState("0");

  const byId = useMemo(() => new Map(rooms.flatMap((r) => r.devices).map((d) => [d.id, d])), [rooms]);
  const describe = (c: Clause) => {
    const d = byId.get(c.deviceId);
    const f = d?.functions.find((x) => x.code === c.code);
    return {
      deviceName: d?.name ?? "?",
      controlName: f?.name ?? c.code,
      label: f ? valueLabel(f, c.value) : String(c.value),
    };
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
        body: JSON.stringify({ name: name.trim(), match, conditions, actions }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save automation");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const ClauseList = ({ list, onRemove }: { list: Clause[]; onRemove: (i: number) => void }) =>
    list.length === 0 ? null : (
      <ul className="mb-3 space-y-2">
        {list.map((c, i) => {
          const l = describe(c);
          return (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/50 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.06]"
            >
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                <span className="text-slate-400 dark:text-slate-500">{l.deviceName}</span> {l.controlName}{" "}
                <span className="text-slate-300 dark:text-slate-600">=</span>{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{l.label}</span>
              </span>
              <button onClick={() => onRemove(i)} aria-label="Remove" className="shrink-0 text-slate-400 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>
    );

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
            {initial ? "Edit automation" : "New automation"}
          </h2>
          <button onClick={onCancel} aria-label="Close" className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Automation name
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Evening lights" className="field mb-5" />

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
                className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/50 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.06]"
              >
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{describeCondition(c, byId)}</span>
                <button
                  onClick={() => setConditions((x) => x.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Condition-kind selector */}
        <div className="mb-2 inline-flex rounded-xl border border-white/60 bg-white/40 p-0.5 text-xs dark:border-white/10 dark:bg-white/[0.05]">
          {([
            ["device", "Device"],
            ["time", "Time"],
            ["sun", "Sun"],
          ] as const).map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setCondKind(k)}
              className={`rounded-lg px-2.5 py-1 font-semibold ${condKind === k ? "bg-brand-500 text-white" : "text-slate-500 dark:text-slate-400"}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {condKind === "device" && (
          <SleekActionPicker
            rooms={rooms}
            addLabel="Add condition"
            onAdd={(a) => setConditions((x) => [...x, { type: "device", deviceId: a.deviceId, code: a.code, value: a.value }])}
          />
        )}
        {condKind === "time" && (
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            <input type="time" value={timeVal} onChange={(e) => setTimeVal(e.target.value)} className="field !py-2 flex-1" />
            <button
              onClick={() => timeVal && setConditions((x) => [...x, { type: "time", time: timeVal }])}
              className="btn-primary !px-3"
            >
              <Plus size={15} /> Add
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
              onClick={() =>
                setConditions((x) => [...x, { type: "sun", event: sunEvent, offsetMin: Math.round(Number(sunOffset) || 0) }])
              }
              className="btn-primary !px-3"
            >
              <Plus size={15} /> Add
            </button>
          </div>
        )}

        {/* THEN */}
        <div className="mb-2 mt-5 flex items-center gap-1.5">
          <ArrowRight size={14} className="text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Then</span>
        </div>
        <ClauseList list={actions} onRemove={(i) => setActions((x) => x.filter((_, j) => j !== i))} />
        <SleekActionPicker rooms={rooms} addLabel="Add action" onAdd={(a) => setActions((x) => [...x, { deviceId: a.deviceId, code: a.code, value: a.value }])} />

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">
            <X size={15} />
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {initial ? "Save changes" : "Save automation"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
