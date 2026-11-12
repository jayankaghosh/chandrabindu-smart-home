"use client";

import { useMemo, useRef } from "react";
import { motion, useAnimationFrame, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { Lock } from "lucide-react";
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { isCountable } from "../sleek/nav";
import { roomIcon, roomOnCount } from "../sleek/SleekRoomList";
import EnergyCore from "./EnergyCore";
import Planet, { roomHue } from "./Planet";
import { emitPulse, haptic, prefersReducedMotion, sfx } from "./fx";
import { useViewport } from "./useViewport";

type Anchor = { x: number; y: number };

type Body = {
  room: Room;
  on: number;
  total: number;
  locked: boolean;
  ring: 0 | 1;
  phase: number;
  size: number;
};

// Radians per millisecond of idle drift (one lap of the outer ring ~ 2 min).
const DRIFT = (Math.PI * 2) / 120000;

// Home as a solar system: the energy core is the sun, rooms are planets on two
// counter-rotating elliptical orbits. Planets swing behind and in front of the
// core (scale, brightness and stacking follow their depth). Drag or scroll to
// spin the system (with inertia); hovering a planet holds the orbit still;
// tapping one flies into the room. Phones get a swipeable planet carousel.
export default function OrbitScene({
  rooms,
  statusByDevice,
  onCount,
  switchCount,
  live,
  onEnter,
}: {
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  onCount: number;
  switchCount: number;
  live: boolean;
  onEnter: (roomId: string, at: Anchor) => void;
}) {
  const { w, h } = useViewport();
  const bodies = useMemo<Body[]>(() => {
    const list = rooms.filter((r) => r.devices.length > 0);
    const innerCount = list.length > 6 ? Math.floor(list.length * 0.4) : 0;
    return list.map((room, i) => {
      const ring: 0 | 1 = i < innerCount ? 0 : 1;
      const idx = ring === 0 ? i : i - innerCount;
      const count = ring === 0 ? innerCount : list.length - innerCount;
      return {
        room,
        on: roomOnCount(room, statusByDevice),
        total: room.devices.reduce((n, d) => n + d.functions.filter(isCountable).length, 0),
        locked: !!room.locked && !room.unlocked,
        ring,
        phase: (idx / count) * Math.PI * 2 + (ring === 0 ? 0.4 : 0),
        size: 46 + Math.min(room.devices.length, 8) * 5,
      };
    });
  }, [rooms, statusByDevice]);

  if (w === 0) return null;
  if (w < 768) return <Carousel bodies={bodies} onCount={onCount} switchCount={switchCount} live={live} onEnter={onEnter} />;

  // Usable stage: between the HUD (top) and the dock (bottom).
  const stageTop = 84;
  const stageH = Math.max(320, h - stageTop - 120);
  const outer = { rx: Math.min(w * 0.42, 600), ry: Math.min(stageH * 0.4, 290) };
  const inner = { rx: outer.rx * 0.6, ry: outer.ry * 0.62 };
  const core = Math.min(stageH * 0.48, 320);
  return <Orbits bodies={bodies} outer={outer} inner={inner} core={core} stageTop={stageTop} stageH={stageH} onCount={onCount} switchCount={switchCount} onEnter={onEnter} />;
}

function Orbits({
  bodies,
  outer,
  inner,
  core,
  stageTop,
  stageH,
  onCount,
  switchCount,
  onEnter,
}: {
  bodies: Body[];
  outer: { rx: number; ry: number };
  inner: { rx: number; ry: number };
  core: number;
  stageTop: number;
  stageH: number;
  onCount: number;
  switchCount: number;
  onEnter: (roomId: string, at: Anchor) => void;
}) {
  const rot = useMotionValue(0);
  const hold = useRef(false);
  const vel = useRef(0);
  const drag = useRef<{ x: number; last: number; t: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  useAnimationFrame((_, delta) => {
    const d = Math.min(delta, 50);
    let r = rot.get();
    if (!hold.current && !drag.current && !reduced) r += DRIFT * d;
    if (!drag.current && Math.abs(vel.current) > 0.00001) {
      r += vel.current * d;
      vel.current *= Math.pow(0.94, d / 16);
    }
    rot.set(r);
  });

  return (
    <div
      className="fixed inset-x-0 select-none"
      style={{ top: stageTop, height: stageH, touchAction: "none" }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, last: e.clientX, t: performance.now(), moved: false };
        dragged.current = false;
      }}
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g) return;
        const dx = e.clientX - g.last;
        if (Math.abs(e.clientX - g.x) > 6) {
          g.moved = true;
          dragged.current = true;
        }
        if (!g.moved) return;
        const now = performance.now();
        rot.set(rot.get() + dx * 0.006);
        vel.current = (dx * 0.006) / Math.max(1, now - g.t);
        g.last = e.clientX;
        g.t = now;
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
      onWheel={(e) => {
        vel.current += (e.deltaY + e.deltaX) * 0.000004;
      }}
    >
      <div className="absolute left-1/2 top-1/2">
        {/* Orbit paths */}
        <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0 }} aria-hidden>
          {[outer, ...(bodies.some((b) => b.ring === 0) ? [inner] : [])].map((o, i) => (
            <ellipse key={i} cx="0" cy="0" rx={o.rx} ry={o.ry} fill="none" stroke="rgba(148,163,255,0.14)" strokeDasharray="2 8" />
          ))}
        </svg>
        {/* The sun */}
        <div className="absolute" style={{ width: core, height: core, left: -core / 2, top: -core / 2, zIndex: 20 }}>
          <EnergyCore on={onCount} total={switchCount} className="w-full" />
        </div>
        {bodies.map((b) => (
          <Orbiter
            key={b.room.id}
            body={b}
            orbit={b.ring === 0 ? inner : outer}
            dir={b.ring === 0 ? -1.4 : 1}
            rot={rot}
            onHover={(v) => (hold.current = v)}
            onEnter={(at) => {
              if (dragged.current) return;
              onEnter(b.room.id, at);
            }}
          />
        ))}
      </div>
      <p className="nb-mono pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] uppercase text-slate-600">
        Drag to spin · tap a world to enter
      </p>
    </div>
  );
}

