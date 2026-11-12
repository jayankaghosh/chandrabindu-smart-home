"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { sfx } from "./fx";

// The room strip under the header while in a room: swipe or click to jump; a
// lit capsule glides to the active room.
export default function NebulaRoomSwitcher({
  rooms,
  activeId,
  onSwitch,
}: {
  rooms: { id: string; name: string; locked?: boolean; on?: number }[];
  activeId: string;
  onSwitch: (roomId: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  if (rooms.length < 2) return null;

  return (
    <div className="sticky top-[84px] z-10 mx-auto mt-3 w-full max-w-[1400px] px-3 sm:px-6">
      <div className="flex gap-1.5 overflow-x-auto rounded-full border border-white/[0.08] bg-[rgba(6,8,22,0.6)] p-1.5 backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rooms.map((room) => {
          const active = room.id === activeId;
          const on = room.on ?? 0;
          return (
            <button
              key={room.id}
              ref={active ? activeRef : undefined}
              onClick={() => {
                if (active) return;
                sfx("tick");
                onSwitch(room.id);
              }}
              aria-current={active ? "page" : undefined}
              aria-label={on > 0 ? `${room.name}, ${on} on` : room.name}
              className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active ? "text-slate-950" : "text-slate-400 hover:text-white"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nb-room-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-300 to-violet-300 shadow-[0_0_24px_-4px_rgba(34,211,238,0.9)]"
                  transition={{ type: "spring", stiffness: 450, damping: 36 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                {room.locked && <Lock size={12} className={active ? "opacity-70" : "text-amber-400"} />}
                {room.name}
                {on > 0 && (
                  <span
                    className={`nb-mono flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${
                      active ? "bg-slate-950/80 text-cyan-200" : "bg-amber-400/20 text-amber-300"
                    }`}
                  >
                    {on}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
