"use client";

import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";

// A horizontal, swipeable strip of room pills shown under the header while
// viewing a room, so you can jump straight to another room without going back
// to the Rooms list. The active pill auto-scrolls into view.
export default function SleekRoomSwitcher({
  rooms,
  activeId,
  onSwitch,
}: {
  rooms: { id: string; name: string; locked?: boolean }[];
  activeId: string;
  onSwitch: (roomId: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Keep the current room visible when it changes (e.g. after a swipe/jump).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeId]);

  if (rooms.length < 2) return null;

  return (
    <div className="sticky top-[73px] z-10 border-b border-white/40 bg-white/30 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mx-auto flex w-full max-w-[1400px] gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rooms.map((room) => {
          const active = room.id === activeId;
          return (
            <button
              key={room.id}
              ref={active ? activeRef : undefined}
              onClick={() => !active && onSwitch(room.id)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
                active
                  ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                  : "border border-white/60 bg-white/50 text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300"
              }`}
            >
              {room.locked && (
                <Lock size={12} className={active ? "opacity-70" : "text-amber-600 dark:text-amber-400"} />
              )}
              {room.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
