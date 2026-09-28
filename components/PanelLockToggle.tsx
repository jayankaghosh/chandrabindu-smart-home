"use client";

import { Lock, LockOpen } from "lucide-react";

// A dedicated per-panel physical-button lock control (Tuya child lock). Shown in
// a switch panel's header. Admins can toggle it; everyone else sees the state
// read-only. Locking disables the panel's physical buttons (app control still
// works); it is panel-wide.
export default function PanelLockToggle({
  locked,
  isAdmin,
  disabled,
  onToggle,
}: {
  locked: boolean;
  isAdmin: boolean;
  /** True when the panel is offline, so a command would fail. */
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  const interactive = isAdmin && !disabled;
  const Icon = locked ? Lock : LockOpen;
  const label = locked ? "Buttons locked" : "Buttons unlocked";
  const title = !isAdmin
    ? locked
      ? "The physical buttons on this panel are locked by an admin."
      : "The physical buttons on this panel are unlocked."
    : locked
      ? "Physical buttons are locked. Tap to unlock."
      : "Physical buttons work. Tap to lock them.";

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={() => interactive && onToggle(!locked)}
      aria-pressed={locked}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        locked
          ? "bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-300"
          : "bg-slate-200/70 text-slate-500 ring-1 ring-black/5 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10"
      } ${interactive ? "active:scale-95" : "cursor-default"}`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}
