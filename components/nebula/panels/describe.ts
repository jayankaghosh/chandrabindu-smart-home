// Plain-words descriptions of rule conditions and actions for Nebula's panels.
import type { AutomationAction, AutomationCondition, Room, ShortcutCondition, WindowPoint } from "@/lib/types";
import { valueLabel } from "../../sleek/labels";

export type Lookup = (deviceId: string, code: string) => { label: string; fn?: Room["devices"][number]["functions"][number] };

/** Resolve "Device · Control" labels (and the control) from the room model. */
export function makeLookup(rooms: Room[]): Lookup {
  const devices = new Map<string, { name: string; room: string; fns: Room["devices"][number]["functions"] }>();
  for (const r of rooms) for (const d of r.devices) devices.set(d.id, { name: d.name, room: r.name, fns: d.functions });
  return (deviceId, code) => {
    const d = devices.get(deviceId);
    const fn = d?.fns.find((f) => f.code === code);
    if (!d) return { label: "A missing switch" };
    return { label: fn ? `${fn.name}` : d.name, fn };
  };
}

function sun(event: "sunrise" | "sunset", offsetMin?: number): string {
  const name = event === "sunrise" ? "Sunrise" : "Sunset";
  if (!offsetMin) return name;
  return `${name} ${offsetMin > 0 ? "+" : "−"}${Math.abs(offsetMin)}m`;
}

function point(p: WindowPoint): string {
  return p.kind === "time" ? p.time : sun(p.event, p.offsetMin);
}

export function describeCondition(c: AutomationCondition | ShortcutCondition, look: Lookup, roomName: (id: string) => string): string {
  switch (c.type) {
    case "time":
      return `At ${c.time}`;
    case "sun":
      return `At ${sun(c.event, c.offsetMin)}`;
    case "group": {
      const where = c.scope === "house" ? "the house" : roomName(c.scope);
      const what = c.kind === "lights" ? "lights" : "switches";
      return c.state === "allOff" ? `All ${what} in ${where} off` : `Any ${what.slice(0, -1)} in ${where} on`;
    }
    case "window":
      return `Between ${point(c.from)} and ${point(c.to)}`;
    default: {
      const l = look(c.deviceId, c.code);
      return `${l.label} is ${l.fn ? valueLabel(l.fn, c.value) : String(c.value)}`;
    }
  }
}

export function describeAction(a: AutomationAction, look: Lookup, routineName: (id: string) => string): string {
  if (a.type === "routine") return `Run ${routineName(a.routineId)}`;
  const l = look(a.deviceId, a.code);
  return `${l.label} → ${l.fn ? valueLabel(l.fn, a.value) : String(a.value)}`;
}
