// Inline-keyboard rendering for menu navigation: rooms → switchboards (devices)
// → switches → actions. Telegram limits callback_data to 64 bytes, so instead
// of packing ids into it we register each action in a short-lived in-memory map
// and put only a tiny token on the button.

import { InlineKeyboard } from "grammy";
import * as api from "./api.js";
import { actionOptions, isControllable, valueLabel } from "./labels.js";
import type { DeviceFunction, Room, UiDevice } from "./api.js";

export type CbAction =
  | { t: "rooms" }
  | { t: "room"; roomId: string }
  | { t: "dev"; deviceId: string }
  | { t: "ctl"; deviceId: string; code: string }
  | { t: "exec"; deviceId: string; code: string; value: unknown }
  | { t: "routines" }
  | { t: "runrt"; routineId: string }
  | { t: "aiyes" }
  | { t: "aino" };

const registry = new Map<string, CbAction>();
let seq = 0;

/** Register an action and return a compact callback token for the button. */
export function register(action: CbAction): string {
  if (registry.size > 10_000) registry.clear(); // backstop; old buttons expire
  const key = (seq++).toString(36);
  registry.set(key, action);
  return key;
}

export function lookup(key: string): CbAction | undefined {
  return registry.get(key);
}

export interface Screen {
  text: string;
  keyboard: InlineKeyboard;
}

/** Escape user-supplied text for Telegram HTML parse mode. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findRoom(rooms: Room[], roomId: string): Room | undefined {
  return rooms.find((r) => r.id === roomId);
}

function findDevice(rooms: Room[], deviceId: string): { device: UiDevice; room: Room } | undefined {
  for (const room of rooms) {
    const device = room.devices.find((d) => d.id === deviceId);
    if (device) return { device, room };
  }
  return undefined;
}

function isAccessible(room: Room): boolean {
  return !room.locked || room.unlocked === true;
}

// ── Screens ─────────────────────────────────────────────────────────────────

export async function roomsScreen(token: string): Promise<Screen> {
  const { rooms, houseName } = await api.getRooms(token);
  const kb = new InlineKeyboard();
  const withDevices = rooms.filter((r) => r.devices.length > 0);
  if (withDevices.length === 0) {
    return { text: "No rooms with devices found.", keyboard: kb };
  }
  withDevices.forEach((room, i) => {
    const lock = room.locked && !room.unlocked ? " 🔒" : "";
    kb.text(`${room.name}${lock}`, register({ t: "room", roomId: room.id }));
    if (i % 2 === 1) kb.row();
  });
  kb.row().text("⚡ Routines", register({ t: "routines" }));
  return { text: `🏠 <b>${esc(houseName)}</b> — choose a room:`, keyboard: kb };
}

export async function roomScreen(token: string, roomId: string): Promise<Screen> {
  const { rooms } = await api.getRooms(token);
  const room = findRoom(rooms, roomId);
  const kb = new InlineKeyboard();
  if (!room) {
    kb.text("« Rooms", register({ t: "rooms" }));
    return { text: "That room no longer exists.", keyboard: kb };
  }
  if (!isAccessible(room)) {
    kb.text("« Rooms", register({ t: "rooms" }));
    return {
      text: `🔒 <b>${esc(room.name)}</b> is locked. Unlock it in the web app to control its devices.`,
      keyboard: kb,
    };
  }
  if (room.devices.length === 0) {
    kb.text("« Rooms", register({ t: "rooms" }));
    return { text: `<b>${esc(room.name)}</b> has no devices.`, keyboard: kb };
  }
  room.devices.forEach((d) => {
    const dot = d.online ? "" : " (offline)";
    kb.text(`${d.name}${dot}`, register({ t: "dev", deviceId: d.id })).row();
  });
  kb.text("« Rooms", register({ t: "rooms" }));
  return { text: `<b>${esc(room.name)}</b> — choose a switchboard:`, keyboard: kb };
}

export async function deviceScreen(token: string, deviceId: string): Promise<Screen> {
  const { rooms } = await api.getRooms(token);
  const found = findDevice(rooms, deviceId);
  const kb = new InlineKeyboard();
  if (!found) {
    kb.text("« Rooms", register({ t: "rooms" }));
    return { text: "That device no longer exists.", keyboard: kb };
  }
  const { device, room } = found;

  // Live status (best-effort) so each switch shows its current state.
  const current = new Map<string, unknown>();
  try {
    const { status } = await api.getStatus(token, deviceId);
    for (const s of status) current.set(s.code, s.value);
  } catch {
    /* offline / unreachable — show controls without state */
  }

  const controls = device.functions.filter(isControllable);
  if (controls.length === 0) {
    kb.text(`« ${room.name}`, register({ t: "room", roomId: room.id }));
    return { text: `<b>${esc(device.name)}</b> has no controllable switches.`, keyboard: kb };
  }
  controls.forEach((fn) => {
    const cur = current.get(fn.code);
    const state = cur !== undefined ? ` — ${valueLabel(fn, cur)}` : "";
    const prot = fn.protected ? " 🛡️" : "";
    kb.text(`${fn.name}${state}${prot}`, register({ t: "ctl", deviceId, code: fn.code })).row();
  });
  kb.text(`« ${room.name}`, register({ t: "room", roomId: room.id }));
  return {
    text: `<b>${esc(device.name)}</b> — choose a switch:`,
    keyboard: kb,
  };
}

export async function controlScreen(token: string, deviceId: string, code: string): Promise<Screen> {
  const { rooms } = await api.getRooms(token);
  const found = findDevice(rooms, deviceId);
  const kb = new InlineKeyboard();
  if (!found) {
    kb.text("« Rooms", register({ t: "rooms" }));
    return { text: "That device no longer exists.", keyboard: kb };
  }
  const { device } = found;
  const fn = device.functions.find((f) => f.code === code);
  if (!fn) {
    kb.text("« Back", register({ t: "dev", deviceId }));
    return { text: "That switch no longer exists.", keyboard: kb };
  }
  const options = actionOptions(fn);
  options.forEach((opt, i) => {
    kb.text(opt.label, register({ t: "exec", deviceId, code, value: opt.value }));
    if (i % 3 === 2) kb.row();
  });
  kb.row().text("« Back", register({ t: "dev", deviceId }));
  const prot = fn.protected ? "\n🛡️ This is a protected control." : "";
  return {
    text: `<b>${esc(device.name)}</b> › <b>${esc(fn.name)}</b>${prot}\nChoose an action:`,
    keyboard: kb,
  };
}

export async function routinesScreen(token: string): Promise<Screen> {
  const { routines } = await api.getRoutines(token);
  const kb = new InlineKeyboard();
  if (routines.length === 0) {
    kb.text("« Rooms", register({ t: "rooms" }));
    return { text: "No saved routines yet.", keyboard: kb };
  }
  routines.forEach((rt) => {
    kb.text(`▶️ ${rt.name}`, register({ t: "runrt", routineId: rt.id })).row();
  });
  kb.text("« Rooms", register({ t: "rooms" }));
  return { text: "<b>Routines</b> — tap one to run it:", keyboard: kb };
}
