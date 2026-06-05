"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  Lock,
  ArrowRight,
  Check,
  X,
  Sparkles,
  Maximize2,
  Minimize2,
  Wand2,
} from "lucide-react";

interface Action {
  deviceId: string;
  code: string;
  value: unknown;
  deviceName: string;
  roomName: string;
  controlName: string;
  valueLabel: string;
  locked?: boolean;
}

interface Routine {
  routineId: string;
  name: string;
  actionCount: number;
}

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: Action[];
  routines?: Routine[];
}

interface Pending {
  actions: Action[];
  routines: Routine[];
}

export default function Assistant({ available }: { available: boolean }) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, confirm, open]);

  const nextId = () => ++idRef.current;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const userMsg: Msg = { id: nextId(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The assistant failed to reply");
      const actions: Action[] = Array.isArray(data.actions) ? data.actions : [];
      const routines: Routine[] = Array.isArray(data.routines) ? data.routines : [];
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          content: data.reply || "…",
          actions,
          routines,
        },
      ]);
      if (actions.length || routines.length) setConfirm({ actions, routines });
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function runConfirmed() {
    if (!confirm) return;
    setRunning(true);
    try {
      let ok = 0;
      let failed = 0;
      let skipped = 0;
      // Ad-hoc device actions in one batch.
      if (confirm.actions.length) {
        const res = await fetch("/api/ai/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: confirm.actions.map((a) => ({
              deviceId: a.deviceId,
              code: a.code,
              value: a.value,
            })),
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Failed to run");
        ok += d.ok || 0;
        failed += d.failed || 0;
        skipped += d.ignoredLocked || 0;
      }
      // Saved routines via the normal routine-run endpoint (delays, locks).
      for (const r of confirm.routines) {
        const res = await fetch(`/api/routines/${r.routineId}/run`, {
          method: "POST",
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          ok += d.ok || 0;
          failed += d.failed || 0;
          skipped += d.ignoredLocked || 0;
        } else {
          failed += r.actionCount;
        }
      }
      const bits = [`${ok} done`];
      if (failed) bits.push(`${failed} failed`);
      if (skipped) bits.push(`${skipped} skipped (locked)`);
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", content: `✓ ${bits.join(" · ")}.` },
      ]);
      setConfirm(null);
    } catch (e2) {
      setError((e2 as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function cancelConfirm() {
    setConfirm(null);
    setMessages((m) => [
      ...m,
      { id: nextId(), role: "assistant", content: "Okay, I won't make any changes." },
    ]);
  }

  if (!available) return null;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Open assistant"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_12px_30px_-6px_rgba(79,70,229,0.6)] transition hover:scale-105"
        >
          <Bot size={24} />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div
          className={
            fullscreen
              ? "fixed inset-3 z-40 sm:inset-6"
              : "fixed bottom-6 right-6 z-40 h-[min(78vh,600px)] w-[min(94vw,400px)]"
          }
        >
          <div className="card flex h-full flex-col overflow-hidden p-0 shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/50 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:bg-white/10 dark:text-slate-200">
                  <Bot size={16} />
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Assistant
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFullscreen((f) => !f)}
                  title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  className="icon-btn h-8 w-8"
                >
                  {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className="icon-btn h-8 w-8"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div
              className={`min-h-0 flex-1 space-y-4 overflow-y-auto p-4 ${
                fullscreen ? "mx-auto w-full max-w-3xl" : ""
              }`}
            >
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center px-2 text-center text-slate-500 dark:text-slate-400">
                  <Sparkles size={24} className="mb-3 text-brand-500 dark:text-slate-200" />
                  <p className="font-medium text-slate-700 dark:text-slate-200">
                    Ask about your home or give a command
                  </p>
                  <p className="mx-auto mt-1 max-w-xs text-sm">
                    e.g. "How many lights are on?" or "Turn on all the striplights
                    and turn the other lights off."
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      m.role === "user"
                        ? "bg-brand-500/15 text-brand-600 dark:bg-white/10 dark:text-slate-200"
                        : "bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-200"
                    }`}
                  >
                    {m.role === "user" ? <User size={15} /> : <Bot size={15} />}
                  </span>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-brand-500 text-white"
                        : "bg-white/60 text-slate-800 dark:bg-white/[0.07] dark:text-slate-100"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    {((m.actions && m.actions.length > 0) ||
                      (m.routines && m.routines.length > 0)) && (
                      <ul className="mt-2 space-y-1 border-t border-black/10 pt-2 dark:border-white/10">
                        {m.routines?.map((r, i) => (
                          <li key={`r${i}`} className="flex items-center gap-1.5 text-xs">
                            <Wand2 size={11} className="shrink-0 opacity-70" />
                            <span className="font-semibold">Run "{r.name}"</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              ({r.actionCount} action{r.actionCount === 1 ? "" : "s"})
                            </span>
                          </li>
                        ))}
                        {m.actions?.map((a, i) => (
                          <li key={`a${i}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-slate-400 dark:text-slate-500">
                              {a.roomName} ·
                            </span>
                            <span className="font-medium">{a.deviceName}</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {a.controlName}
                            </span>
                            <ArrowRight size={11} className="shrink-0 opacity-60" />
                            <span className="font-semibold">{a.valueLabel}</span>
                            {a.locked && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-300">
                                <Lock size={10} /> locked
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-200">
                    <Bot size={15} />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl bg-white/60 px-3.5 py-2.5 text-sm text-slate-500 dark:bg-white/[0.07] dark:text-slate-300">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {error && <p className="px-4 pb-1 text-sm text-red-500">{error}</p>}

            {/* Composer */}
            <form
              onSubmit={send}
              className={`flex shrink-0 items-center gap-2 border-t border-white/50 p-3 dark:border-white/10 ${
                fullscreen ? "mx-auto w-full max-w-3xl" : ""
              }`}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask or command your home…"
                className="field"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="btn-primary shrink-0"
              >
                {sending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation popup */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => !running && cancelConfirm()}
        >
          <div
            className="card w-full max-w-md animate-scale-in p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Confirm these actions?
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              The assistant will run{" "}
              {[
                confirm.routines.length &&
                  `${confirm.routines.length} routine${confirm.routines.length === 1 ? "" : "s"}`,
                confirm.actions.length &&
                  `${confirm.actions.length} device action${confirm.actions.length === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" and ")}
              :
            </p>
            <ul className="mb-5 max-h-64 space-y-1.5 overflow-y-auto">
              {confirm.routines.map((r, i) => (
                <li
                  key={`r${i}`}
                  className="flex items-center gap-2 rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/60 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <Wand2 size={14} className="shrink-0 text-fuchsia-600 dark:text-slate-300" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Run "{r.name}"
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {r.actionCount} action{r.actionCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
              {confirm.actions.map((a, i) => (
                <li
                  key={`a${i}`}
                  className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/60 bg-white/50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <span className="text-slate-400 dark:text-slate-500">
                    {a.roomName}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {a.deviceName}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {a.controlName}
                  </span>
                  <ArrowRight size={12} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {a.valueLabel}
                  </span>
                  {a.locked && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-300">
                      <Lock size={11} /> locked — will skip
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              <button onClick={cancelConfirm} disabled={running} className="btn-ghost">
                <X size={15} />
                Cancel
              </button>
              <button onClick={runConfirmed} disabled={running} className="btn-primary">
                {running ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                Yes, do it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
