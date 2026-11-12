"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Star, ShieldAlert, ShieldCheck, Link2, Pencil, X, Check, Minus, Plus } from "lucide-react";
import type { DeviceFunction } from "@/lib/types";
import { controlKind, iconForControl } from "@/lib/icons";
import { isFanLevel } from "@/lib/onCount";
import { enumLabel, isOn, valueLabel } from "../sleek/labels";
import { HUES, cssHue, emitPulse, haptic, sfx } from "./fx";

export interface ControlOrbProps {
  fn: DeviceFunction;
  value: unknown;
  /** Unreachable panel, locked room, or protected for a non-admin. */
  disabled?: boolean;
  isProtected?: boolean;
  isAdmin?: boolean;
  isFavourite?: boolean;
  inGroup?: boolean;
  /** Second label line (e.g. "Device · Room" in favourites). */
  caption?: string;
  onCommand: (value: unknown) => void;
  onToggleFavourite?: () => void;
  /** Edit Mode: open the device editor. */
  onEdit?: () => void;
  size?: number;
}

type Anchor = { x: number; y: number };

// A control as a sphere. Switches toggle on tap; fan speeds and modes open a
// radial dial of options around the orb; dimmers open a circular drag dial.
// Long-press (touch) or right-click opens the favourite / edit menu. Same
// rules as every other tile: protected controls confirm (admins) or are
// disabled (everyone else), the super-protected lifeline is locked on, and the
// server enforces all of it again.
export default function ControlOrb({
  fn,
  value,
  disabled,
  isProtected,
  isAdmin,
  isFavourite,
  inGroup,
  caption,
  onCommand,
  onToggleFavourite,
  onEdit,
  size = 72,
}: ControlOrbProps) {
  const kind = controlKind(fn.name, fn.code);
  const Icon = iconForControl(kind);
  const on = isOn(fn, value);
  const superProtected = fn.superProtected === true;
  const locked = !!disabled || superProtected;
  const hue = HUES[kind];

  const orbRef = useRef<HTMLButtonElement | null>(null);
  const point = useRef<Anchor | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const [burst, setBurst] = useState(0);
  const [pending, setPending] = useState<unknown>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [dial, setDial] = useState<Anchor | null>(null);

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

  function center(): Anchor {
    const r = orbRef.current?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
  }

  function effects(nextOn: boolean) {
    const at = point.current ?? center();
    setBurst((b) => b + 1);
    emitPulse(at.x, at.y, nextOn ? hue : HUES.white, nextOn ? 1 : 0.55);
    sfx(nextOn ? "on" : "off");
    haptic(nextOn ? 14 : 8);
  }

  function commit(v: unknown) {
    onCommand(v);
    effects(isOn(fn, v));
  }

  function request(v: unknown) {
    if (locked) return;
    if (isProtected && isAdmin) {
      setPending(v);
      return;
    }
    commit(v);
  }

  function activate() {
    if (locked) return;
    if (fn.type === "Boolean") request(value !== true);
    else {
      sfx("nav");
      setDial(center());
    }
  }

  const hasMenu = !!onToggleFavourite || !!onEdit;
  function startPress(e: React.PointerEvent) {
    point.current = { x: e.clientX, y: e.clientY };
    longPressed.current = false;
    if (!hasMenu || e.pointerType === "mouse") return;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      haptic(20);
      sfx("tick");
      setMenu(center());
    }, 480);
  }
  function endPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  const stateText = superProtected ? "Always on" : valueLabel(fn, value);

  return (
    <div className="flex w-[96px] flex-col items-center gap-2 text-center" style={{ ["--nb-hue" as string]: cssHue(hue) }}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Orbit ring while on */}
        {on && (
          <svg viewBox="0 0 100 100" className="nb-spin-slow pointer-events-none absolute -inset-[14%] h-[128%] w-[128%]" aria-hidden>
            <circle cx="50" cy="50" r="48" fill="none" strokeWidth="0.8" strokeDasharray="3 7" style={{ stroke: "rgb(var(--nb-hue) / 0.7)" }} />
            <circle cx="50" cy="2" r="1.8" style={{ fill: "rgb(var(--nb-hue))" }} />
          </svg>
        )}
        <motion.button
          ref={orbRef}
          type="button"
          disabled={locked}
          aria-pressed={fn.type === "Boolean" ? on : undefined}
          aria-label={`${fn.name}, ${stateText}${caption ? `, ${caption}` : ""}`}
          whileTap={{ scale: 0.88 }}
          whileHover={locked ? undefined : { scale: 1.08 }}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={endPress}
          onKeyDown={() => (point.current = null)}
          onClick={() => {
            if (longPressed.current) return;
            activate();
          }}
          onContextMenu={(e) => {
            if (!hasMenu) return;
            e.preventDefault();
            sfx("tick");
            setMenu(center());
          }}
          className="relative h-full w-full overflow-hidden rounded-full border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 disabled:cursor-not-allowed"
          style={{
            background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.14), rgba(22,26,64,0.75) 55%, rgba(4,5,16,0.95))",
            opacity: disabled && !superProtected ? 0.45 : 1,
          }}
        >
          {/* Lit sphere */}
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            initial={false}
            animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background:
                "radial-gradient(circle at 35% 28%, #ffffff 0%, rgb(var(--nb-hue)) 32%, rgb(var(--nb-hue) / 0.55) 68%, rgba(4,5,16,0.9) 100%)",
            }}
          />
          <span
            className={`relative z-[1] flex h-full w-full items-center justify-center transition-colors duration-300 ${on ? "text-slate-950" : "text-slate-400"}`}
          >
            <span
              className={fanSpeed > 0 ? "nb-fan-spin inline-flex" : "inline-flex"}
              style={fanSpeed > 0 ? ({ ["--nb-fan" as string]: `${fanSpeed}s` } as React.CSSProperties) : undefined}
            >
              <Icon size={Math.round(size * 0.36)} />
            </span>
          </span>
          {/* Hatching for protected controls */}
          {isProtected && !superProtected && (
            <span aria-hidden className="absolute inset-0 z-[2] rounded-full bg-[repeating-linear-gradient(135deg,rgba(2,3,10,0.5)_0_5px,transparent_5px_10px)]" />
          )}
        </motion.button>
        {/* Glow */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[1] rounded-full"
          initial={false}
          animate={{ opacity: on ? 1 : 0 }}
          style={{ boxShadow: "0 0 26px rgb(var(--nb-hue) / 0.75), 0 0 70px rgb(var(--nb-hue) / 0.35)" }}
        />
        {/* Tap burst */}
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border-2"
              style={{ borderColor: "rgb(var(--nb-hue))" }}
              initial={{ scale: 1, opacity: 0.9 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </AnimatePresence>
        {/* Badges */}
        {isFavourite && (
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-[#0b0d24]">
            <Star size={11} className="fill-amber-300 text-amber-300" />
          </span>
        )}
        {inGroup && (
          <span title="In a switch group" className="pointer-events-none absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-indigo-300/30 bg-[#0b0d24]">
            <Link2 size={10} className="text-indigo-300" />
          </span>
        )}
        {isProtected && !superProtected && (
          <span title="Protected" className="pointer-events-none absolute -bottom-1 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-amber-300/30 bg-[#0b0d24]">
            <ShieldAlert size={11} className="text-amber-300" />
          </span>
        )}
        {superProtected && (
          <span
            title="Super-protected: powers the whole system, cannot be turned off"
            className="pointer-events-none absolute inset-[-6px] rounded-full border-2 border-emerald-400/70 shadow-[0_0_18px_rgba(52,211,153,0.6)]"
          >
            <ShieldCheck size={14} className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#04110c] text-emerald-300" />
          </span>
        )}
      </div>
      <div className="min-w-0 max-w-full">
        <p className="line-clamp-2 text-[12px] font-medium leading-tight text-slate-100" title={fn.name}>
          {fn.name}
        </p>
        {caption && <p className="truncate text-[10px] text-slate-500">{caption}</p>}
        <p className={`nb-mono text-[9px] uppercase ${superProtected ? "text-emerald-300" : on ? "text-[rgb(var(--nb-hue))]" : "text-slate-500"}`}>{stateText}</p>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          // The portal leaves the orb's subtree, so it carries the hue itself.
          <div style={{ ["--nb-hue" as string]: cssHue(hue) }}>
            <AnimatePresence>
              {dial && fn.type === "Enum" && (
                <RadialOptions key="enum" anchor={dial} fn={fn} value={value} onPick={(v) => { setDial(null); request(v); }} onClose={() => setDial(null)} />
              )}
              {dial && fn.type === "Integer" && (
                <RingDial key="int" anchor={dial} fn={fn} value={value} onCommit={(v) => { setDial(null); request(v); }} onClose={() => setDial(null)} />
              )}
              {menu && (
                <OrbMenu
                  key="menu"
                  anchor={menu}
                  isFavourite={!!isFavourite}
                  onFavourite={onToggleFavourite ? () => { setMenu(null); sfx("tick"); onToggleFavourite(); } : undefined}
                  onEdit={onEdit ? () => { setMenu(null); onEdit(); } : undefined}
                  onClose={() => setMenu(null)}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {pending !== null && (
                <ConfirmProtected
                  name={fn.name}
                  label={valueLabel(fn, pending)}
                  onCancel={() => setPending(null)}
                  onConfirm={() => {
                    commit(pending);
                    setPending(null);
                  }}
                />
              )}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </div>
  );
}

// Keep a popover's centre far enough from the edges for its contents.
function clampAnchor(a: Anchor, pad: number): Anchor {
  return {
    x: Math.min(Math.max(a.x, pad), window.innerWidth - pad),
    y: Math.min(Math.max(a.y, pad), window.innerHeight - pad),
  };
}

// Escape closes the topmost popover only: caught in the capture phase and
// stopped, so the shell's Escape (close panel / leave room) doesn't also fire.
function useEscape(onClose: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
}

function Backdrop({ onClose, dim = true }: { onClose: () => void; dim?: boolean }) {
  return (
    <motion.div
      className={`fixed inset-0 z-[70] ${dim ? "bg-[rgba(2,3,10,0.45)] backdrop-blur-[2px]" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    />
  );
}

// Options fanned out on an arc round the orb (above it, or below near the top).
function RadialOptions({
  anchor,
  fn,
  value,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  fn: DeviceFunction;
  value: unknown;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const opts = fn.range ?? [];
  const a = clampAnchor(anchor, 130);
  const below = a.y < 200;
  const radius = 96 + Math.max(0, opts.length - 5) * 10;
  const span = Math.min(200, 40 * Math.max(opts.length - 1, 1));
  const start = (below ? 90 : -90) - span / 2;
  return (
    <>
      <Backdrop onClose={onClose} />
      <div className="pointer-events-none fixed z-[71]" style={{ left: a.x, top: a.y }}>
        <motion.div
          className="pointer-events-none absolute -left-10 -top-10 h-20 w-20 rounded-full border border-[rgb(var(--nb-hue)/0.5)]"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
        />
        {opts.map((opt, i) => {
          const ang = ((start + (opts.length === 1 ? span / 2 : (span * i) / (opts.length - 1))) * Math.PI) / 180;
          const x = Math.cos(ang) * radius;
          const y = Math.sin(ang) * radius;
          const active = String(value ?? "") === opt;
          return (
            <motion.button
              key={opt}
              type="button"
              className={`pointer-events-auto absolute flex h-16 w-16 items-center justify-center rounded-full border text-[12px] font-semibold ${
                active
                  ? "border-transparent bg-[rgb(var(--nb-hue))] text-slate-950 shadow-[0_0_26px_rgb(var(--nb-hue)/0.8)]"
                  : "border-white/15 bg-[rgba(8,10,28,0.9)] text-slate-200 hover:border-[rgb(var(--nb-hue)/0.7)] hover:text-white"
              }`}
              style={{ left: -32, top: -32 }}
              initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
              animate={{ x, y, scale: 1, opacity: 1 }}
              exit={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 26, delay: i * 0.03 }}
              onClick={() => onPick(opt)}
            >
              {enumLabel(opt, fn)}
            </motion.button>
          );
        })}
      </div>
    </>
  );
}

// A 270° drag dial for dimmers: drag round the ring (or use − / +), release to
// send. The level shows live in the centre.
function RingDial({
  anchor,
  fn,
  value,
  onCommit,
  onClose,
}: {
  anchor: Anchor;
  fn: DeviceFunction;
  value: unknown;
  onCommit: (v: number) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const min = fn.min ?? 0;
  const max = fn.max ?? 100;
  const step = fn.step ?? 1;
  const [v, setV] = useState(typeof value === "number" ? value : min);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const a = clampAnchor(anchor, 150);
  const frac = max > min ? (v - min) / (max - min) : 0;
  const R = 92;
  const C = 2 * Math.PI * R;
  const arc = C * 0.75;

  function fromPointer(e: React.PointerEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    // 0 at the bottom-left end (135°), clockwise round to 405°.
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 135) deg += 360;
    const f = Math.min(1, Math.max(0, (deg - 135) / 270));
    const raw = min + f * (max - min);
    setV(Math.round(raw / step) * step);
  }
  const nudge = (d: number) => setV((x) => Math.min(max, Math.max(min, x + d)));

  return (
    <>
      <Backdrop onClose={onClose} />
      {/* Centring lives on a plain wrapper: Framer owns the inner transform. */}
      <div className="fixed z-[71] -translate-x-1/2 -translate-y-[110px]" style={{ left: a.x, top: a.y }}>
      <motion.div
        className="flex flex-col items-center"
        initial={{ scale: 0.5, opacity: 0, filter: "blur(8px)" }}
        animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 220 220"
          className="h-[220px] w-[220px] touch-none rounded-full bg-[rgba(6,8,22,0.9)] shadow-[0_0_60px_-10px_rgb(var(--nb-hue)/0.7)]"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          <circle cx="110" cy="110" r={R} fill="none" strokeWidth="12" strokeLinecap="round" stroke="rgba(148,163,255,0.14)" strokeDasharray={`${arc} ${C}`} transform="rotate(135 110 110)" />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${arc * frac} ${C}`}
            transform="rotate(135 110 110)"
            style={{ stroke: "rgb(var(--nb-hue))", filter: "drop-shadow(0 0 6px rgb(var(--nb-hue)))" }}
          />
          <circle
            cx={110 + Math.cos(((135 + frac * 270) * Math.PI) / 180) * R}
            cy={110 + Math.sin(((135 + frac * 270) * Math.PI) / 180) * R}
            r="11"
            fill="#fff"
            style={{ filter: "drop-shadow(0 0 8px rgb(var(--nb-hue)))" }}
          />
          <text x="110" y="112" textAnchor="middle" className="fill-white text-[38px] font-semibold">
            {Math.round(frac * 100)}%
          </text>
          <text x="110" y="138" textAnchor="middle" className="nb-mono fill-slate-400 text-[10px] uppercase">
            {fn.name.slice(0, 22)}
          </text>
        </svg>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={() => nudge(-Math.max(step, (max - min) / 10))} aria-label="Lower" className="icon-btn !rounded-full">
            <Minus size={16} />
          </button>
          <button type="button" onClick={() => onCommit(v)} className="btn-primary !rounded-full !px-5">
            <Check size={15} /> Set
          </button>
          <button type="button" onClick={() => nudge(Math.max(step, (max - min) / 10))} aria-label="Raise" className="icon-btn !rounded-full">
            <Plus size={16} />
          </button>
        </div>
      </motion.div>
      </div>
    </>
  );
}

function OrbMenu({
  anchor,
  isFavourite,
  onFavourite,
  onEdit,
  onClose,
}: {
  anchor: Anchor;
  isFavourite: boolean;
  onFavourite?: () => void;
  onEdit?: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const a = clampAnchor(anchor, 120);
  return (
    <>
      <Backdrop onClose={onClose} dim={false} />
      <div className="fixed z-[71] -translate-x-1/2" style={{ left: a.x, top: a.y + 46 }}>
      <motion.div
        role="menu"
        className="min-w-[190px] overflow-hidden rounded-2xl border border-white/10 bg-[rgba(8,10,28,0.92)] p-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.95 }}
      >
        {onFavourite && (
          <button role="menuitem" onClick={onFavourite} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/[0.06]">
            <Star size={15} className={isFavourite ? "fill-amber-300 text-amber-300" : "text-slate-400"} />
            {isFavourite ? "Remove favourite" : "Add favourite"}
          </button>
        )}
        {onEdit && (
          <button role="menuitem" onClick={onEdit} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/[0.06]">
            <Pencil size={15} className="text-slate-400" />
            Edit device
          </button>
        )}
      </motion.div>
      </div>
    </>
  );
}

function ConfirmProtected({ name, label, onCancel, onConfirm }: { name: string; label: string; onCancel: () => void; onConfirm: () => void }) {
  useEscape(onCancel);
  return (
    <motion.div
      className="fixed inset-0 z-[72] flex items-center justify-center bg-[rgba(2,3,10,0.7)] p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
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
          “{name}” is protected. Set it to <b>{label}</b>?
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">
            <X size={15} /> Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary">
            <Check size={15} /> Yes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
