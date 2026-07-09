"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Home as HomeIcon, LogOut, Settings as SettingsIcon, Loader2 } from "lucide-react";
import { useHomeData } from "../useHomeData";
import ThemeToggle from "../ThemeToggle";
import Assistant from "../Assistant";
import Insights from "../Insights";
import SleekHome, { type Section } from "./SleekHome";
import SleekRoomList from "./SleekRoomList";
import SleekRoomDetail from "./SleekRoomDetail";
import SleekFavourites from "./SleekFavourites";
import SleekRoutines from "./SleekRoutines";
import SleekAutomations from "./SleekAutomations";
import { screenTransition, screenVariants } from "./motion";

type Screen =
  | { k: "home" }
  | { k: "favourites" }
  | { k: "rooms" }
  | { k: "room"; roomId: string }
  | { k: "routines" }
  | { k: "automations" }
  | { k: "insights" };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function SleekApp({ role, username }: { role: "admin" | "user"; username: string }) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const data = useHomeData();
  const { rooms, statusByDevice, favourites } = data;

  const [stack, setStack] = useState<Screen[]>([{ k: "home" }]);
  const [dir, setDir] = useState(1);
  const screen = stack[stack.length - 1];
  const atHome = screen.k === "home";

  const [greet, setGreet] = useState("");
  useEffect(() => setGreet(greeting()), []);

  const go = (s: Screen) => {
    setDir(1);
    setStack((st) => [...st, s]);
  };
  const back = () => {
    setDir(-1);
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  };
  const goHome = () => {
    setDir(-1);
    setStack([{ k: "home" }]);
  };

  // Home status strip figures
  const { onCount, offline } = useMemo(() => {
    let on = 0;
    let off = 0;
    for (const room of rooms ?? []) {
      for (const d of room.devices) {
        if (statusByDevice[d.id]?.reachable === false) off++;
        const vals = statusByDevice[d.id]?.values ?? {};
        for (const f of d.functions) if (f.type === "Boolean" && vals[f.code] === true) on++;
      }
    }
    return { onCount: on, offline: off };
  }, [rooms, statusByDevice]);

  const currentRoom = screen.k === "room" ? (rooms ?? []).find((r) => r.id === screen.roomId) : undefined;

  const title =
    screen.k === "home"
      ? data.houseName
      : screen.k === "rooms"
        ? "Rooms"
        : screen.k === "room"
          ? currentRoom?.name ?? "Room"
          : screen.k === "favourites"
            ? "Favourites"
            : screen.k === "routines"
              ? "Routines"
              : screen.k === "automations"
                ? "Automations"
                : "Insights";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const iconBtn =
    "flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/50 text-slate-700 shadow-sm backdrop-blur-xl transition active:scale-95 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200";

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/40 backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {atHome ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logo.png" alt="Logo" className="h-12 w-12 shrink-0 rounded-2xl object-cover shadow-md" />
            ) : (
              <motion.button whileTap={{ scale: 0.92 }} onClick={back} aria-label="Back" className={iconBtn}>
                <ChevronLeft size={26} />
              </motion.button>
            )}
            <div className="min-w-0">
              {atHome && (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{greet || " "}</p>
              )}
              <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {atHome ? (
              <>
                <ThemeToggle />
                <Link href="/settings" aria-label="Settings" className="icon-btn">
                  <SettingsIcon size={16} />
                </Link>
                <button onClick={logout} aria-label="Log out" className="icon-btn">
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <motion.button whileTap={{ scale: 0.92 }} onClick={goHome} aria-label="Home" className={iconBtn}>
                <HomeIcon size={22} />
              </motion.button>
            )}
          </div>
        </div>
      </header>

      {/* Screens */}
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6">
        {!rooms && !data.error ? (
          <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : data.error ? (
          <p className="py-16 text-center text-red-500">{data.error}</p>
        ) : (
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={screen.k === "room" ? `room:${screen.roomId}` : screen.k}
              custom={dir}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={screenTransition}
            >
              {screen.k === "home" && <SleekHome onCount={onCount} offline={offline} onOpen={(s: Section) => go({ k: s } as Screen)} />}
              {screen.k === "favourites" && (
                <SleekFavourites
                  rooms={rooms ?? []}
                  favourites={favourites}
                  statusByDevice={statusByDevice}
                  isAdmin={isAdmin}
                  onCommand={data.sendCommand}
                  onToggleFavourite={data.toggleFavourite}
                />
              )}
              {screen.k === "rooms" && (
                <SleekRoomList rooms={rooms ?? []} statusByDevice={statusByDevice} onOpenRoom={(roomId) => go({ k: "room", roomId })} />
              )}
              {screen.k === "room" && currentRoom && (
                <SleekRoomDetail
                  room={currentRoom}
                  statusByDevice={statusByDevice}
                  isAdmin={isAdmin}
                  favourites={favourites}
                  onCommand={data.sendCommand}
                  onToggleFavourite={data.toggleFavourite}
                  onUnlocked={data.reload}
                />
              )}
              {screen.k === "routines" && <SleekRoutines />}
              {screen.k === "automations" && <SleekAutomations isAdmin={isAdmin} />}
              {screen.k === "insights" && <Insights isAdmin={isAdmin} />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <Assistant available={data.aiAvailable} big />
    </div>
  );
}
