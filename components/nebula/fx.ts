"use client";

// Nebula's effects bus. Components fire a pulse (a shockwave through the WebGL
// sky from a screen point) or a warp (the sky surges, on navigation); the
// background listens. Sound is synthesised with WebAudio (no assets), muted per
// device with localStorage["nebula-sound"] = "off"; haptics use
// navigator.vibrate where it exists.

export type PulseDetail = { x: number; y: number; hue: [number, number, number]; strength: number };

const PULSE = "nebula-pulse";
const WARP = "nebula-warp";
const SOUND_KEY = "nebula-sound";
export const SOUND_EVENT = "nebula-sound-change";

/** Kind hues (0..1 RGB), matched to the tile accents. */
export const HUES: Record<string, [number, number, number]> = {
  light: [0.98, 0.75, 0.15],
  fan: [0.13, 0.83, 0.93],
  socket: [0.2, 0.83, 0.6],
  lock: [0.98, 0.44, 0.52],
  switch: [0.65, 0.55, 0.98],
  white: [0.75, 0.85, 1],
};

export function emitPulse(x: number, y: number, hue: [number, number, number] = HUES.white, strength = 1) {
  window.dispatchEvent(new CustomEvent<PulseDetail>(PULSE, { detail: { x, y, hue, strength } }));
}
export function onPulse(fn: (d: PulseDetail) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<PulseDetail>).detail);
  window.addEventListener(PULSE, h);
  return () => window.removeEventListener(PULSE, h);
}

export function emitWarp(dir: number) {
  window.dispatchEvent(new CustomEvent<number>(WARP, { detail: dir }));
}
export function onWarp(fn: (dir: number) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<number>).detail);
  window.addEventListener(WARP, h);
  return () => window.removeEventListener(WARP, h);
}

/** Pulse from the centre of an element (for keyboard-triggered actions). */
export function pulseFrom(el: Element | null, hue?: [number, number, number], strength?: number) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  emitPulse(r.left + r.width / 2, r.top + r.height / 2, hue, strength);
}

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

export function soundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SOUND_EVENT));
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!soundOn()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One shaped oscillator note: frequency glide + fast attack, exponential tail.
function tone(freqFrom: number, freqTo: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(lp).connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export type Sfx = "on" | "off" | "nav" | "back" | "tick" | "power" | "boot";

export function sfx(kind: Sfx) {
  switch (kind) {
    case "on":
      tone(420, 880, 0.18, "sine", 0.07);
      tone(840, 1760, 0.14, "triangle", 0.025, 0.03);
      break;
    case "off":
      tone(700, 260, 0.2, "sine", 0.06);
      break;
    case "nav":
      tone(1200, 1500, 0.06, "triangle", 0.03);
      break;
    case "back":
      tone(1300, 900, 0.07, "triangle", 0.03);
      break;
    case "tick":
      tone(2400, 2200, 0.025, "square", 0.012);
      break;
    case "power":
      tone(90, 420, 0.6, "sawtooth", 0.05);
      tone(180, 840, 0.6, "sine", 0.05, 0.05);
      break;
    case "boot":
      tone(110, 220, 0.9, "sine", 0.05);
      tone(330, 660, 0.7, "triangle", 0.025, 0.35);
      tone(660, 1320, 0.5, "sine", 0.02, 0.7);
      break;
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
