"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Zap, Command, Power, Play, Loader2, Globe } from "lucide-react";
import type { Automation, EnrichedRoutine, Room, Shortcut } from "@/lib/types";
import { isTriggerCondition } from "@/lib/types";
import { HUES, haptic, pulseFrom, sfx } from "../fx";
import { describeAction, describeCondition, makeLookup } from "./describe";
import { Chip, Empty, Label, List, Loading, Row } from "./ui";

function useRoutineNames() {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/routines")
      .then((r) => (r.ok ? r.json() : { routines: [] }))
      .then((d) => setNames(Object.fromEntries((d.routines ?? []).map((r: EnrichedRoutine) => [r.id, r.name]))))
      .catch(() => {});
  }, []);
  return (id: string) => names[id] ?? "a routine";
}

function useDescribers(rooms: Room[]) {
  const look = useMemo(() => makeLookup(rooms), [rooms]);
  const roomName = useCallback((id: string) => rooms.find((r) => r.id === id)?.name ?? "a room", [rooms]);
  const routineName = useRoutineNames();
  return { look, roomName, routineName };
}

// Automations as rule circuits: WHEN (time / sun triggers), IF (device
// guards), THEN (actions), with the admin's live enable switch.
export function AutomationsPanel({ rooms, isAdmin }: { rooms: Room[]; isAdmin: boolean }) {
  const [items, setItems] = useState<Automation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { look, roomName, routineName } = useDescribers(rooms);

  const load = useCallback(async () => {
    const res = await fetch("/api/automations").catch(() => null);
    setItems(res?.ok ? (await res.json()).automations ?? [] : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(a: Automation, el: HTMLElement) {
    if (!isAdmin) return;
    setBusy(a.id);
    pulseFrom(el, a.enabled ? HUES.white : HUES.socket, 0.8);
    sfx(a.enabled ? "off" : "on");
    try {
      await fetch(`/api/automations/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!items) return <Loading />;
  if (items.length === 0) return <Empty icon={<Zap size={26} />} title="No automations yet" hint="Admins can create them under Manage in Edit Mode." />;

  return (
    <List>
      {items.map((a) => {
        const triggers = a.conditions.filter(isTriggerCondition);
        const guards = a.conditions.filter((c) => !isTriggerCondition(c));
        return (
          <Row key={a.id} lit={a.enabled}>
            <div className="flex items-start gap-3 pl-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-white">{a.name}</p>
                <p className={`nb-mono text-[10px] uppercase ${a.enabled ? "text-[rgb(var(--nb-hue))]" : "text-slate-500"}`}>{a.enabled ? "Armed" : "Disarmed"}</p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={(e) => toggle(a, e.currentTarget)}
                disabled={!isAdmin || busy === a.id}
                title={isAdmin ? (a.enabled ? "Disarm" : "Arm") : "Admin only"}
                aria-label={`${a.enabled ? "Disarm" : "Arm"} ${a.name}`}
                className={`relative h-8 w-14 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
                  a.enabled ? "border-[rgb(var(--nb-hue)/0.5)] bg-[rgb(var(--nb-hue)/0.25)]" : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <motion.span
                  layout
                  className={`absolute top-1 flex h-6 w-6 items-center justify-center rounded-full ${a.enabled ? "right-1 bg-[rgb(var(--nb-hue))] shadow-[0_0_12px_rgb(var(--nb-hue))]" : "left-1 bg-slate-500"}`}
                >
                  {busy === a.id ? <Loader2 size={12} className="animate-spin text-slate-950" /> : <Power size={12} className="text-slate-950" />}
                </motion.span>
              </motion.button>
            </div>
            <div className="mt-3 space-y-1.5 pl-2">
              {triggers.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Label>When</Label>
                  {triggers.map((c, i) => <Chip key={i} tone="when">{describeCondition(c, look, roomName)}</Chip>)}
                </div>
              )}
              {guards.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Label>{triggers.length ? "If" : a.match === "all" ? "If all" : "If any"}</Label>
                  {guards.map((c, i) => <Chip key={i} tone="if">{describeCondition(c, look, roomName)}</Chip>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Label>Then</Label>
                {a.actions.map((x, i) => <Chip key={i} tone="then">{describeAction(x, look, routineName)}</Chip>)}
              </div>
            </div>
          </Row>
        );
      })}
    </List>
  );
}

// Shortcuts: conditions checked live when you press Run.
export function ShortcutsPanel({ rooms }: { rooms: Room[] }) {
  const [items, setItems] = useState<Shortcut[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { text: string; ok: boolean } | undefined>>({});
  const { look, roomName, routineName } = useDescribers(rooms);

  useEffect(() => {
    fetch("/api/shortcuts")
      .then((r) => (r.ok ? r.json() : { shortcuts: [] }))
      .then((d) => setItems(d.shortcuts ?? []))
      .catch(() => setItems([]));
  }, []);

  async function run(s: Shortcut, el: HTMLElement) {
    setBusy(s.id);
    pulseFrom(el, [0.35, 0.65, 1], 1.2);
    sfx("power");
    haptic(18);
    let r: { text: string; ok: boolean };
    try {
      const res = await fetch(`/api/shortcuts/${s.id}/run`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      r = !res.ok ? { text: d.error || "Failed", ok: false } : { text: d.ran ? d.message : "Conditions not met", ok: !!d.ran };
    } catch {
      r = { text: "Failed", ok: false };
    }
    setBusy(null);
    setResult((m) => ({ ...m, [s.id]: r }));
    setTimeout(() => setResult((m) => (m[s.id] === r ? { ...m, [s.id]: undefined } : m)), 5000);
  }

  if (!items) return <Loading />;
  if (items.length === 0) return <Empty icon={<Command size={26} />} title="No shortcuts yet" hint="Admins can create them under Manage in Edit Mode." />;

  return (
    <List>
      {items.map((s) => {
        const res = result[s.id];
        return (
          <Row key={s.id} lit={!!res?.ok}>
            <div className="flex items-start gap-3 pl-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-base font-semibold text-white">
                  {s.name}
                  {s.apiEnabled && <Globe size={13} className="shrink-0 text-sky-300" aria-label="Runs by URL too" />}
                </p>
                {res ? (
                  <p className={`text-xs ${res.ok ? "text-emerald-300" : "text-amber-300"}`}>{res.text}</p>
                ) : (
                  <p className="nb-mono text-[10px] uppercase text-slate-500">{s.conditions.length ? `${s.match === "all" ? "All" : "Any"} of ${s.conditions.length}` : "Always"}</p>
                )}
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.06 }}
                disabled={busy === s.id}
                onClick={(e) => run(s, e.currentTarget)}
                aria-label={`Run ${s.name}`}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,rgb(var(--nb-hue))_45%,rgb(var(--nb-hue)/0.5))] text-slate-950 shadow-[0_0_26px_-4px_rgb(var(--nb-hue)/0.9)]"
              >
                {busy === s.id ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="translate-x-0.5" />}
              </motion.button>
            </div>
            <div className="mt-3 space-y-1.5 pl-2">
              {s.conditions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Label>If</Label>
                  {s.conditions.map((c, i) => <Chip key={i} tone="if">{describeCondition(c, look, roomName)}</Chip>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Label>Then</Label>
                {s.actions.map((x, i) => <Chip key={i} tone="then">{describeAction(x, look, routineName)}</Chip>)}
              </div>
            </div>
          </Row>
        );
      })}
    </List>
  );
}
