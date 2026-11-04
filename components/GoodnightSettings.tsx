"use client";

import { useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Loader2, CheckCircle2 } from "lucide-react";
import type { Room } from "@/lib/types";

interface Row {
  id: string;
  name: string;
  included: boolean;
}

// Settings card: the order of rooms in the Goodnight round (drag the handle to
// reorder) and which rooms take part. Rooms added later go to the end.
export default function GoodnightSettings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/rooms").then((r) => (r.ok ? r.json() : { rooms: [] })),
      fetch("/api/goodnight").then((r) => (r.ok ? r.json() : { order: [], skip: [] })),
    ])
      .then(([roomsRes, g]) => {
        const rooms: Room[] = (roomsRes.rooms ?? []).filter((r: Room) => r.devices.length > 0);
        const pos = new Map<string, number>((g.order ?? []).map((id: string, i: number) => [id, i]));
        const skip = new Set<string>(g.skip ?? []);
        setRows(
          rooms
            .map((r, i) => ({ r, i }))
            .sort((a, b) => (pos.get(a.r.id) ?? 1e6 + a.i) - (pos.get(b.r.id) ?? 1e6 + b.i))
            .map(({ r }) => ({ id: r.id, name: r.name, included: !skip.has(r.id) })),
        );
      })
      .catch(() => setRows([]));
  }, []);

  function change(next: Row[]) {
    setRows(next);
    setDirty(true);
    setMsg(null);
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    try {
      const res = await fetch("/api/goodnight", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: rows.map((r) => r.id), skip: rows.filter((r) => !r.included).map((r) => r.id) }),
      });
      setMsg(res.ok ? "Saved" : "Couldn't save");
      if (res.ok) setDirty(false);
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <Loader2 size={16} className="animate-spin text-slate-400" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        The order the Goodnight round walks through the house. Drag a room by its handle to move it. Untick a room to
        leave it out of the round.
      </p>

      <Reorder.Group axis="y" values={rows} onReorder={change} className="space-y-2">
        {rows.map((row) => (
          <RoomRow
            key={row.id}
            row={row}
            onToggle={() => change(rows.map((r) => (r.id === row.id ? { ...r, included: !r.included } : r)))}
          />
        ))}
      </Reorder.Group>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !dirty} className="btn-primary disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          Save order
        </button>
        {msg && <span className="text-sm text-slate-600 dark:text-slate-300">{msg}</span>}
      </div>
    </div>
  );
}

function RoomRow({ row, onToggle }: { row: Row; onToggle: () => void }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        aria-label={`Drag to move ${row.name}`}
        className="cursor-grab touch-none text-slate-400 active:cursor-grabbing"
      >
        <GripVertical size={18} />
      </button>
      <span className={`flex-1 text-sm font-medium ${row.included ? "text-slate-800 dark:text-slate-100" : "text-slate-400 line-through"}`}>
        {row.name}
      </span>
      <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <input type="checkbox" checked={row.included} onChange={onToggle} className="h-4 w-4 accent-indigo-500" />
        In the round
      </label>
    </Reorder.Item>
  );
}
