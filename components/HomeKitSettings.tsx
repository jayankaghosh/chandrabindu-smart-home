"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react";

interface HomekitStatus {
  running: boolean;
  paired: boolean;
  setupCode: string | null;
  rooms: number;
  controls: number;
  routines: number;
  error: string | null;
}

interface HomekitView {
  enabled: boolean;
  gatewayConfigured: boolean;
  gatewayReachable: boolean;
  status: HomekitStatus | null;
  qrSvg: string | null;
}

// Settings card: publish the house to Apple Home (HomeKit bridge in the device
// gateway) and pair it by scanning a QR code. Admin-only.
export default function HomeKitSettings() {
  const [view, setView] = useState<HomekitView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/homekit");
      if (res.ok) setView(await res.json());
    } catch {
      /* keep the last view */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While waiting to be added, check every few seconds so it flips to "Added".
  const waiting = Boolean(view?.enabled && view.status?.running && !view.status.paired);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [waiting, load]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/homekit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) setView(await res.json());
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Remove this house from Apple Home on every device and make a new setup code?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/homekit/reset", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Pairing reset. Scan the new code to add it again." : d.error || "Couldn't reset");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return <Loader2 size={16} className="animate-spin text-slate-400" />;
  }

  const s = view.status;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Control the house from the built-in Home app on any iPhone, iPad or Apple Watch: Control Center, the Lock
        Screen, widgets, StandBy and Siri. Nothing to install, nothing to renew.
      </p>

      <label className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Show this home in Apple Home</span>
        <button
          onClick={() => toggle(!view.enabled)}
          disabled={busy || !view.gatewayConfigured}
          role="switch"
          aria-checked={view.enabled}
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
            view.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
          }`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${view.enabled ? "left-6" : "left-1"}`} />
        </button>
      </label>

      {!view.gatewayConfigured && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Needs the device gateway: it runs the Apple Home bridge. Set <code>GATEWAY_URL</code> for the app.
        </p>
      )}
      {view.gatewayConfigured && !view.gatewayReachable && (
        <p className="text-sm text-amber-600 dark:text-amber-400">The device gateway isn&apos;t responding.</p>
      )}
      {busy && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Working…
        </p>
      )}
      {view.enabled && s?.error && <p className="text-sm text-red-500">{s.error}</p>}

      {view.enabled && s?.running && (
        <div className="flex flex-col gap-5 rounded-2xl border border-white/60 bg-white/50 p-4 sm:flex-row dark:border-white/10 dark:bg-white/[0.04]">
          {view.qrSvg && (
            <div
              className="h-40 w-40 shrink-0 rounded-xl bg-white p-2"
              // Generated on our own server from the bridge's setup URI.
              dangerouslySetInnerHTML={{ __html: view.qrSvg }}
            />
          )}
          <div className="min-w-0 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {s.paired ? (
              <p className="inline-flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={16} /> Added to Apple Home
              </p>
            ) : (
              <p className="font-semibold text-slate-800 dark:text-slate-100">Add it to the Home app</p>
            )}
            <p className="font-mono text-xl tracking-widest text-slate-900 dark:text-slate-100">{s.setupCode}</p>
            {s.paired ? (
              <p>
                Family members get it through Home sharing: in the Home app, Home Settings, Invite People.
              </p>
            ) : (
              <ol className="list-decimal space-y-1 pl-5">
                <li>On your iPhone, open Home, tap +, then Add Accessory, and scan this code.</li>
                <li>Tap Add Anyway when it says the accessory isn&apos;t certified.</li>
                <li>
                  Each room arrives as one accessory: set its room, then (optionally) Show as Separate Tiles.
                </li>
              </ol>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {s.controls} controls in {s.rooms} rooms and {s.routines} routines. Protected and super-protected
              switches, panel button locks and password-locked rooms are kept out of Apple Home.
            </p>
          </div>
        </div>
      )}

      {view.enabled && s?.running && (
        <button onClick={reset} disabled={busy} className="btn-ghost">
          <RotateCcw size={15} /> Reset pairing
        </button>
      )}
      {msg && <p className="text-sm text-slate-600 dark:text-slate-300">{msg}</p>}
    </div>
  );
}
