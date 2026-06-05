"use client";

import { useState } from "react";
import { Loader2, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { DEVICE_TYPES } from "@/lib/regions";

export default function ManualDeviceForm({
  onAdded,
}: {
  onAdded?: () => void;
}) {
  const [id, setId] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(DEVICE_TYPES[0].value);
  const [room, setRoom] = useState("");
  const [version, setVersion] = useState("3.4");
  const [ip, setIp] = useState("");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; reachable: boolean; functions: number; error: string | null }
    | { ok: false; error: string }
    | null
  >(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/devices/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id.trim(),
          key: key.trim(),
          name: name.trim(),
          type,
          roomName: room.trim(),
          version,
          ip: ip.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data.error || "Failed to add device" });
      } else {
        setResult({
          ok: true,
          reachable: data.reachable,
          functions: data.functions,
          error: data.error,
        });
        setId("");
        setKey("");
        setName("");
        setRoom("");
        setIp("");
        onAdded?.();
      }
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "field";

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Device ID</label>
          <input value={id} onChange={(e) => setId(e.target.value)} className={field} placeholder="d7abc…" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            Local key
          </label>
          <input value={key} onChange={(e) => setKey(e.target.value)} className={field} placeholder="16-char key" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Living room switch" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Room</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)} className={field} placeholder="Living Room" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
            {DEVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            Protocol version
          </label>
          <select value={version} onChange={(e) => setVersion(e.target.value)} className={field}>
            {["3.4", "3.3", "3.5", "3.1"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">
            IP address (optional — speeds up first connect)
          </label>
          <input value={ip} onChange={(e) => setIp(e.target.value)} className={field} placeholder="192.168.1.50" />
        </div>
      </div>

      {result && result.ok && (
        <div
          className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
            result.reachable
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-amber-50 text-amber-700 dark:text-slate-200 border border-amber-200"
          }`}
        >
          {result.reachable ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>
            {result.reachable
              ? `Added — found ${result.functions} controllable action${result.functions === 1 ? "" : "s"} over the LAN.`
              : `Saved, but couldn't reach it on the network${result.error ? `: ${result.error}` : ""}. It will work once it's online.`}
          </span>
        </div>
      )}
      {result && !result.ok && (
        <p className="text-sm text-red-500">{result.error}</p>
      )}

      <button
        type="submit"
        disabled={busy || !id || !key || !name}
        className="btn-primary"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        Add device
      </button>
    </form>
  );
}
