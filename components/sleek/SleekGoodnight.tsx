"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, X, Volume2, VolumeX, ChevronLeft, ChevronRight, RotateCw, Check, Loader2, Power, WifiOff, Lock } from "lucide-react";
import type { DeviceFunction, Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { countsAsOn, isFanLevel } from "@/lib/onCount";
import { isChildLock } from "@/lib/panelLock";

// Goodnight round: a calm, dark full-screen walk through the house, one room at a
// time, in the order set in Settings. Turning the dial (drag, scroll wheel or
// arrows) moves between rooms with a tick; landing on a room asks its switches
// directly (?fresh=1) and the room settles as checked once everything in it is
// confirmed off. Anything on can be turned off with one tap. The header says
// what changed since this user's last finished round (gateway history), so a
// repeat check gets a short, true answer. Deliberately no counters or streaks.

const SOUND_KEY = "sleek-goodnight-sound";
const DIAL = 280;
const CENTER = DIAL / 2;
const RING_R = 118;
const MAX_STEP_DEG = 40; // drag distance per room, at most

interface Cfg {
  order: string[];
  skip: string[];
  lastCheck: { checkedAt: number; on: string[] } | null;
  changes: { deviceId: string; code: string; value: boolean; at: number }[];
}

interface OnControl {
  deviceId: string;
  fn: DeviceFunction;
  name: string;
}

/** A control that takes part in the round: a switch or a fan, never a lock or a protected one. */
function inRound(fn: DeviceFunction): boolean {
  return !fn.protected && !fn.superProtected && !isChildLock(fn.code) && (fn.type === "Boolean" || isFanLevel(fn));
}

function roundDevices(room: Room) {
  return room.devices.filter((d) => !d.bluetooth && d.functions.some(inRound));
}

function fmtTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function SleekGoodnight({
  rooms,
  statusByDevice,
  live,
  sendCommand,
  fetchDeviceStatus,
  onClose,
}: {
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  live: boolean;
  sendCommand: (deviceId: string, code: string, value: unknown) => Promise<void>;
  fetchDeviceStatus: (id: string, fresh?: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmedAt, setConfirmedAt] = useState<Record<string, number>>({});
  const [unreachable, setUnreachable] = useState<Record<string, string[]>>({});
  const [checking, setChecking] = useState<string | null>(null);
  // Rooms with a panel that won't answer, which she chose to leave for tonight.
  const [excused, setExcused] = useState<Set<string>>(new Set());
  const [ripple, setRipple] = useState(0);
  const [sound, setSound] = useState(true);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const statusRef = useRef(statusByDevice);
  statusRef.current = statusByDevice;

  useEffect(() => {
    fetch("/api/goodnight")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCfg(d ?? { order: [], skip: [], lastCheck: null, changes: [] }))
      .catch(() => setCfg({ order: [], skip: [], lastCheck: null, changes: [] }));
    try {
      setSound(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  // The round: rooms in the saved order (new rooms go at the end), minus skipped
  // rooms and rooms with nothing to check.
  const round = useMemo(() => {
    if (!cfg) return [];
    const pos = new Map(cfg.order.map((id, i) => [id, i]));
    return rooms
      .filter((r) => !cfg.skip.includes(r.id) && roundDevices(r).length > 0)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (pos.get(a.r.id) ?? 1e6 + a.i) - (pos.get(b.r.id) ?? 1e6 + b.i))
      .map(({ r }) => r);
  }, [rooms, cfg]);

  const room = round[Math.min(idx, Math.max(0, round.length - 1))];
  const accessible = (r: Room) => !r.locked || r.unlocked !== false;

  const onIn = useCallback(
    (r: Room): OnControl[] =>
      roundDevices(r).flatMap((d) =>
        d.functions
          .filter((f) => inRound(f) && countsAsOn(f, statusByDevice[d.id]?.values?.[f.code]))
          .map((fn) => ({ deviceId: d.id, fn, name: fn.name || d.name })),
      ),
    [statusByDevice],
  );

  // ── Sound + haptics ────────────────────────────────────────────────────────
  const audio = useRef<AudioContext | null>(null);
  const tick = useCallback(() => {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* not supported */
    }
    if (!sound) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      audio.current ??= new Ctx();
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1800;
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.035);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch {
      /* ignore */
    }
  }, [sound]);

  const toggleSound = () => {
    setSound((s) => {
      try {
        localStorage.setItem(SOUND_KEY, s ? "off" : "on");
      } catch {
        /* ignore */
      }
      return !s;
    });
  };

  const step = useCallback(
    (dir: 1 | -1) => {
      if (round.length === 0) return;
      setIdx((i) => (i + dir + round.length) % round.length);
      tick();
    },
    [round.length, tick],
  );

  // ── Checking a room ────────────────────────────────────────────────────────
  const recheck = useCallback(
    async (r: Room) => {
      setRipple((n) => n + 1);
      if (!accessible(r)) {
        // A locked room can't be read on demand; the live connection still shows it.
        setUnreachable((u) => ({ ...u, [r.id]: [] }));
        setConfirmedAt((c) => ({ ...c, [r.id]: Date.now() }));
        return;
      }
      setChecking(r.id);
      const devices = roundDevices(r);
      const results = await Promise.all(devices.map((d) => fetchDeviceStatus(d.id, true)));
      setUnreachable((u) => ({ ...u, [r.id]: devices.filter((_, i) => !results[i]).map((d) => d.name) }));
      setConfirmedAt((c) => ({ ...c, [r.id]: Date.now() }));
      setChecking((c) => (c === r.id ? null : c));
    },
    [fetchDeviceStatus],
  );

  // Landing on a room asks its switches (after a short pause, so spinning
  // through rooms doesn't fire a read for each one).
  const roomId = room?.id;
  useEffect(() => {
    if (!room) return;
    const last = confirmedAt[room.id] ?? 0;
    if (Date.now() - last < 5000) return;
    const t = setTimeout(() => recheck(room), 450);
    return () => clearTimeout(t);
  }, [roomId]);

  // A room is checked once it has been confirmed, every panel answered and nothing is on.
  useEffect(() => {
    setChecked((prev) => {
      let next = prev;
      for (const r of round) {
        const ok = confirmedAt[r.id] && ((unreachable[r.id]?.length ?? 0) === 0 || excused.has(r.id)) && onIn(r).length === 0;
        if (ok && !prev.has(r.id)) {
          if (next === prev) next = new Set(prev);
          next.add(r.id);
        } else if (!ok && prev.has(r.id)) {
          if (next === prev) next = new Set(prev);
          next.delete(r.id);
        }
      }
      return next;
    });
  }, [round, confirmedAt, unreachable, excused, onIn]);

  async function turnOff(items: OnControl[]) {
    if (!room) return;
    await Promise.all(items.map((c) => sendCommand(c.deviceId, c.fn.code, c.fn.type === "Boolean" ? false : "0")));
    const r = room;
    setTimeout(() => recheck(r), 900);
  }

  // Every room checked: the round is finished. Record it once.
  const allChecked = round.length > 0 && round.every((r) => checked.has(r.id));
  useEffect(() => {
    if (!allChecked || finishedAt) return;
    const at = Date.now();
    setFinishedAt(at);
    const on: string[] = [];
    for (const r of rooms)
      for (const d of r.devices)
        for (const f of d.functions)
          if (inRound(f) && countsAsOn(f, statusRef.current[d.id]?.values?.[f.code])) on.push(`${d.id}:${f.code}`);
    fetch("/api/goodnight/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    }).catch(() => {});
  }, [allChecked, finishedAt, rooms]);

  function again() {
    setChecked(new Set());
    setConfirmedAt({});
    setUnreachable({});
    setExcused(new Set());
    setFinishedAt(null);
    setIdx(0);
  }

  // ── "Since you last checked" ──────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!cfg) return null;
    const last = cfg.lastCheck;
    if (!last) return { lead: "Turn the dial to walk through the house, one room at a time.", lines: [] as string[] };
    const fnByKey = new Map<string, { fn: DeviceFunction; room: string; device: string }>();
    for (const r of rooms) for (const d of r.devices) for (const f of d.functions) if (inRound(f)) fnByKey.set(`${d.id}:${f.code}`, { fn: f, room: r.name, device: d.name });
    const label = (k: string) => {
      const x = fnByKey.get(k)!;
      return `${x.fn.name || x.device} (${x.room})`;
    };
    const lines: string[] = [];
    const seen = new Set<string>();
    if (live) {
      // Last recorded change per switch since the round.
      const lastEvent = new Map<string, Cfg["changes"][number]>();
      for (const e of cfg.changes) if (fnByKey.has(`${e.deviceId}:${e.code}`)) lastEvent.set(`${e.deviceId}:${e.code}`, e);
      for (const [k, e] of lastEvent) {
        seen.add(k);
        lines.push(`${label(k)} turned ${e.value ? "on" : "off"} at ${fmtTime(e.at)}`);
      }
    }
    // Anything on now that wasn't then (fans aren't in the history, and without
    // the gateway nothing is).
    for (const [k, x] of fnByKey) {
      const [deviceId] = k.split(":");
      if (seen.has(k) || last.on.includes(k)) continue;
      if (countsAsOn(x.fn, statusByDevice[deviceId]?.values?.[x.fn.code])) lines.push(`${label(k)} is on now`);
    }
    const t = fmtTime(last.checkedAt);
    if (lines.length) return { lead: `Since your last check at ${t}:`, lines };
    if (!live) return { lead: `Everything is the same as at ${t}, when you last checked.`, lines };
    return {
      lead: last.on.length === 0 ? `Everything has stayed off since ${t}, when you last checked.` : `Everything is as you left it at ${t}.`,
      lines,
    };
  }, [cfg, rooms, live, statusByDevice]);

  // ── Dial ───────────────────────────────────────────────────────────────────
  const dialRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ angle: number; acc: number } | null>(null);
  const [spin, setSpin] = useState(0); // knob rotation, degrees (unbounded)
  const stepDeg = round.length ? Math.min(360 / round.length, MAX_STEP_DEG) : MAX_STEP_DEG;

  const angleAt = (e: React.PointerEvent) => {
    const rect = dialRef.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { angle: angleAt(e), acc: 0 };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const a = angleAt(e);
    let d = a - drag.current.angle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.current.angle = a;
    drag.current.acc += d;
    setSpin((s) => s + d);
    while (drag.current.acc >= stepDeg) {
      drag.current.acc -= stepDeg;
      step(1);
    }
    while (drag.current.acc <= -stepDeg) {
      drag.current.acc += stepDeg;
      step(-1);
    }
  };
  const onUp = () => {
    drag.current = null;
  };
  const wheelAcc = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    wheelAcc.current += e.deltaY;
    if (Math.abs(wheelAcc.current) >= 60) {
      const dir = wheelAcc.current > 0 ? 1 : -1;
      wheelAcc.current = 0;
      setSpin((s) => s + dir * stepDeg);
      step(dir);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const on = room ? onIn(room) : [];
  const isChecking = room && checking === room.id;
  const lost = room ? unreachable[room.id] ?? [] : [];
  const confirmed = room ? confirmedAt[room.id] : undefined;
  const pointer = round.length ? (idx * 360) / round.length : 0;

  return (
    <div className="fixed inset-0 z-[65] overflow-y-auto bg-[#060912] text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.18),transparent_60%)]" />
      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-10 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Moon size={20} className="text-indigo-300" />
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">Goodnight</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleSound} aria-label={sound ? "Mute the dial" : "Unmute the dial"} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-white/5">
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:bg-white/5">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Since you last checked */}
        {summary && (
          <div className="mt-4 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-300">
            <p>{summary.lead}</p>
            {summary.lines.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-slate-400">
                {summary.lines.slice(0, 6).map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {summary.lines.length > 6 && <li>and {summary.lines.length - 6} more</li>}
              </ul>
            )}
          </div>
        )}

        {!cfg ? (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : round.length === 0 ? (
          <p className="mt-16 text-center text-slate-400">No rooms to check. Choose them in Settings, Goodnight round.</p>
        ) : finishedAt ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
            <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="flex h-28 w-28 items-center justify-center rounded-full bg-indigo-400/10">
              <Moon size={44} className="text-indigo-200" />
            </motion.div>
            <h2 className="text-2xl font-semibold text-slate-100">The house is asleep.</h2>
            <p className="text-slate-400">Every room checked at {fmtTime(finishedAt)}.</p>
            <div className="mt-4 flex gap-3">
              <button onClick={again} className="rounded-2xl bg-white/[0.06] px-5 py-3 font-medium text-slate-200">
                Go round again
              </button>
              <button onClick={onClose} className="rounded-2xl bg-indigo-500/80 px-5 py-3 font-medium text-white">
                Done
              </button>
            </div>
          </motion.div>
        ) : (
          <>
            <p className="mt-5 text-center text-xs font-medium uppercase tracking-widest text-slate-500">
              {checked.size} of {round.length} rooms checked
            </p>

            {/* The dial */}
            <div
              ref={dialRef}
              className="relative mx-auto mt-4 touch-none select-none"
              style={{ width: DIAL, height: DIAL }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onWheel={onWheel}
              role="slider"
              tabIndex={0}
              aria-label="Rooms"
              aria-valuemin={1}
              aria-valuemax={round.length}
              aria-valuenow={idx + 1}
              aria-valuetext={room?.name}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") step(1);
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") step(-1);
                if (e.key === "Enter" || e.key === " ") room && recheck(room);
              }}
            >
              <svg width={DIAL} height={DIAL} className="absolute inset-0">
                {/* Room dots around the edge: filled once checked */}
                {round.map((r, i) => {
                  const a = ((i * 360) / round.length - 90) * (Math.PI / 180);
                  const x = CENTER + RING_R * Math.cos(a);
                  const y = CENTER + RING_R * Math.sin(a);
                  const current = i === idx;
                  return (
                    <circle
                      key={r.id}
                      cx={x}
                      cy={y}
                      r={current ? 6 : 4.5}
                      className="transition-all duration-700"
                      fill={checked.has(r.id) ? "rgba(52,211,153,0.75)" : current ? "rgba(165,180,252,0.9)" : "rgba(100,116,139,0.45)"}
                    />
                  );
                })}
                {/* Knob notches: turn with your finger */}
                <g transform={`rotate(${spin} ${CENTER} ${CENTER})`}>
                  {Array.from({ length: 36 }, (_, i) => {
                    const a = (i * 10 * Math.PI) / 180;
                    return (
                      <line
                        key={i}
                        x1={CENTER + 96 * Math.cos(a)}
                        y1={CENTER + 96 * Math.sin(a)}
                        x2={CENTER + (i % 3 === 0 ? 104 : 101) * Math.cos(a)}
                        y2={CENTER + (i % 3 === 0 ? 104 : 101) * Math.sin(a)}
                        stroke="rgba(148,163,184,0.25)"
                        strokeWidth={i % 3 === 0 ? 2 : 1}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
                {/* Pointer to the current room's dot */}
                <g transform={`rotate(${pointer} ${CENTER} ${CENTER})`} className="transition-transform duration-300">
                  <circle cx={CENTER} cy={CENTER - 84} r={3} fill="rgba(165,180,252,0.9)" />
                </g>
              </svg>

              {/* Ripple when the switches are asked */}
              <AnimatePresence>
                <motion.div
                  key={ripple}
                  initial={{ scale: 0.55, opacity: 0.35 }}
                  animate={{ scale: 1.25, opacity: 0 }}
                  transition={{ duration: 1.6, ease: "easeOut" }}
                  className="pointer-events-none absolute rounded-full border border-indigo-300/50"
                  style={{ left: CENTER - 80, top: CENTER - 80, width: 160, height: 160 }}
                />
              </AnimatePresence>

              {/* Centre: the room. Tap to check again. Breathes slowly. */}
              <motion.button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => room && recheck(room)}
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className={`absolute flex flex-col items-center justify-center rounded-full text-center transition-colors duration-1000 ${
                  room && checked.has(room.id) ? "bg-emerald-400/[0.08]" : "bg-white/[0.04]"
                }`}
                style={{ left: CENTER - 76, top: CENTER - 76, width: 152, height: 152 }}
                aria-label={room ? `Check ${room.name} again` : "Check again"}
              >
                <span className="px-3 text-lg font-semibold leading-tight text-slate-100">{room?.name}</span>
                <span className="mt-1 flex items-center gap-1 text-sm">
                  {isChecking ? (
                    <span className="text-slate-400">Asking…</span>
                  ) : room && checked.has(room.id) ? (
                    <span className="flex items-center gap-1 text-emerald-300/90">
                      <Check size={14} /> All off
                    </span>
                  ) : on.length > 0 ? (
                    <span className="text-amber-300/90">{on.length} on</span>
                  ) : lost.length > 0 ? (
                    <span className="text-slate-400">Not sure</span>
                  ) : (
                    <span className="text-slate-500"> </span>
                  )}
                </span>
              </motion.button>
            </div>

            {/* What's in this room */}
            {room && (
              <div className="mt-6 min-h-[120px] space-y-2">
                {!accessible(room) && (
                  <p className="flex items-center gap-2 text-sm text-slate-400">
                    <Lock size={14} /> Locked room: shown from the live connection{on.length ? ". Unlock it to switch things off." : "."}
                  </p>
                )}
                {lost.length > 0 && (
                  <div className="flex items-start justify-between gap-3 text-sm text-slate-400">
                    <p className="flex items-start gap-2">
                      <WifiOff size={14} className="mt-0.5 shrink-0" /> Couldn&apos;t reach {lost.join(", ")}. Tap the room to try again.
                    </p>
                    {!excused.has(room.id) && (
                      <button
                        onClick={() => setExcused((x) => new Set(x).add(room.id))}
                        className="shrink-0 rounded-xl bg-white/[0.06] px-3 py-1.5 font-medium text-slate-300"
                      >
                        Leave it tonight
                      </button>
                    )}
                  </div>
                )}
                {on.map((c) => (
                  <div key={`${c.deviceId}:${c.fn.code}`} className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
                    <span className="text-slate-200">{c.name}</span>
                    {accessible(room) && (
                      <button onClick={() => turnOff([c])} className="flex items-center gap-1.5 rounded-xl bg-white/[0.08] px-3 py-1.5 text-sm font-medium text-slate-100">
                        <Power size={14} /> Turn off
                      </button>
                    )}
                  </div>
                ))}
                {on.length > 1 && accessible(room) && (
                  <button onClick={() => turnOff(on)} className="w-full rounded-2xl bg-white/[0.06] py-3 text-sm font-medium text-slate-200">
                    Turn everything off in {room.name}
                  </button>
                )}
                {!isChecking && confirmed && on.length === 0 && lost.length === 0 && accessible(room) && (
                  <p className="text-center text-sm text-slate-500">Confirmed by the switches at {fmtTime(confirmed)}.</p>
                )}
              </div>
            )}

            {/* Step buttons, for anyone who'd rather tap than turn */}
            <div className="mt-4 flex items-center justify-center gap-3">
              <button onClick={() => step(-1)} aria-label="Previous room" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05] text-slate-300">
                <ChevronLeft size={22} />
              </button>
              <button onClick={() => room && recheck(room)} className="flex h-12 items-center gap-2 rounded-full bg-white/[0.05] px-5 text-sm font-medium text-slate-300">
                {isChecking ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />} Check again
              </button>
              <button onClick={() => step(1)} aria-label="Next room" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.05] text-slate-300">
                <ChevronRight size={22} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
