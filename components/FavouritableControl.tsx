"use client";

import { useRef, useState } from "react";
import { Star, Power, X } from "lucide-react";
import type { DeviceFunction } from "@/lib/types";
import ControlTile from "./ControlTile";

// Wraps a ControlTile. A normal tap controls the device as usual; a long-press
// (or right-click) opens a small menu with "Change state" (quick on/off, or
// off↔medium for a fan) and "Add/Remove favourite". There is no persistent star
// on the tile — favouriting lives in the long-press menu.
export default function FavouritableControl({
  fn,
  value,
  disabled,
  isProtected,
  isFavourite,
  onToggleFavourite,
  onChange,
  caption,
}: {
  fn: DeviceFunction;
  value: unknown;
  disabled?: boolean;
  isProtected?: boolean;
  isFavourite: boolean;
  /** Omit to render a plain tile with no long-press menu (e.g. read-only previews). */
  onToggleFavourite?: () => void;
  onChange: (value: unknown) => void;
  /** Optional small label above the tile (used on the Favourites screen). */
  caption?: string;
}) {
  const wide = fn.type !== "Boolean";
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Long-press detection (pointer-based; works for touch and mouse) ─────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const startPt = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!onToggleFavourite) return;
    longFired.current = false;
    startPt.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timer.current = setTimeout(() => {
      longFired.current = true;
      setMenuOpen(true);
    }, 500);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // Cancel the long-press if the pointer drifts (a scroll/drag, not a hold).
    if (!startPt.current) return;
    const dx = Math.abs(e.clientX - startPt.current.x);
    const dy = Math.abs(e.clientY - startPt.current.y);
    if (dx > 10 || dy > 10) clearTimer();
  };
  // Swallow the click that follows a long-press so the tile doesn't also toggle.
  const onClickCapture = (e: React.MouseEvent) => {
    if (longFired.current) {
      e.preventDefault();
      e.stopPropagation();
      longFired.current = false;
    }
  };
  const onContextMenu = (e: React.MouseEvent) => {
    if (!onToggleFavourite) return;
    e.preventDefault();
    setMenuOpen(true);
  };

  // ── "Change state" behaviour + label ────────────────────────────────────────
  const range = fn.range ?? [];
  const numericEnum =
    fn.type === "Enum" && range.length > 0 && range.every((r) => /^\d+$/.test(r));
  const mediumValue = range.includes("50")
    ? "50"
    : range[Math.max(1, Math.floor(range.length / 2))] ?? range[range.length - 1];
  const enumIsOff = value == null || Number(value) === 0;

  function changeState() {
    if (fn.type === "Boolean") onChange(value !== true);
    else if (numericEnum) onChange(enumIsOff ? mediumValue : "0");
    else if (fn.type === "Enum") onChange(range[0]);
    else if (fn.type === "Integer") {
      const min = fn.min ?? 0;
      const max = fn.max ?? 100;
      const cur = typeof value === "number" ? value : min;
      onChange(cur > min ? min : max);
    }
  }

  let changeLabel = "Change state";
  if (fn.type === "Boolean") changeLabel = value === true ? "Turn off" : "Turn on";
  else if (numericEnum) changeLabel = enumIsOff ? "Set to medium" : "Turn off";

  return (
    <div className={wide ? "col-span-2" : ""}>
      {caption && (
        <p className="mb-1 truncate px-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
          {caption}
        </p>
      )}
      {/* [&>:first-child]:w-full stretches the tile to fill the wrapper. */}
      <div
        className="relative select-none [&>:first-child]:w-full"
        style={{ WebkitTouchCallout: "none" }}
        onPointerDown={onPointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onPointerCancel={clearTimer}
        onPointerMove={onPointerMove}
        onClickCapture={onClickCapture}
        onContextMenu={onContextMenu}
      >
        <ControlTile
          fn={fn}
          value={value}
          disabled={disabled}
          protected={isProtected}
          onChange={onChange}
        />
      </div>

      {menuOpen && onToggleFavourite && (
        <ControlMenu
          title={fn.name}
          changeLabel={changeLabel}
          canControl={!disabled}
          isFavourite={isFavourite}
          onChangeState={() => {
            changeState();
            setMenuOpen(false);
          }}
          onToggleFavourite={() => {
            onToggleFavourite();
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

// Small action sheet shown on long-press / right-click of a control.
function ControlMenu({
  title,
  changeLabel,
  canControl,
  isFavourite,
  onChangeState,
  onToggleFavourite,
  onClose,
}: {
  title: string;
  changeLabel: string;
  canControl: boolean;
  isFavourite: boolean;
  onChangeState: () => void;
  onToggleFavourite: () => void;
  onClose: () => void;
}) {
  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-white/60 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-200 dark:hover:bg-white/10";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-[250px] animate-scale-in p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {title}
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
        <button className={item} disabled={!canControl} onClick={onChangeState}>
          <Power size={16} className="shrink-0 text-brand-600 dark:text-slate-300" />
          {changeLabel}
        </button>
        <button className={item} onClick={onToggleFavourite}>
          <Star
            size={16}
            className={
              isFavourite
                ? "shrink-0 fill-amber-400 text-amber-400"
                : "shrink-0 text-slate-400 dark:text-slate-500"
            }
          />
          {isFavourite ? "Remove from favourites" : "Add to favourites"}
        </button>
      </div>
    </div>
  );
}
