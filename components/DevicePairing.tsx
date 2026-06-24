"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MonitorSmartphone, Copy, Check } from "lucide-react";

// Mints a short-lived pairing code (POST /api/pairing/code) the user enters on
// an external client (the Telegram bot, a TV app, a POS terminal, …) to link it
// to their account. The password is never typed into that client — it exchanges
// this code for a session token server-side.
export default function DevicePairing() {
  const [code, setCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  function startCountdown(expiresAt: number) {
    if (timer.current) clearInterval(timer.current);
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        if (timer.current) clearInterval(timer.current);
        setCode(null);
      }
    };
    tick();
    timer.current = setInterval(tick, 1000);
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/pairing/code", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not generate a code");
      setCode(data.code);
      startCountdown(data.expiresAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable over plain HTTP — ignore */
    }
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Link an external client — the Telegram bot, a TV, a POS terminal — to your
        account. Generate a code and enter it on the device (for the Telegram bot,
        send{" "}
        <code className="rounded bg-slate-200/60 px-1 py-0.5 text-xs dark:bg-white/10">
          /pair &lt;code&gt;
        </code>
        ). The code is single-use and expires shortly.
      </p>

      {code ? (
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-semibold tracking-[0.3em] text-slate-900 dark:text-slate-100">
            {code}
          </span>
          <button type="button" onClick={copy} className="icon-btn" title="Copy code">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            expires in {mins}:{secs}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="btn-primary"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <MonitorSmartphone size={15} />
          )}
          Generate pairing code
        </button>
      )}

      {error && (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}
