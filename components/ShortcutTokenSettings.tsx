"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Eye, EyeOff, KeyRound, Loader2, Trash2 } from "lucide-react";
import { copyText } from "./sleek/ItemTransfer";

// Settings card: the shortcut_token that API-enabled shortcuts accept in their
// run URL. One token for all shortcuts; regenerating breaks the old URLs.
export default function ShortcutTokenSettings() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/shortcuts/token")
      .then((r) => (r.ok ? r.json() : { token: null }))
      .then((d) => setToken(d.token ?? null))
      .catch(() => setToken(null));
  }, []);

  async function generate() {
    if (token && !confirm("Make a new token? Every shortcut URL using the old one stops working.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shortcuts/token", { method: "POST" });
      if (res.ok) {
        setToken((await res.json()).token);
        setShow(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove the token? Shortcuts can then no longer be run by URL.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shortcuts/token", { method: "DELETE" });
      if (res.ok) setToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (token && (await copyText(token))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (token === undefined) return <Loader2 size={16} className="animate-spin text-slate-400" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Shortcuts with &quot;Accessible via API&quot; turned on can be run by opening
        <code className="mx-1">/api/shortcuts/&lt;id&gt;/run?shortcut_token=…</code>
        (each shortcut card shows its full URL to copy). Handy for an iPhone Shortcut that runs when you join the home
        Wi-Fi. Anyone with the URL can run those shortcuts, so keep it private.
      </p>

      {token ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-black/[0.04] px-3 py-2 font-mono text-sm text-slate-700 dark:bg-white/[0.06] dark:text-slate-200">
            {show ? token : "•".repeat(24)}
          </code>
          <button onClick={() => setShow((v) => !v)} className="btn-ghost" aria-label={show ? "Hide token" : "Show token"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button onClick={copy} className="btn-ghost">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-600 dark:text-amber-400">No token yet: running shortcuts by URL is off.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={generate} disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
          {token ? "Regenerate token" : "Generate token"}
        </button>
        {token && (
          <button onClick={remove} disabled={busy} className="btn-ghost text-red-500">
            <Trash2 size={15} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
