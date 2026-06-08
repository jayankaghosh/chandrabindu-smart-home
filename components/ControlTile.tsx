"use client";

import { useEffect, useState } from "react";
import type { DeviceFunction } from "@/lib/types";
import {
  controlKind,
  iconForControl,
  KIND_ON_GRADIENT,
  KIND_GLOW,
} from "@/lib/icons";

/** Liquid-glass sheen overlay for lit tiles. */
function Sheen() {
  return (
    <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/25 via-transparent to-transparent" />
  );
}

/** Badge marking a protected control. */
function ProtectedBadge() {
  return (
    <span
      title="Protected — admin only"
      className="absolute bottom-2 right-2 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 shadow ring-1 ring-black/5"
    >
      Protected
    </span>
  );
}

const OFF_TILE = "tile-off";

// Fan speed: friendly labels + a gradient that intensifies with speed.
const FAN_LABELS: Record<string, string> = {
  "0": "Off",
  "25": "Low",
  "50": "Medium",
  "75": "High",
  "100": "Full",
};
const FAN_GRADIENT: Record<string, string> = {
  "25": "from-sky-300 to-cyan-400 dark:from-white dark:to-white",
  "50": "from-sky-400 to-cyan-500 dark:from-white dark:to-white",
  "75": "from-cyan-500 to-blue-500 dark:from-white dark:to-white",
  "100": "from-blue-500 to-indigo-600 dark:from-white dark:to-white",
};

