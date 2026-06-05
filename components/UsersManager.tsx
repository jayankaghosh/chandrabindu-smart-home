"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  UserPlus,
  Trash2,
  KeyRound,
  ShieldCheck,
  X,
  Check,
} from "lucide-react";

interface PublicUser {
  username: string;
  createdAt: number;
}

export default function UsersManager() {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-user form
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [adding, setAdding] = useState(false);

  // Per-user password reset
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (!res.ok) return;
    setUsers((await res.json()).users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newName, password: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add user");
      setNewName("");
      setNewPass("");
      load();
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(username: string) {
    setBusy(username);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to remove user");
      load();
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    setBusy(resetFor);
    setResetMsg(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(resetFor)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResetMsg("Password updated.");
      setResetPass("");
      setResetFor(null);
    } catch (e2) {
      setResetMsg((e2 as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Standard users can sign in to view rooms, run routines and control
        devices, but can't add or change anything. You (the{" "}
        <span className="font-medium text-slate-700 dark:text-slate-200">admin user</span>)
        manage them here.
      </p>

      {/* Existing users */}
      {users && users.length > 0 && (
        <ul className="mb-4 space-y-2">
          {users.map((u) => (
            <li
              key={u.username}
              className="rounded-xl border border-white/60 dark:border-white/10 bg-white/50 dark:bg-white/[0.06] px-3 py-2.5 backdrop-blur-md"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {u.username}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => {
                      setResetMsg(null);
                      setResetPass("");
                      setResetFor((v) => (v === u.username ? null : u.username));
                    }}
                    title="Reset password"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    <KeyRound size={13} />
                  </button>
                  <button
                    onClick={() => remove(u.username)}
                    disabled={busy === u.username}
                    title="Remove user"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    {busy === u.username ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Trash2 size={13} />
                    )}
                  </button>
                </div>
              </div>

              {resetFor === u.username && (
                <form onSubmit={resetPassword} className="mt-2.5 flex items-center gap-2">
                  <input
                    type="password"
                    autoFocus
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="field"
                  />
                  <button
                    type="submit"
                    disabled={busy === u.username || resetPass.length < 6}
                    className="btn-primary"
                  >
                    <Check size={14} />
                    Set
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetFor(null)}
                    className="icon-btn h-9 w-9"
                  >
                    <X size={14} />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {users && users.length === 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.05] px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
          <ShieldCheck size={15} />
          No users yet — only the admin user can sign in.
        </p>
      )}

      {resetMsg && <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{resetMsg}</p>}

      {/* Add a user */}
      <form onSubmit={add} className="space-y-2.5 border-t border-white/50 dark:border-white/10 pt-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Add a user</p>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="field"
          placeholder="Username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <input
          type="password"
          value={newPass}
          onChange={(e) => setNewPass(e.target.value)}
          className="field"
          placeholder="Password (min 6 chars)"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim() || newPass.length < 6}
          className="btn-primary"
        >
          {adding ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <UserPlus size={15} />
          )}
          Add user
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>
    </div>
  );
}
