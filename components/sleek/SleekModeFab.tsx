"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pencil } from "lucide-react";
import SleekModeToggle from "./SleekModeToggle";

// Small floating Run / Edit button (bottom-centre, every Sleek screen, admin
// only). Collapsed it is just an icon showing the current mode (amber pencil
// while editing, so a device is never silently left editable); a tap opens the
// Run / Edit toggle above it, and picking a mode or tapping elsewhere closes it.
export default function SleekModeFab({
  editMode,
  onChange,
}: {
  editMode: boolean;
  onChange: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const Icon = editMode ? Pencil : Play;

  return (
    <div ref={root} className="fixed bottom-9 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {open && (
        <SleekModeToggle
          editMode={editMode}
          onChange={(on) => {
            onChange(on);
            setOpen(false);
          }}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${editMode ? "Edit" : "Run"} mode. Change mode`}
        aria-expanded={open}
        title={editMode ? "Edit mode" : "Run mode"}
        className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-xl transition-colors ${
          editMode
            ? "border-amber-400/60 bg-amber-500 text-white"
            : "border-white/60 bg-white/70 text-slate-500 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"
        }`}
      >
        <Icon size={16} />
      </button>
    </div>
  );
}
