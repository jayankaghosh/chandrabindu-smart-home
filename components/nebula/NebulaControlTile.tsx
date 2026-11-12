"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, ShieldAlert, X, Check, Link2, ShieldCheck } from "lucide-react";
import { controlKind, iconForControl } from "@/lib/icons";
import { isFanLevel } from "@/lib/onCount";
import type { ControlTileProps } from "../sleek/SleekControlTile";
import { enumLabel, isOn, valueLabel } from "../sleek/labels";
import { HUES, emitPulse, haptic, sfx } from "./fx";
import { cssHue } from "./HoloCard";

type Ripple = { id: number; x: number; y: number };

// Nebula's control tile: same props and rules as SleekControlTile (protected
// confirm, super-protected lock, favourite star, group badge), drawn as a
// holographic panel. Turning something on blooms its colour, runs a light
// round the border, ripples from the finger and sends a shockwave through the
// sky; fans spin at their real speed; enums slide a lit highlight between
// options; dimmers fill a glowing bar.
export default function NebulaControlTile({
  fn,
  value,
  disabled,
  isProtected,
  isAdmin,
  isFavourite,
  inGroup,
  onCommand,
  onToggleFavourite,
  caption,
}: ControlTileProps) {
  const uid = useId();
  const [pending, setPending] = useState<unknown>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [starBurst, setStarBurst] = useState(0);
  const tileRef = useRef<HTMLDivElement | null>(null);
  const point = useRef<{ x: number; y: number } | null>(null);

  const kind = controlKind(fn.name, fn.code);
  const Icon = iconForControl(kind);
  const on = isOn(fn, value);
  const superProtected = fn.superProtected === true;
  const locked = disabled || superProtected;
  const hue = HUES[kind];
  const hueVar = { ["--nb-hue" as string]: cssHue(hue) };

  // Fan spin: Boolean fans spin when on, fan-level enums spin faster per level.
  const fanSpeed =
    kind === "fan" || isFanLevel(fn)
      ? fn.type === "Enum"
        ? Number(value) > 0
          ? 1.7 - (Number(value) / 100) * 1.4
          : 0
        : on
          ? 0.9
          : 0
      : 0;

  function effects(nextOn: boolean) {
    const el = tileRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gx = point.current?.x ?? r.left + r.width / 2;
    const gy = point.current?.y ?? r.top + r.height / 2;
    const id = Date.now() + Math.random();
    setRipples((rs) => [...rs, { id, x: gx - r.left, y: gy - r.top }]);
    window.setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== id)), 900);
    emitPulse(gx, gy, nextOn ? hue : HUES.white, nextOn ? 1 : 0.55);
    sfx(nextOn ? "on" : "off");
    haptic(nextOn ? 14 : 8);
  }

  function commit(v: unknown) {
    onCommand(v);
    effects(isOn(fn, v));
  }

  // Route a command through a confirm step for protected controls (admin only).
  function request(v: unknown) {
    if (locked) return; // super-protected can't be toggled by anyone
    if (isProtected && isAdmin) {
      setPending(v);
      return;
    }
    commit(v);
  }

  const shell =
    "relative overflow-hidden rounded-[24px] border bg-[rgba(8,10,28,0.58)] backdrop-blur-xl transition-[border-color,box-shadow] duration-500";
  const shellState = on
    ? "nb-border border-[rgb(var(--nb-hue)/0.35)] shadow-[0_0_0_1px_rgb(var(--nb-hue)/0.12),0_18px_50px_-18px_rgb(var(--nb-hue)/0.65)]"
    : "border-white/[0.08] shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset,0_20px_40px_-26px_rgba(0,0,0,0.9)]";

  const iconChip = (size: number, box: string) => (
    <motion.span
      animate={on ? { scale: [1, 1.18, 1], rotate: 0 } : { scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`relative flex ${box} shrink-0 items-center justify-center rounded-2xl transition-colors duration-500 ${
        on ? "bg-[rgb(var(--nb-hue)/0.18)] text-[rgb(var(--nb-hue))]" : "bg-white/[0.06] text-slate-400"
      }`}
      style={on ? { boxShadow: "0 0 26px -2px rgb(var(--nb-hue) / 0.65), inset 0 0 12px rgb(var(--nb-hue) / 0.25)" } : undefined}
    >
      <span
        className={fanSpeed > 0 ? "nb-fan-spin inline-flex" : "inline-flex"}
        style={fanSpeed > 0 ? ({ ["--nb-fan" as string]: `${fanSpeed}s` } as React.CSSProperties) : undefined}
      >
        <Icon size={size} style={on ? { filter: "drop-shadow(0 0 6px rgb(var(--nb-hue)))" } : undefined} />
      </span>
    </motion.span>
  );

  const bloom = (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ opacity: on ? 1 : 0 }}
        transition={{ duration: 0.6 }}
        style={{
          background:
            "radial-gradient(120% 90% at 18% 15%, rgb(var(--nb-hue) / 0.32), transparent 55%), linear-gradient(180deg, transparent 40%, rgb(var(--nb-hue) / 0.12))",
        }}
      />
      {on && <div aria-hidden className="nb-sheen pointer-events-none absolute inset-0 opacity-70" />}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute rounded-full border-2 border-[rgb(var(--nb-hue)/0.8)] bg-[rgb(var(--nb-hue)/0.18)]"
            style={{ left: r.x, top: r.y, width: 20, height: 20, marginLeft: -10, marginTop: -10 }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 22, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </AnimatePresence>
    </>
  );

  const statusLine = (text: string) => (
    <p className={`nb-mono flex items-center gap-1.5 text-[10px] uppercase ${on ? "text-[rgb(var(--nb-hue))]" : "text-slate-500"}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${on ? "bg-[rgb(var(--nb-hue))] shadow-[0_0_8px_rgb(var(--nb-hue))]" : "bg-slate-600"}`}
      />
      {text}
    </p>
  );

  return (
    <div className={fn.type !== "Boolean" ? "col-span-2" : ""} style={hueVar}>
      {caption && <p className="nb-mono mb-1.5 truncate px-1 text-[10px] uppercase text-slate-400">{caption}</p>}
      <div
        ref={tileRef}
        className="relative"
        onPointerDown={(e) => (point.current = { x: e.clientX, y: e.clientY })}
        onKeyDown={() => (point.current = null)}
      >
        {/* ── Boolean: whole tile toggles ─────────────────────────────── */}
        {fn.type === "Boolean" && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={locked ? undefined : { y: -2 }}
            disabled={locked}
            onClick={() => request(value !== true)}
            aria-pressed={on}
            className={`${shell} ${shellState} flex h-[150px] w-full flex-col justify-between p-4 text-left disabled:opacity-50`}
          >
            {bloom}
            <span className="relative z-[2] flex w-full items-start justify-between">
              {iconChip(24, "h-12 w-12")}
            </span>
            <span className="relative z-[2] block">
              <span className="block truncate text-[15px] font-semibold leading-tight text-white">{fn.name}</span>
              {statusLine(on ? "Active" : "Standby")}
            </span>
          </motion.button>
        )}

        {/* ── Enum (fan / modes): sliding lit highlight ───────────────── */}
        {fn.type === "Enum" && (
          <div className={`${shell} ${shellState} p-4`}>
            {bloom}
            <div className="relative z-[2] mb-3 flex items-center gap-3">
              {iconChip(22, "h-11 w-11")}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold leading-tight text-white">{fn.name}</p>
                {statusLine(valueLabel(fn, value))}
              </div>
            </div>
            <div className="relative z-[2] flex flex-wrap gap-1 rounded-2xl border border-white/[0.06] bg-black/30 p-1">
              {(fn.range ?? []).map((opt) => {
                const active = String(value ?? "") === opt;
                return (
                  <motion.button
                    key={opt}
                    whileTap={{ scale: 0.94 }}
                    disabled={locked}
                    onClick={() => request(opt)}
                    className={`relative min-w-[60px] flex-1 rounded-xl px-3 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      active ? "text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId={`nb-seg-${uid}`}
                        className="absolute inset-0 rounded-xl bg-[rgb(var(--nb-hue))] shadow-[0_0_24px_-2px_rgb(var(--nb-hue)/0.9)]"
                        transition={{ type: "spring", stiffness: 500, damping: 36 }}
                      />
                    )}
                    <span className="relative">{enumLabel(opt, fn)}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Integer (dimmer/level): glowing slider ──────────────────── */}
        {fn.type === "Integer" && (
          <IntegerPanel fn={fn} value={value} locked={!!locked} onCommit={request} header={iconChip(22, "h-11 w-11")} shell={`${shell} ${shellState}`} bloom={bloom} on={on} />
        )}

        {/* Protected: hatched glass with a small label. Non-admins can't
            toggle; admins tap through to confirm. */}
        {isProtected && !superProtected && (
          <div
            title="Protected control"
            aria-label="Protected control"
            className="pointer-events-none absolute inset-0 z-10 rounded-[24px] bg-[repeating-linear-gradient(135deg,rgba(2,3,10,0.55)_0_8px,rgba(2,3,10,0.35)_8px_16px)] backdrop-grayscale"
          >
            <span className="nb-mono absolute bottom-2 right-3 flex items-center gap-1 text-[9px] uppercase text-amber-300/90">
              <ShieldAlert size={11} /> Protected
            </span>
          </div>
        )}

        {/* Super-protected: the lifeline switch. Loud, locked, never toggled. */}
        {superProtected && (
          <div
            title="Super-protected: powers the whole system, cannot be turned off"
            aria-label="Super-protected: powers the whole system, cannot be turned off"
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[24px] border border-emerald-400/40 bg-[rgba(2,6,10,0.82)] p-3 text-center backdrop-blur-[3px]"
          >
            <div className="nb-scan-y absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-transparent via-emerald-400/15 to-transparent" />
            <ShieldCheck size={28} className="relative text-emerald-300 drop-shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
            <p className="nb-mono relative text-[11px] font-bold uppercase text-emerald-200">Super protected</p>
            <p className="relative text-[11px] font-medium leading-tight text-white/75">Powers the whole system. Cannot be turned off.</p>
          </div>
        )}

        {/* Switch-group indicator */}
        {inGroup && (
          <span
            title="In a switch group"
            aria-label="In a switch group"
            className="pointer-events-none absolute -left-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-indigo-300/40 bg-[#0b0d24] shadow-[0_0_12px_rgba(129,140,248,0.6)]"
          >
            <Link2 size={12} className="text-indigo-300" />
          </span>
        )}

        {/* Favourite star, with a burst when it's added */}
        {onToggleFavourite && (
          <button
            type="button"
            onClick={() => {
              if (!isFavourite) setStarBurst((n) => n + 1);
              sfx("tick");
              onToggleFavourite();
            }}
            aria-pressed={isFavourite}
            title={isFavourite ? "Remove favourite" : "Add favourite"}
            className="absolute -right-1.5 -top-1.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0b0d24] shadow-[0_4px_14px_rgba(0,0,0,0.6)]"
          >
            <AnimatePresence>
              {starBurst > 0 && (
                <motion.span
                  key={starBurst}
                  className="absolute inset-0 rounded-full border-2 border-amber-300"
                  initial={{ scale: 0.6, opacity: 1 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>
            <motion.span key={`s${starBurst}`} initial={starBurst ? { scale: 0.3, rotate: -90 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 14 }}>
              <Star
                size={15}
                className={isFavourite ? "fill-amber-300 text-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.9)]" : "text-slate-500"}
              />
            </motion.span>
          </button>
        )}
      </div>

      {/* Protected confirm */}
      <AnimatePresence>
        {pending !== null && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,3,10,0.7)] p-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPending(null)}
          >
            <motion.div
              className="card w-full max-w-sm p-6"
              initial={{ scale: 0.9, y: 20, filter: "blur(8px)" }}
              animate={{ scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center gap-2 text-slate-100">
                <ShieldAlert size={20} className="text-amber-400" />
                <h2 className="text-lg font-semibold">Protected control</h2>
              </div>
              <p className="mb-5 text-sm text-slate-300">
                “{fn.name}” is protected. Set it to <b>{valueLabel(fn, pending)}</b>?
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPending(null)} className="btn-ghost">
                  <X size={15} /> Cancel
                </button>
                <button
                  onClick={() => {
                    commit(pending);
                    setPending(null);
                  }}
                  className="btn-primary"
                >
                  <Check size={15} /> Yes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Dimmer: shows the level live while dragging and commits on release (like
// Sleek), re-syncing when the device reports a new value.
function IntegerPanel({
  fn,
  value,
  locked,
  onCommit,
  header,
  shell,
  bloom,
  on,
}: {
  fn: ControlTileProps["fn"];
  value: unknown;
  locked: boolean;
  onCommit: (v: unknown) => void;
  header: React.ReactNode;
  shell: string;
  bloom: React.ReactNode;
  on: boolean;
}) {
  const min = fn.min ?? 0;
  const max = fn.max ?? 100;
  const current = typeof value === "number" ? value : min;
  const [local, setLocal] = useState(current);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocal(current);
  }, [current]);
  const fill = max > min ? ((local - min) / (max - min)) * 100 : 0;

  function release(e: React.SyntheticEvent<HTMLInputElement>) {
    dragging.current = false;
    const v = Number(e.currentTarget.value);
    if (v !== current) onCommit(v);
  }

  return (
    <div className={`${shell} p-4`}>
      {bloom}
      <div className="relative z-[2] mb-4 flex items-center gap-3">
        {header}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-white">{fn.name}</p>
          <p className={`nb-mono text-[10px] uppercase ${on ? "text-[rgb(var(--nb-hue))]" : "text-slate-500"}`}>{valueLabel(fn, local)}</p>
        </div>
        <span className="nb-mono text-2xl font-semibold text-white">{Math.round(fill)}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={fn.step ?? 1}
        value={local}
        disabled={locked}
        onPointerDown={() => (dragging.current = true)}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={release}
        onKeyUp={release}
        className="nb-range relative z-[2] disabled:opacity-50"
        style={{ ["--nb-fill" as string]: fill } as React.CSSProperties}
      />
    </div>
  );
}
