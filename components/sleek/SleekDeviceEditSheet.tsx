"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, X, Check, ShieldAlert } from "lucide-react";
import type { UiDevice } from "@/lib/types";
import { CONTROLLABLE } from "./labels";

// Edit-Mode sheet for one device: rename it, move it to another room, relabel
// its controls, and mark controls protected. Saves via the existing admin APIs
// (PATCH /api/devices/[id] for name/room/labels; PUT …/protect per changed
// control), then calls onSaved() so the caller can reload.
export default function SleekDeviceEditSheet({
  device,
  rooms,
  onClose,
  onSaved,
}: {
  device: UiDevice;
  rooms: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const controls = device.functions.filter((f) => CONTROLLABLE.includes(f.type));

  const [name, setName] = useState(device.name);
  const [roomId, setRoomId] = useState(device.roomId);
  // Per-control label + protected, seeded from current values so we can diff.
  const initialLabels: Record<string, string> = {};
  const initialProtected: Record<string, boolean> = {};
  for (const f of controls) {
    initialLabels[f.code] = f.name;
    initialProtected[f.code] = !!f.protected;
  }
  const [labels, setLabels] = useState<Record<string, string>>(initialLabels);
  const [protectedMap, setProtectedMap] = useState<Record<string, boolean>>(initialProtected);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Only send control labels the user actually changed (avoid pinning
      // every default label as an override).
      const changedLabels: Record<string, string> = {};
      for (const f of controls) {
        if (labels[f.code] !== initialLabels[f.code]) changedLabels[f.code] = labels[f.code];
      }
      const res = await fetch(`/api/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, roomId, controls: changedLabels }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Couldn't save changes");
      }
      // Protected flags: PUT only the ones that changed.
      for (const f of controls) {
        if (protectedMap[f.code] !== initialProtected[f.code]) {
          const pr = await fetch(`/api/devices/${device.id}/protect`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: f.code, protected: protectedMap[f.code] }),
          });
          if (!pr.ok) {
            const d = await pr.json().catch(() => ({}));
            throw new Error(d.error || "Couldn't update protection");
          }
        }
      }
      onSaved();
      onClose();
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
        className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Edit device</h2>
          <button onClick={onClose} aria-label="Close" className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Device name
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="field mb-4" placeholder="Device name" />

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Room
        </label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="field mb-5">
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Controls</p>
        <ul className="space-y-2">
          {controls.map((f) => (
            <li
              key={f.code}
              className="rounded-2xl border border-white/50 bg-white/40 p-3 dark:border-white/10 dark:bg-white/[0.05]"
            >
              <input
                value={labels[f.code] ?? ""}
                onChange={(e) => setLabels((m) => ({ ...m, [f.code]: e.target.value }))}
                className="field mb-2 !py-2"
                placeholder={f.code}
              />
              <button
                type="button"
                onClick={() => setProtectedMap((m) => ({ ...m, [f.code]: !m[f.code] }))}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  protectedMap[f.code]
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                    : "bg-black/[0.03] text-slate-500 dark:bg-white/[0.04] dark:text-slate-400"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  Protected {protectedMap[f.code] ? "· on" : "· off"}
                </span>
                {protectedMap[f.code] && <Check size={15} />}
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Save
          </button>
        </div>
      </motion.div>
    </div>
  );
}