export default function ControlTile({
  fn,
  value,
  disabled,
  protected: isProtected,
  onChange,
}: {
  fn: DeviceFunction;
  value: unknown;
  disabled?: boolean;
  protected?: boolean;
  onChange: (value: unknown) => void;
}) {
  const kind = controlKind(fn.name, fn.code);
  const Icon = iconForControl(kind);

  // ── Boolean → square lit tile ─────────────────────────────────────────────
  if (fn.type === "Boolean") {
    const on = value === true;
    return (
      <button
        onClick={() => onChange(!on)}
        disabled={disabled}
        aria-pressed={on}
        className={`group relative flex h-[120px] flex-col justify-between overflow-hidden rounded-[22px] p-3.5 text-left transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-50 ${
          on
            ? `bg-gradient-to-br ${KIND_ON_GRADIENT[kind]} text-white ${KIND_GLOW[kind]} dark:text-slate-900`
            : OFF_TILE
        }`}
      >
        {on && <Sheen />}
        {isProtected && <ProtectedBadge />}
        <div className="relative flex items-start justify-between">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              on
                ? "bg-white/25 text-white dark:bg-slate-900/10 dark:text-slate-700"
                : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
            }`}
          >
            <Icon size={19} />
          </span>
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full transition-all ${
              on
                ? "bg-white shadow-[0_0_10px_2px_rgba(255,255,255,0.7)] dark:bg-slate-700 dark:shadow-none"
                : "bg-slate-200 dark:bg-white/20"
            }`}
          />
        </div>
        <div className="relative">
          <p className="truncate text-[13px] font-semibold leading-tight">
            {fn.name}
          </p>
          <p className={`text-xs ${on ? "text-white/85 dark:text-slate-600" : "text-slate-400 dark:text-slate-500"}`}>
            {on ? "On" : "Off"}
          </p>
        </div>
      </button>
    );
  }

  // ── Enum of numbers (fan speed) → wide slider tile ────────────────────────
  if (fn.type === "Enum") {
    const options = fn.range ?? [];
    const allNumeric =
      options.length > 0 && options.every((o) => /^\d+$/.test(o));

    if (allNumeric) {
      const cur = value != null ? String(value) : options[0];
      const on = cur !== "0";
      const isFan = kind === "fan";
      const labelFor = (o: string) => (isFan ? (FAN_LABELS[o] ?? o) : o);
      const gradient =
        (isFan && FAN_GRADIENT[cur]) || KIND_ON_GRADIENT[kind];
      return (
        <div
          className={`relative col-span-2 overflow-hidden rounded-[22px] p-4 transition-all duration-300 ${
            on
              ? `bg-gradient-to-br ${gradient} text-white ${KIND_GLOW[kind]} dark:text-slate-900`
              : OFF_TILE
          }`}
        >
          {on && <Sheen />}
          {isProtected && <ProtectedBadge />}
          <div className="relative mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${on ? "bg-white/25 text-white dark:bg-slate-900/10 dark:text-slate-700" : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"}`}
              >
                <Icon size={18} />
              </span>
              <span className="text-[13px] font-semibold">{fn.name}</span>
            </div>
            <span className="text-base font-semibold tabular-nums">
              {isFan ? (
                labelFor(cur)
              ) : (
                <>
                  {cur}
                  <span className="text-sm opacity-70">{fn.unit ?? "%"}</span>
                </>
              )}
            </span>
          </div>
          <div
            className={`relative flex gap-1 rounded-full p-1 ${on ? "bg-black/15" : "bg-slate-100 dark:bg-white/10"}`}
          >
            {options.map((opt) => {
              const active = cur === opt;
              return (
                <button
                  key={opt}
                  disabled={disabled}
                  onClick={() => onChange(opt)}
                  className={`flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-all disabled:opacity-50 ${
                    active
                      ? on
                        ? "bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white"
                        : "bg-gradient-to-r from-brand-500 to-brand-400 text-white dark:from-white dark:to-white dark:text-slate-900"
                      : on
                        ? "text-white/80 hover:text-white dark:text-slate-700"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                  }`}
                >
                  {labelFor(opt)}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Non-numeric enum → wide pill tile
    return (
      <div className={`col-span-2 overflow-hidden rounded-[22px] p-4 ${OFF_TILE}`}>
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">
            <Icon size={18} />
          </span>
          <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            {fn.name}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                disabled={disabled}
                onClick={() => onChange(opt)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all disabled:opacity-50 ${
                  active
                    ? "bg-gradient-to-r from-brand-500 to-brand-400 text-white dark:from-white dark:to-white dark:text-slate-900"
                    : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900"
                }`}
              >
                {opt.toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Integer (dimmer/level) → wide slider tile ─────────────────────────────
  if (fn.type === "Integer") {
    return (
      <IntegerTile fn={fn} value={value} disabled={disabled} onChange={onChange} />
    );
  }

  return null;
}

function IntegerTile({
  fn,
  value,
  disabled,
  onChange,
}: {
  fn: DeviceFunction;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}) {
  const kind = controlKind(fn.name, fn.code);
  const Icon = iconForControl(kind);
  const min = fn.min ?? 0;
  const max = fn.max ?? 100;
  const step = fn.step && fn.step > 0 ? fn.step : 1;
  const scale = fn.scale ?? 0;
  const factor = Math.pow(10, scale);

  const numeric = typeof value === "number" ? value : min;
  const [local, setLocal] = useState(numeric);
  useEffect(() => setLocal(numeric), [numeric]);

  const display = (local / factor).toFixed(scale > 0 ? scale : 0);
  const pct = max > min ? ((local - min) / (max - min)) * 100 : 0;

  return (
    <div className={`col-span-2 overflow-hidden rounded-[22px] p-4 ${OFF_TILE}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">
            <Icon size={18} />
          </span>
          <span className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            {fn.name}
          </span>
        </div>
        <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {display}
          <span className="text-sm text-slate-400 dark:text-slate-500">{fn.unit ?? ""}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onMouseUp={() => onChange(local)}
        onTouchEnd={() => onChange(local)}
        style={{
          background: `linear-gradient(to right, var(--range-fill, #6366f1) ${pct}%, var(--range-track, rgba(15,23,42,0.12)) ${pct}%)`,
        }}
        className="w-full disabled:opacity-50"
      />
    </div>
  );
}
