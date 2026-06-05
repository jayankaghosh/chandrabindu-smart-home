"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ChangePassword({
  minLength = 4,
}: {
  minLength?: number;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords don't match" });
      return;
    }
    setSaving(true);
    // Guard against a hung request leaving the button spinning forever.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      setMsg({ ok: true, text: "Password updated." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({
        ok: false,
        text: controller.signal.aborted
          ? "Request timed out — please try again."
          : (err as Error).message,
      });
    } finally {
      clearTimeout(timeout);
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Change your password. You'll stay signed in on this device.
      </p>
      <form onSubmit={onSubmit} className="space-y-2.5">
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="field"
          placeholder="Current password"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="field"
          placeholder={`New password (min ${minLength} chars)`}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="field"
          placeholder="Confirm new password"
        />
        <button
          type="submit"
          disabled={saving || !current || next.length < minLength || !confirm}
          className="btn-primary"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CheckCircle2 size={15} />
          )}
          Update password
        </button>
        {msg && (
          <p
            className={`text-sm ${
              msg.ok ? "text-slate-600 dark:text-slate-300" : "text-red-500"
            }`}
          >
            {msg.text}
          </p>
        )}
      </form>
    </div>
  );
}
