"use client";

import { Play, Pencil } from "lucide-react";

// Segmented Run / Edit control for the Sleek home header (admin only). Run Mode
// is the lightweight control-only surface; Edit Mode reveals management
// features. The caller persists the choice (editMode.ts) and gates on isAdmin.
//
// Deliberately uses plain conditional styling (no framer layoutId): a
// shared-layout animation here fought AnimatePresence's screen transitions and
// stalled navigation.
export default function SleekModeToggle({
  editMode,
  onChange,
}: {
  editMode: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Run or Edit mode"
      className="inline-flex items-center rounded-2xl border border-white/60 bg-white/50 p-1 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]"
    >
      {(
        [
          { key: false, label: "Run", Icon: Play },
          { key: true, label: "Edit", Icon: Pencil },
        ] as const
      ).map(({ key, label, Icon }) => {
        const active = editMode === key;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
              active
                ? `${key ? "bg-amber-500" : "bg-brand-500"} text-white shadow`
                : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
