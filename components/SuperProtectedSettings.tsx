"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import type { Room, SuperProtected } from "@/lib/types";

type Option = { key: string; deviceId: string; code: string; label: string };

// Settings card: view and change the super-protected lifeline switch (the one
// that powers the internet / router / hub). Admin-only.
export default function SuperProtectedSettings() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [value, setValue] = useState<SuperProtected | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => {});
    fetch("/api/super-protected")
      .then((r) => r.json())
      .then((d) => setValue(d.value ?? null))
      .catch(() => {});
  }, []);

  const options = useMemo(() => {
    const out: Option[] = [];
    for (const room of rooms) {
      for (const d of room.devices) {
        if (d.bluetooth) continue;
        for (const f of d.functions) {
          if (f.type !== "Boolean") continue;
          out.push({ key: `${d.id}::${f.code}`, deviceId: d.id, code: f.code, label: `${room.name} · ${d.name} · ${f.name}` });
        }
      }
    }
    return out;
  }, [rooms]);

  // Human-readable description of the current setting.
  const current = useMemo(() => {
    if (!value) return "Not set yet";
    if ("none" in value) return "Main switch is not a smart switch";
    const opt = options.find((o) => o.deviceId === value.deviceId && o.code === value.code);
    return opt ? opt.label : "A switch that is no longer in the catalog";
  }, [value, options]);

  async function save(body: { none: true } | { deviceId: string; code: string }) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/super-protected", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save");
      setValue(d.value ?? null);
      setChoice("");
      setMsg("Saved.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveChoice() {
    const opt = options.find((o) => o.key === choice);
    if (!opt) {
      setMsg("Choose a switch first.");
      return;
    }
    save({ deviceId: opt.deviceId, code: opt.code });
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        The switch that powers your internet, router and this hub. It is locked so it can never be
        turned off. If your main switch is a plain (non-smart) switch, mark it as such so the app can run.
      </p>

      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
        <ShieldCheck size={16} className="shrink-0" />
        <span>Current: <b>{current}</b></span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600 dark:text-slate-300">
          <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Change lifeline switch</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy} className="field w-72 max-w-full">
            <option value="">{options.length ? "Select a switch…" : "No on/off switches found"}</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <button onClick={saveChoice} disabled={busy || !choice} className="btn-primary">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          Save
        </button>
        <button onClick={() => save({ none: true })} disabled={busy} className="btn-ghost">
          Not a smart switch
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{msg}</p>}
    </div>
  );
}
