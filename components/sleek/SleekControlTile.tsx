"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Star, ShieldAlert, X, Check } from "lucide-react";
import type { DeviceFunction } from "@/lib/types";
import { controlKind, iconForControl, KIND_ON_GRADIENT, KIND_GLOW } from "@/lib/icons";
import { enumLabel, isOn, valueLabel } from "./labels";

// The single, consistent control tile used across the Sleek theme (research:
// one tile type for 80%+ of the UI). Boolean → big lit toggle; Enum → big
// segmented buttons; Integer → slider. Colour communicates state; a spring
// press gives feedback. A favourite star and protected-confirm are built in.
export default function SleekControlTile({
  fn,
  value,
  disabled,
  isProtected,
  isAdmin,
  isFavourite,
  onCommand,
  onToggleFavourite,
  caption,
}: {
  fn: DeviceFunction;
  value: unknown;
  disabled?: boolean;
  isProtected?: boolean;
  isAdmin?: boolean;
  isFavourite?: boolean;
  onCommand: (value: unknown) => void;
  onToggleFavourite?: () => void;
  caption?: string;
}) {
  const [pending, setPending] = useState<unknown>(null); // protected confirm value
  const kind = controlKind(fn.name, fn.code);
  const Icon = iconForControl(kind);
  const on = isOn(fn, value);
  const wide = fn.type !== "Boolean";

  // Route a command through a confirm step for protected controls (admin only).
  function request(v: unknown) {
    if (disabled) return;
    if (isProtected && isAdmin) {
      setPending(v);
      return;
    }
    onCommand(v);
  }

  const litClasses = on
    ? `bg-gradient-to-br ${KIND_ON_GRADIENT[kind]} text-white ${KIND_GLOW[kind]} dark:text-slate-900`
    : "tile-off";

  return (
    <div className={wide ? "col-span-2" : ""}>
      {caption && (
        <p className="mb-1.5 truncate px-1 text-xs font-medium text-slate-500 dark:text-slate-400">{caption}</p>
      )}
      <div className="relative">
        {/* ── Boolean: whole tile toggles ─────────────────────────────── */}
        {fn.type === "Boolean" && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={disabled}
            onClick={() => request(value !== true)}
            className={`flex h-[140px] w-full flex-col justify-between overflow-hidden rounded-[26px] p-4 text-left transition-colors disabled:opacity-50 ${litClasses}`}
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                on ? "bg-white/25 dark:bg-slate-900/10" : "bg-slate-200/70 text-slate-500 dark:bg-white/10 dark:text-slate-300"
              }`}
            >
              <Icon size={24} />
            </span>
            <div>
              <p className="truncate text-[15px] font-semibold leading-tight">{fn.name}</p>
              <p className={`text-sm ${on ? "opacity-90" : "text-slate-400 dark:text-slate-500"}`}>{on ? "On" : "Off"}</p>
            </div>
          </motion.button>
        )}

        {/* ── Enum (fan / modes): big segmented buttons ───────────────── */}
        {fn.type === "Enum" && (
          <div className={`overflow-hidden rounded-[26px] p-4 ${litClasses}`}>
            <div className="mb-3 flex items-center gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${on ? "bg-white/25 dark:bg-slate-900/10" : "bg-slate-200/70 text-slate-500 dark:bg-white/10 dark:text-slate-300"}`}>
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight">{fn.name}</p>
                <p className={`text-sm ${on ? "opacity-90" : "text-slate-400 dark:text-slate-500"}`}>{valueLabel(fn, value)}</p>
              </div>
            </div>
            <div className={`flex flex-wrap gap-2 rounded-2xl p-1 ${on ? "bg-black/15" : "bg-slate-100 dark:bg-white/10"}`}>
              {(fn.range ?? []).map((opt) => {
                const active = String(value ?? "") === opt;
                return (
                  <motion.button
                    key={opt}
                    whileTap={{ scale: 0.94 }}
                    disabled={disabled}
                    onClick={() => request(opt)}
                    className={`min-w-[64px] flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      active
                        ? on
                          ? "bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white"
                          : "bg-gradient-to-r from-brand-500 to-brand-400 text-white dark:from-white dark:to-white dark:text-slate-900"
                        : on
                          ? "text-white/85 hover:text-white dark:text-slate-700"
                          : "text-slate-500 hover:text-slate-900 dark:text-slate-300"
                    }`}
                  >
                    {enumLabel(opt, fn)}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Integer (dimmer/level): slider ──────────────────────────── */}
        {fn.type === "Integer" && (
          <div className={`overflow-hidden rounded-[26px] p-4 ${litClasses}`}>
            <div className="mb-3 flex items-center gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${on ? "bg-white/25 dark:bg-slate-900/10" : "bg-slate-200/70 text-slate-500 dark:bg-white/10 dark:text-slate-300"}`}>
                <Icon size={22} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight">{fn.name}</p>
                <p className={`text-sm ${on ? "opacity-90" : "text-slate-400 dark:text-slate-500"}`}>{valueLabel(fn, value)}</p>
              </div>
            </div>
            <input
              type="range"
              min={fn.min ?? 0}
              max={fn.max ?? 100}
              step={fn.step ?? 1}
              defaultValue={typeof value === "number" ? value : fn.min ?? 0}
              disabled={disabled}
              onPointerUp={(e) => request(Number((e.target as HTMLInputElement).value))}
              className="w-full"
            />
          </div>
        )}

        {/* Favourite star */}
        {onToggleFavourite && (
          <button
            type="button"
            onClick={onToggleFavourite}
            aria-pressed={isFavourite}
            title={isFavourite ? "Remove favourite" : "Add favourite"}
            className="absolute -right-1.5 -top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 dark:bg-slate-800 dark:ring-white/10"
          >
            <Star size={15} className={isFavourite ? "fill-amber-400 text-amber-400" : "text-slate-400 dark:text-slate-500"} />
          </button>
        )}
      </div>

      {/* Protected confirm */}
      {pending !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setPending(null)}>
          <div className="card w-full max-w-sm animate-scale-in p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <ShieldAlert size={20} className="text-amber-500" />
              <h2 className="text-lg font-semibold">Protected control</h2>
            </div>
            <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">
              “{fn.name}” is protected. Set it to <b>{valueLabel(fn, pending)}</b>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPending(null)} className="btn-ghost">
                <X size={15} /> Cancel
              </button>
              <button
                onClick={() => {
                  onCommand(pending);
                  setPending(null);
                }}
                className="btn-primary"
              >
                <Check size={15} /> Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
