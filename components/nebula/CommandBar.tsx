"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, Orbit, Power, PowerOff, Play, Command as CommandIcon, CornerDownLeft, type LucideIcon } from "lucide-react";
import type { EnrichedRoutine, Room, Shortcut } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { controlKind, iconForControl } from "@/lib/icons";
import { isChildLock } from "@/lib/panelLock";
import { DOCK, type DockKey } from "./Dock";
import { HUES, emitPulse, haptic, requestMaster, sfx } from "./fx";

export type CommandAction = { id: string; title: string; hint: string; icon: LucideIcon; run: () => void };

type Item = {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  group: string;
  run: () => void;
};

// Type to drive the house. Matches every word you type against rooms,
// controls, routines, shortcuts and systems; ending with "on" or "off" sets a
// switch directly ("kitchen light off"). Arrow keys pick, Enter runs.
export default function CommandBar({
  rooms,
  statusByDevice,
  isAdmin,
  onClose,
  onEnterRoom,
  onOpen,
  onCommand,
  actions = [],
}: {
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  onClose: () => void;
  onEnterRoom: (roomId: string) => void;
  onOpen: (k: DockKey) => void;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  /** Extra shell actions (sound, settings, sign-out) listed under Systems. */
  actions?: CommandAction[];
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [routines, setRoutines] = useState<EnrichedRoutine[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch("/api/routines").then((r) => (r.ok ? r.json() : { routines: [] })).then((d) => setRoutines(d.routines ?? [])).catch(() => {});
    fetch("/api/shortcuts").then((r) => (r.ok ? r.json() : { shortcuts: [] })).then((d) => setShortcuts(d.shortcuts ?? [])).catch(() => {});
  }, []);

  const done = (msg: string) => {
    setFlash(msg);
    sfx("power");
    haptic(16);
    emitPulse(innerWidth / 2, innerHeight * 0.3, HUES.white, 1.2);
    setTimeout(onClose, 650);
  };

  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  const want: boolean | null = words.length > 1 && (last === "on" || last === "off") ? last === "on" : null;
  const terms = want === null ? words : words.slice(0, -1);
  const matches = (text: string) => terms.every((t) => text.toLowerCase().includes(t));

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const d of DOCK) {
      out.push({ id: `sys:${d.key}`, title: d.label, hint: "Open", icon: d.icon, group: "Systems", run: () => { onOpen(d.key); onClose(); } });
    }
    out.push({ id: "m:on", title: "All on", hint: "Master", icon: Power, group: "Systems", run: () => { onClose(); requestMaster(true); } });
    out.push({ id: "m:off", title: "All off", hint: "Master", icon: PowerOff, group: "Systems", run: () => { onClose(); requestMaster(false); } });
    for (const a of actions) out.push({ ...a, group: "Systems", run: () => { onClose(); a.run(); } });
    for (const r of rooms) {
      if (r.devices.length === 0) continue;
      out.push({ id: `room:${r.id}`, title: r.name, hint: "Enter world", icon: Orbit, group: "Worlds", run: () => { onEnterRoom(r.id); onClose(); } });
      const accessible = !r.locked || r.unlocked === true;
      if (!accessible) continue;
      for (const d of r.devices) {
        if (d.bluetooth || statusByDevice[d.id]?.reachable === false) continue;
        for (const f of d.functions) {
          if (f.type !== "Boolean" || isChildLock(f.code) || f.superProtected || (f.protected && !isAdmin)) continue;
          const cur = statusByDevice[d.id]?.values?.[f.code] === true;
          out.push({
            id: `ctl:${d.id}:${f.code}`,
            title: `${f.name}`,
            hint: `${r.name} · ${cur ? "on" : "off"}`,
            icon: iconForControl(controlKind(f.name, f.code)),
            group: "Controls",
            // Protected controls only appear for admins; the server still checks.
            run: () => {
              const next = want ?? !cur;
              onCommand(d.id, f.code, next);
              done(`${f.name} ${next ? "on" : "off"}`);
            },
          });
        }
      }
    }
    for (const r of routines) {
      out.push({
        id: `rt:${r.id}`,
        title: r.name,
        hint: `Routine · ${r.actions.length} actions`,
        icon: Play,
        group: "Routines",
        run: () => {
          fetch(`/api/routines/${r.id}/run`, { method: "POST" }).catch(() => {});
          done(`Running ${r.name}`);
        },
      });
    }
    for (const s of shortcuts) {
      out.push({
        id: `sc:${s.id}`,
        title: s.name,
        hint: "Shortcut",
        icon: CommandIcon,
        group: "Shortcuts",
        run: () => {
          fetch(`/api/shortcuts/${s.id}/run`, { method: "POST" }).catch(() => {});
          done(`Ran ${s.name}`);
        },
      });
    }
    return out;
    // `want` and `done` are read when an item runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, statusByDevice, routines, shortcuts, isAdmin, want, actions]);

  const results = (terms.length === 0 ? items.filter((i) => i.group !== "Controls") : items.filter((i) => matches(`${i.title} ${i.hint} ${i.group}`)))
    .filter((i) => want === null || i.group === "Controls")
    .slice(0, 40);

  useEffect(() => setSel(0), [q]);

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
      sfx("tick");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
      sfx("tick");
    } else if (e.key === "Enter") {
      results[sel]?.run();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  let lastGroup = "";
  return (
    <motion.div className="fixed inset-0 z-[60] flex justify-center bg-[rgba(2,3,10,0.6)] px-4 pt-[12vh] backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="relative h-fit w-full max-w-xl overflow-hidden rounded-[26px] border border-cyan-300/20 bg-[rgba(6,8,22,0.92)] shadow-[0_40px_120px_-30px_rgba(34,211,238,0.45)]"
        initial={{ y: -30, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: -20, scale: 0.96, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          <Search size={18} className="text-cyan-300" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={key}
            placeholder="Go to a room, flip a switch, run a routine…"
            className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-500"
            aria-label="Command"
          />
          <kbd className="nb-mono rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500">ESC</kbd>
        </div>
        {flash ? (
          <motion.p initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="nb-mono px-5 py-8 text-center text-sm uppercase text-cyan-200">
            {flash}
          </motion.p>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto p-2" role="listbox">
            {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Nothing matches “{q}”.</li>}
            {results.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              const Icon = it.icon;
              const active = i === sel;
              return (
                <li key={it.id}>
                  {header && <p className="nb-mono px-3 pb-1 pt-3 text-[9px] uppercase text-slate-600">{header}</p>}
                  <button
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => it.run()}
                    className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${active ? "text-white" : "text-slate-300"}`}
                  >
                    {active && <motion.span layoutId="nb-cmd-sel" className="absolute inset-0 rounded-2xl border border-cyan-300/25 bg-cyan-300/[0.08]" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.05] text-cyan-200">
                      <Icon size={15} />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block truncate text-sm">{it.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {it.group === "Controls" && want !== null ? `Turn ${want ? "on" : "off"} · ${it.hint.split(" · ")[0]}` : it.hint}
                      </span>
                    </span>
                    {active && <CornerDownLeft size={14} className="relative text-slate-500" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </motion.div>
  );
}
