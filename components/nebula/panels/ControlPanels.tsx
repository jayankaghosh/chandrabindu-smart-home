"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Star, Link2, Power, PowerOff } from "lucide-react";
import type { Room, SwitchGroup } from "@/lib/types";
import type { DeviceStatusState } from "../../useHomeData";
import { favKey } from "../../favKey";
import { CONTROLLABLE } from "../../sleek/labels";
import ControlOrb from "../ControlOrb";
import { HUES, haptic, pulseFrom, sfx } from "../fx";
import { rise, stagger } from "../motion";
import { Empty, List, Loading, Row } from "./ui";

type Entry = {
  key: string;
  deviceId: string;
  caption: string;
  accessible: boolean;
  fn: Room["devices"][number]["functions"][number];
};

// Every controllable function, keyed "deviceId:code", with where it lives.
function useEntries(rooms: Room[]) {
  return useMemo(() => {
    const map = new Map<string, Entry>();
    for (const room of rooms) {
      const accessible = !room.locked || room.unlocked === true;
      for (const device of room.devices) {
        if (device.bluetooth) continue;
        for (const fn of device.functions) {
          if (!CONTROLLABLE.includes(fn.type)) continue;
          const key = favKey(device.id, fn.code);
          map.set(key, { key, deviceId: device.id, caption: `${device.name} · ${room.name}`, accessible, fn });
        }
      }
    }
    return map;
  }, [rooms]);
}

type CommonProps = {
  rooms: Room[];
  statusByDevice: Record<string, DeviceStatusState>;
  isAdmin: boolean;
  favourites: Set<string>;
  groupedKeys: Set<string>;
  onCommand: (deviceId: string, code: string, value: unknown) => void;
  onToggleFavourite: (deviceId: string, code: string) => void;
};

function Orb({ e, p }: { e: Entry; p: CommonProps }) {
  const st = p.statusByDevice[e.deviceId];
  return (
    <ControlOrb
      fn={e.fn}
      value={st?.values?.[e.fn.code]}
      caption={e.accessible ? e.caption : `${e.caption} · locked`}
      disabled={st?.reachable === false || !e.accessible || (!!e.fn.protected && !p.isAdmin)}
      isProtected={!!e.fn.protected}
      isAdmin={p.isAdmin}
      isFavourite={p.favourites.has(e.key)}
      inGroup={p.groupedKeys.has(e.key)}
      onCommand={(v) => e.accessible && p.onCommand(e.deviceId, e.fn.code, v)}
      onToggleFavourite={() => p.onToggleFavourite(e.deviceId, e.fn.code)}
    />
  );
}

// Starred controls from every room, as one constellation.
export function FavouritesPanel(p: CommonProps) {
  const entries = useEntries(p.rooms);
  const favs = [...entries.values()].filter((e) => p.favourites.has(e.key));
  if (favs.length === 0) {
    return <Empty icon={<Star size={26} />} title="No favourites yet" hint="Long-press or right-click any control in a room and choose Add favourite." />;
  }
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-wrap gap-x-2 gap-y-6">
      {favs.map((e) => (
        <motion.div key={e.key} variants={rise}>
          <Orb e={e} p={p} />
        </motion.div>
      ))}
    </motion.div>
  );
}

// Switch groups: the members' live states, with all-on / all-off for the set.
// The gateway also keeps members in sync whenever one of them changes.
export function GroupsPanel(p: CommonProps) {
  const entries = useEntries(p.rooms);
  const [groups, setGroups] = useState<SwitchGroup[] | null>(null);
  useEffect(() => {
    fetch("/api/switch-groups")
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  function setAll(g: SwitchGroup, on: boolean, el: HTMLElement) {
    pulseFrom(el, on ? HUES.switch : HUES.white, 1.2);
    sfx(on ? "on" : "off");
    haptic(16);
    for (const m of g.members) {
      const e = entries.get(favKey(m.deviceId, m.code));
      if (!e || !e.accessible || e.fn.type !== "Boolean" || e.fn.protected) continue;
      p.onCommand(m.deviceId, m.code, on);
    }
  }

  if (!groups) return <Loading />;
  if (groups.length === 0) return <Empty icon={<Link2 size={26} />} title="No switch groups yet" hint="Admins can create them under Manage in Edit Mode." />;

  return (
    <List>
      {groups.map((g) => {
        const members = g.members.map((m) => entries.get(favKey(m.deviceId, m.code))).filter((e): e is Entry => !!e);
        const anyOn = members.some((e) => p.statusByDevice[e.deviceId]?.values?.[e.fn.code] === true);
        return (
          <Row key={g.id} lit={anyOn}>
            <div className="mb-4 flex items-center justify-between gap-2 pl-2">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{g.name}</p>
                <p className="nb-mono text-[10px] uppercase text-slate-500">{members.length} linked</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={(e) => setAll(g, true, e.currentTarget)} className="btn-ghost !rounded-full !px-3 !py-2 text-xs" aria-label={`Turn ${g.name} on`}>
                  <Power size={13} /> On
                </button>
                <button onClick={(e) => setAll(g, false, e.currentTarget)} className="btn-ghost !rounded-full !px-3 !py-2 text-xs" aria-label={`Turn ${g.name} off`}>
                  <PowerOff size={13} /> Off
                </button>
              </div>
            </div>
            <div className="nb-thread flex flex-wrap gap-x-2 gap-y-5 pl-1">
              {members.map((e) => (
                <Orb key={e.key} e={e} p={p} />
              ))}
            </div>
          </Row>
        );
      })}
    </List>
  );
}
