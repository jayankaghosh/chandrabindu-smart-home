"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, X, KeyRound, Trash2, Lock } from "lucide-react";
import type { Room } from "@/lib/types";

// Edit-Mode sheet to administer a room's password lock: set or change the
// password (PUT /api/rooms/[id]/lock) or remove the lock entirely (DELETE).
// Session unlock is handled separately by the room's LockedRoom screen.
export default function SleekRoomLockSheet({
  room,
  onClose,
  onSaved,
}: {
  room: Room;
  onClose: () => void;
  onSaved: () => void;
}) {
  const locked = !!room.locked;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/lock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't lock the room");
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${room.id}/lock`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Couldn't remove the lock");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="card w-full max-w-md rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-600 dark:bg-white/10 dark:text-brand-300">
              <Lock size={22} />
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {locked ? "Manage lock" : "Lock room"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="icon-btn">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {locked
            ? `${room.name} is locked. Set a new password, or remove the lock to open it to everyone.`
            : `Set a password so ${room.name} can only be controlled after unlocking.`}
        </p>

        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mb-3"
          placeholder={locked ? "New password (min 4 chars)" : "Password (min 4 chars)"}
        />

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={save}
          disabled={busy || password.length < 4}
          className="btn-primary w-full justify-center"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {locked ? "Update password" : "Lock room"}
        </button>

        {locked && (
          <button
            onClick={remove}
            disabled={busy}
            className="btn-ghost mt-2 w-full justify-center text-red-500"
          >
            <Trash2 size={15} />
            Remove lock
          </button>
        )}
      </motion.div>
    </div>
  );
}
