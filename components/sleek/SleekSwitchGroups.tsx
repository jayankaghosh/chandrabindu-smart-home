"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link2, Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import type { Room, SwitchGroup, SwitchGroupMember } from "@/lib/types";
import { CONTROLLABLE } from "./labels";

// Switch Groups: named sets of Boolean switches kept in sync by the gateway
// (any on → all on, any off → all off). Admins (in Edit Mode) author them here.
export default function SleekSwitchGroups({
  rooms,
  isAdmin,
  editMode,
}: {
  rooms: Room[];
  isAdmin: boolean;
  editMode: boolean;
}) {
  const [groups, setGroups] = useState<SwitchGroup[] | null>(null);
  const [builder, setBuilder] = useState<{ mode: "new" } | { mode: "edit"; group: SwitchGroup } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canEdit = isAdmin && editMode;

  async function load() {
    const res = await fetch("/api/switch-groups");
    if (res.ok) setGroups((await res.json()).groups);
  }
  useEffect(() => {
    load();
  }, []);

  const byId = useMemo(() => new Map(rooms.flatMap((r) => r.devices).map((d) => [d.id, d])), [rooms]);
  const memberLabel = (m: SwitchGroupMember) => {
    const d = byId.get(m.deviceId);
    const f = d?.functions.find((x) => x.code === m.code);
    return `${d?.name ?? "?"} · ${f?.name ?? m.code}`;
  };

  async function del(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/switch-groups/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (groups === null) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <button onClick={() => setBuilder({ mode: "new" })} className="btn-primary">
          <Plus size={16} /> New group
        </button>
      )}

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-white/60 bg-white/40 p-10 text-center text-slate-500 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-400">
          <Link2 className="mx-auto mb-3" />
          No switch groups yet.{canEdit ? " Create one to keep switches in sync." : ""}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.id} className="rounded-3xl border border-white/60 bg-white/50 p-5 dark:border-white/10 dark:bg-white/[0.06]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{g.name}</h3>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setBuilder({ mode: "edit", group: g })} aria-label="Edit" className="icon-btn h-8 w-8">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => del(g.id)} disabled={busy === g.id} aria-label="Delete" className="icon-btn h-8 w-8">
                    {busy === g.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.members.map((m, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/60 bg-white/50 px-3 py-1 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
                >
                  {memberLabel(m)}
                </span>
              ))}
            </div>
          </div>
        ))
      )}

      {builder && (
        <GroupBuilder
          rooms={rooms}
          initial={builder.mode === "edit" ? builder.group : undefined}
          onSaved={() => {
            setBuilder(null);
            load();
          }}
          onCancel={() => setBuilder(null)}
        />
      )}
    </div>
  );
}

function GroupBuilder({
  rooms,
  initial,
  onSaved,
  onCancel,
}: {
  rooms: Room[];
  initial?: SwitchGroup;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [members, setMembers] = useState<SwitchGroupMember[]>(initial?.members ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cascading picker: room → device → Boolean control.
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const room = rooms.find((r) => r.id === roomId);
  const boolDevices = (room?.devices ?? []).filter((d) => !d.bluetooth && d.functions.some((f) => f.type === "Boolean"));
  const [deviceId, setDeviceId] = useState("");
  const device = boolDevices.find((d) => d.id === deviceId) ?? boolDevices[0];
  const boolFns = (device?.functions ?? []).filter((f) => f.type === "Boolean" && CONTROLLABLE.includes(f.type));
  const [code, setCode] = useState("");
  const chosen = boolFns.find((f) => f.code === code) ?? boolFns[0];

  const byId = useMemo(() => new Map(rooms.flatMap((r) => r.devices).map((d) => [d.id, d])), [rooms]);
  const label = (m: SwitchGroupMember) => {
    const d = byId.get(m.deviceId);
    const f = d?.functions.find((x) => x.code === m.code);
    return `${d?.name ?? "?"} · ${f?.name ?? m.code}`;
  };

  function addMember() {
    if (!device || !chosen) return;
    const m = { deviceId: device.id, code: chosen.code };
    if (members.some((x) => x.deviceId === m.deviceId && x.code === m.code)) return;
    setMembers((x) => [...x, m]);
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the group a name");
    if (members.length < 2) return setError("Add at least two switches");
    setSaving(true);
    try {
      const url = initial ? `/api/switch-groups/${initial.id}` : "/api/switch-groups";
      const res = await fetch(url, {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), members }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't save group");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="card max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-b-none rounded-t-3xl p-6 sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{initial ? "Edit group" : "New group"}</h2>
          <button onClick={onCancel} aria-label="Close" className="icon-btn">
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Group name
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Hallway lights" className="field mb-5" />

        {members.length > 0 && (
          <ul className="mb-3 space-y-2">
            {members.map((m, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/50 px-3.5 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.06]"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">{label(m)}</span>
                <button
                  onClick={() => setMembers((x) => x.filter((_, j) => j !== i))}
                  aria-label="Remove"
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select value={roomId} onChange={(e) => { setRoomId(e.target.value); setDeviceId(""); setCode(""); }} className="field !py-2 flex-1">
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select value={device?.id ?? ""} onChange={(e) => { setDeviceId(e.target.value); setCode(""); }} className="field !py-2 flex-1">
            {boolDevices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select value={chosen?.code ?? ""} onChange={(e) => setCode(e.target.value)} className="field !py-2 flex-1">
            {boolFns.map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
          </select>
          <button onClick={addMember} disabled={!chosen} className="btn-primary !px-3">
            <Plus size={15} /> Add
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">
            <X size={15} /> Cancel
          </button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {initial ? "Save changes" : "Save group"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
