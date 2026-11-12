// Sleek's home navigation model (the screen stack, persisted so a refresh lands
// on the same screen, and screen titles), plus the greeting and house-wide
// figures that Nebula's shell shares.
import type { Room } from "@/lib/types";
import type { DeviceStatusState } from "../useHomeData";
import { countsAsOn, isFanLevel } from "@/lib/onCount";
import { isChildLock } from "@/lib/panelLock";

export type Screen =
  | { k: "home" }
  | { k: "favourites" }
  | { k: "rooms" }
  | { k: "room"; roomId: string }
  | { k: "routines" }
  | { k: "automations" }
  | { k: "shortcuts" }
  | { k: "switchGroups" }
  | { k: "usage" }
  | { k: "screensaver" }
  | { k: "insights" }
  | { k: "voice" };

const SCREEN_KINDS = ["home", "favourites", "rooms", "room", "routines", "automations", "shortcuts", "switchGroups", "usage", "screensaver", "insights", "voice"];

// Restore the last-viewed navigation stack (so a refresh lands where you were).
export function loadNav(key: string): Screen[] {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || "");
    if (!Array.isArray(arr) || arr.length === 0) return [{ k: "home" }];
    const valid = arr.filter(
      (s: any) => s && SCREEN_KINDS.includes(s.k) && (s.k !== "room" || typeof s.roomId === "string"),
    );
    return valid.length ? (valid as Screen[]) : [{ k: "home" }];
  } catch {
    return [{ k: "home" }];
  }
}

export function saveNav(key: string, stack: Screen[]) {
  try {
    localStorage.setItem(key, JSON.stringify(stack));
  } catch {
    /* ignore */
  }
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const TITLES: Record<Exclude<Screen["k"], "home" | "room">, string> = {
  favourites: "Favourites",
  rooms: "Rooms",
  routines: "Routines",
  automations: "Automations",
  shortcuts: "Shortcuts",
  switchGroups: "Switch Groups",
  usage: "Usage",
  screensaver: "Screensaver",
  insights: "Insights",
  voice: "Voice",
};

export function screenTitle(screen: Screen, houseName: string, roomName?: string): string {
  if (screen.k === "home") return houseName;
  if (screen.k === "room") return roomName ?? "Room";
  return TITLES[screen.k];
}

/** A control that can count as "on" (a switch or a fan level), for "N of M" figures. */
export function isCountable(f: Room["devices"][number]["functions"][number]): boolean {
  return !f.protected && !isChildLock(f.code) && (f.type === "Boolean" || isFanLevel(f));
}

// Home status figures (+ a few extras for the screensaver stats).
export function houseStats(rooms: Room[] | null, statusByDevice: Record<string, DeviceStatusState>) {
  let onCount = 0;
  let offline = 0;
  let deviceCount = 0;
  let protectedCount = 0;
  let roomCount = 0;
  let switchCount = 0;
  for (const room of rooms ?? []) {
    if (room.devices.length > 0) roomCount++;
    for (const d of room.devices) {
      deviceCount++;
      if (statusByDevice[d.id]?.reachable === false) offline++;
      const vals = statusByDevice[d.id]?.values ?? {};
      for (const f of d.functions) {
        if (f.protected) protectedCount++;
        if (isCountable(f)) switchCount++;
        // Switches on + fans running; protected controls and panel locks never count.
        if (countsAsOn(f, vals[f.code])) onCount++;
      }
    }
  }
  return { onCount, offline, roomCount, deviceCount, protectedCount, switchCount };
}

/** Rooms as switcher pills, with each room's on-count. */
export function roomPills(rooms: Room[] | null, statusByDevice: Record<string, DeviceStatusState>) {
  return (rooms ?? []).map((r) => {
    let on = 0;
    for (const d of r.devices) {
      const vals = statusByDevice[d.id]?.values ?? {};
      // Switches on + fans running, excluding protected ones (kept-on, not user toggles).
      for (const f of d.functions) if (countsAsOn(f, vals[f.code])) on++;
    }
    return { id: r.id, name: r.name, locked: r.locked, on };
  });
}