function Orbiter({
  body,
  orbit,
  dir,
  rot,
  onHover,
  onEnter,
}: {
  body: Body;
  orbit: { rx: number; ry: number };
  dir: number;
  rot: MotionValue<number>;
  onHover: (v: boolean) => void;
  onEnter: (at: Anchor) => void;
}) {
  const angle = useTransform(rot, (r) => body.phase + r * dir);
  const x = useTransform(angle, (a) => Math.cos(a) * orbit.rx);
  const y = useTransform(angle, (a) => Math.sin(a) * orbit.ry);
  // Depth: 0 = far side (behind the core), 1 = near side.
  const depth = useTransform(angle, (a) => (Math.sin(a) + 1) / 2);
  const scale = useTransform(depth, (d) => 0.68 + d * 0.5);
  const opacity = useTransform(depth, (d) => 0.5 + d * 0.5);
  const zIndex = useTransform(depth, (d) => (d > 0.5 ? 30 : 10));
  const ref = useRef<HTMLButtonElement | null>(null);
  const frac = body.total ? body.on / body.total : 0;

  return (
    <motion.div className="absolute left-0 top-0" style={{ x, y, zIndex }}>
      <motion.button
        ref={ref}
        type="button"
        aria-label={`${body.room.name}${body.locked ? ", locked" : body.on ? `, ${body.on} on` : ""}`}
        // Centre the planet (not the label) on the orbit point. Framer owns the
        // transform here, so the offset goes through it, not Tailwind classes.
        style={{ scale, opacity, x: "-50%", y: -body.size / 2, transformOrigin: `50% ${body.size / 2}px` }}
        className="group flex flex-col items-center gap-2 focus:outline-none"
        onPointerEnter={() => {
          onHover(true);
          sfx("tick");
        }}
        onPointerLeave={() => onHover(false)}
        onClick={() => {
          const r = ref.current?.getBoundingClientRect();
          const at = r ? { x: r.left + r.width / 2, y: r.top + body.size / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
          emitPulse(at.x, at.y, roomHue(body.on, body.locked), 1.4);
          haptic(12);
          onEnter(at);
        }}
      >
        <span className="transition-transform duration-300 group-hover:scale-110 group-focus-visible:scale-110">
          <Planet size={body.size} hue={roomHue(body.on, body.locked)} frac={frac} icon={body.locked ? Lock : roomIcon(body.room.name)} ringed={body.on > 0} />
        </span>
        <span className="whitespace-nowrap rounded-full border border-white/[0.06] bg-[rgba(4,5,16,0.55)] px-2.5 py-1 text-center backdrop-blur-sm transition-colors group-hover:border-cyan-300/40">
          <span className="block text-[12px] font-medium text-white">{body.room.name}</span>
          <span className={`nb-mono block text-[9px] uppercase ${body.on > 0 ? "text-amber-300" : "text-slate-500"}`}>
            {body.locked ? "Secured" : body.on > 0 ? `${body.on} on` : "Dormant"}
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}

function Carousel({
  bodies,
  onCount,
  switchCount,
  live,
  onEnter,
}: {
  bodies: Body[];
  onCount: number;
  switchCount: number;
  live: boolean;
  onEnter: (roomId: string, at: Anchor) => void;
}) {
  return (
    <div className="px-4 pb-40 pt-24">
      <EnergyCore on={onCount} total={switchCount} live={live} className="w-[min(72vw,280px)]" />
      <p className="nb-mono mb-3 mt-10 text-[10px] uppercase text-slate-500">Worlds · swipe</p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {bodies.map((b, i) => (
          <motion.button
            key={b.room.id}
            type="button"
            initial={{ opacity: 0, y: 30, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.05, type: "spring", stiffness: 260, damping: 22 }}
            whileTap={{ scale: 0.94 }}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const at = { x: r.left + r.width / 2, y: r.top + 80 };
              emitPulse(at.x, at.y, roomHue(b.on, b.locked), 1.2);
              haptic(12);
              onEnter(b.room.id, at);
            }}
            className="flex w-[150px] shrink-0 snap-center flex-col items-center gap-3 rounded-[28px] border border-white/[0.06] bg-[rgba(6,8,22,0.4)] px-3 pb-4 pt-6 backdrop-blur-md"
          >
            <Planet size={96} hue={roomHue(b.on, b.locked)} frac={b.total ? b.on / b.total : 0} icon={b.locked ? Lock : roomIcon(b.room.name)} ringed={b.on > 0} />
            <span>
              <span className="block text-sm font-medium text-white">{b.room.name}</span>
              <span className={`nb-mono block text-[10px] uppercase ${b.on > 0 ? "text-amber-300" : "text-slate-500"}`}>
                {b.locked ? "Secured" : b.on > 0 ? `${b.on} on` : "Dormant"}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
