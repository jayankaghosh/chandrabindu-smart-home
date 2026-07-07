"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

interface Health {
  configured: boolean;
  reachable: boolean;
  total?: number;
  connected?: number;
}

// Admin control to rebuild the device gateway's connections after catalog.json
// changes (device IP/key/version, added/removed devices). Automations reload
// automatically, so this is only needed for device/catalog changes.
export default function GatewayControl() {
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway");
      if (res.ok) setHealth(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  async function reinit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gateway/reinit", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Re-initialize failed");
      setMsg(`Rebuilding connections for ${d.total} device${d.total === 1 ? "" : "s"} — reconnecting…`);
      // Connections come back over a few seconds; refresh the count once settled.
      setTimeout(async () => {
        await loadHealth();
        setBusy(false);
      }, 5000);
    } catch (e) {
      setMsg((e as Error).message);
      setBusy(false);
    }
  }

  const statusLine = () => {
    if (!health) return "Checking…";
    if (!health.configured) return "Not configured (GATEWAY_URL is not set) — running in direct mode.";
    if (!health.reachable) return "Gateway not reachable — is the device-gateway process running?";
    return `${health.connected}/${health.total} device connections active.`;
  };

  const ok = health?.configured && health?.reachable;

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        The gateway holds one live connection per device. If you change a device
        (sync, scan, or edit its IP/key), re-initialize so it rebuilds those
        connections. Automations reload on their own — no action needed there.
      </p>

      <div className="mb-3 flex items-center gap-2 text-sm">
        {health && (ok ? (
          <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
        ))}
        <span className="text-slate-600 dark:text-slate-300">{statusLine()}</span>
      </div>

      <button
        onClick={reinit}
        disabled={busy || !health?.configured}
        className="btn-primary"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Re-initialize connections
      </button>

      {msg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{msg}</p>}
    </div>
  );
}
