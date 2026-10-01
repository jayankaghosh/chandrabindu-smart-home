"use client";

import { useRef, useState } from "react";
import { Download, Upload, Loader2, X } from "lucide-react";

export type ItemKind = "routine" | "automation" | "shortcut";

/** Download one routine / automation / shortcut as a .cnbdu file. */
export function ExportButton({ kind, id, name, className }: { kind: ItemKind; id: string; name: string; className?: string }) {
  return (
    <a
      href={`/api/items/export?kind=${kind}&id=${encodeURIComponent(id)}`}
      download
      aria-label={`Export ${name}`}
      title="Export as .cnbdu"
      className={className ?? "icon-btn h-12 w-12"}
    >
      <Download size={16} />
    </a>
  );
}

/** Pick a .cnbdu item file and import it as a NEW record. Reports back via onDone. */
export function ImportButton({ kind, onDone }: { kind: ItemKind; onDone: (message: string, ok: boolean) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const res = await fetch(`/api/items/import?kind=${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) onDone(d.error || "Import failed", false);
      else onDone([`Imported "${d.name}".`, ...(d.warnings ?? [])].join(" "), true);
    } catch {
      onDone("Import failed", false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => input.current?.click()} disabled={busy} className="btn-ghost">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        Import
      </button>
      <input
        ref={input}
        type="file"
        accept=".cnbdu,application/octet-stream,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Result line for an import (or other one-off action), dismissible. */
export function Notice({ text, ok, onClose }: { text: string; ok: boolean; onClose: () => void }) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-2xl px-4 py-3 text-sm ${
        ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-600 dark:text-red-400"
      }`}
    >
      <span>{text}</span>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
        <X size={15} />
      </button>
    </div>
  );
}

/** Copy text. navigator.clipboard only exists on secure origins, and the hub is
 *  usually plain http on the LAN, so fall back to a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
