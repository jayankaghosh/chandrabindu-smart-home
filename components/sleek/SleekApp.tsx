"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Home as HomeIcon, LogOut, Settings as SettingsIcon, Loader2, CloudDownload } from "lucide-react";
import { useHomeData } from "../useHomeData";
import ThemeToggle from "../ThemeToggle";
import SleekModeFab from "./SleekModeFab";
import SleekGoodnight from "./SleekGoodnight";
import { readEditMode, setEditMode as persistEditMode } from "./editMode";
import Assistant from "../Assistant";
import Insights from "../Insights";
import SleekHome, { type Section } from "./SleekHome";
import SleekRoomList from "./SleekRoomList";
import SleekRoomDetail from "./SleekRoomDetail";
import SleekRoomSwitcher from "./SleekRoomSwitcher";
import SleekFavourites from "./SleekFavourites";
import SleekRoutines from "./SleekRoutines";
import SleekAutomations from "./SleekAutomations";
import SleekShortcuts from "./SleekShortcuts";
import SleekSwitchGroups from "./SleekSwitchGroups";
import SleekUsage from "./SleekUsage";
import SleekScreensaverSettings from "./SleekScreensaverSettings";
import SleekVoice from "./SleekVoice";
import ProtectedAlert from "../ProtectedAlert";
import LockedOverlay from "../LockedOverlay";
import SuperProtectedGate from "../SuperProtectedGate";
import SleekMasterControl from "./SleekMasterControl";
import SleekScreensaver from "./SleekScreensaver";
import { screenTransition, screenVariants } from "./motion";
import { greeting, houseStats, loadNav, roomPills, saveNav, screenTitle, type Screen } from "./nav";

const NAV_KEY = "sleek-nav";

export default function SleekApp({ role, username }: { role: "admin" | "user"; username: string }) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const data = useHomeData();
  const { rooms, statusByDevice, favourites } = data;

  const [stack, setStack] = useState<Screen[]>(() => loadNav(NAV_KEY));
  const [dir, setDir] = useState(1);
  const screen = stack[stack.length - 1];
  const atHome = screen.k === "home";

  // Persist the nav stack so a refresh returns to the same screen.
  useEffect(() => saveNav(NAV_KEY, stack), [stack]);

  // If a restored room no longer exists, drop that screen gracefully.
  useEffect(() => {
    if (screen.k === "room" && rooms && !rooms.find((r) => r.id === screen.roomId)) {
      setStack((st) => (st.length > 1 ? st.slice(0, -1) : [{ k: "home" }]));
    }
  }, [screen, rooms]);

  const [greet, setGreet] = useState("");
  useEffect(() => setGreet(greeting()), []);

  // Protected-off popup: shown on load whenever a protected control is off,
  // dismissible until the next load (in-memory flag, resets on refresh).
  const [protDismissed, setProtDismissed] = useState(false);

  // Edit Mode (admin-only, remembered per device). Hydrated after mount to
  // avoid an SSR mismatch; forced off for non-admins.
  const [editMode, setEditModeState] = useState(false);
  useEffect(() => {
    if (isAdmin) setEditModeState(readEditMode());
  }, [isAdmin]);
  // Goodnight round: a full-screen overlay, not a nav-stack screen (a refresh
  // lands back on home, which is fine for a bedtime ritual).
  const [goodnightOpen, setGoodnightOpen] = useState(false);

  const toggleEditMode = (on: boolean) => {
    setEditModeState(on);
    persistEditMode(on);
  };


  // Cloud re-sync (Edit Mode). Pull devices/rooms/keys, then refresh the UI.
  const [syncing, setSyncing] = useState(false);
  async function syncFromCloud() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) data.reload();
    } catch {
      /* ignore — a failed sync leaves current state untouched */
    } finally {
      setSyncing(false);
    }
  }

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
  // Jump to another room in place (replaces the current room screen), so Back
  // still returns to the Rooms list rather than through every room peeked at.
  const switchRoom = (roomId: string) => {
    setStack((st) => {
      const top = st[st.length - 1];
      if (top.k !== "room" || top.roomId === roomId) return st;
      const list = rooms ?? [];
      setDir(list.findIndex((r) => r.id === roomId) >= list.findIndex((r) => r.id === top.roomId) ? 1 : -1);
      return [...st.slice(0, -1), { k: "room", roomId }];
    });
  };

  // Home status strip figures (+ a few extras for the screensaver stats).
  const { onCount, offline, roomCount, deviceCount, protectedCount } = useMemo(
    () => houseStats(rooms, statusByDevice),
    [rooms, statusByDevice],
  );

  const currentRoom = screen.k === "room" ? (rooms ?? []).find((r) => r.id === screen.roomId) : undefined;

  const title = screenTitle(screen, data.houseName, currentRoom?.name);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const iconBtn =
    "flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/50 text-slate-700 shadow-sm backdrop-blur-xl transition active:scale-95 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200";

  return (
    <div className="min-h-screen overflow-x-clip">
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
                {isAdmin && editMode && (
                  <button
                    onClick={syncFromCloud}
                    disabled={syncing}
                    aria-label="Sync from cloud"
                    title="Sync from cloud"
                    className="icon-btn disabled:opacity-50"
                  >
                    {syncing ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
                  </button>
                )}
                <ThemeToggle />
                <Link href="/settings" aria-label="Settings" className="icon-btn">
                  <SettingsIcon size={16} />
                </Link>
                <button onClick={logout} aria-label="Log out" className="icon-btn">
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <ThemeToggle className={iconBtn} />
                <motion.button whileTap={{ scale: 0.92 }} onClick={goHome} aria-label="Home" className={iconBtn}>
                  <HomeIcon size={22} />
                </motion.button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Room switcher — jump between rooms without going back to the list. */}
      {screen.k === "room" && (
        <SleekRoomSwitcher
          rooms={roomPills(rooms, statusByDevice)}
          activeId={screen.roomId}
          onSwitch={switchRoom}
        />
      )}

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
              {screen.k === "home" && (
                <SleekHome
                  onCount={onCount}
                  offline={offline}
                  onOpen={(s: Section) => (s === "goodnight" ? setGoodnightOpen(true) : go({ k: s } as Screen))}
                />
              )}
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
                  editMode={editMode}
                  allRooms={(rooms ?? []).map((r) => ({ id: r.id, name: r.name }))}
                  onChanged={data.reload}
                />
              )}
              {screen.k === "routines" && (
                <SleekRoutines rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />
              )}
              {screen.k === "automations" && (
                <SleekAutomations rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />
              )}
              {screen.k === "shortcuts" && (
                <SleekShortcuts rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />
              )}
              {screen.k === "switchGroups" && (
                <SleekSwitchGroups rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />
              )}
              {screen.k === "usage" && <SleekUsage />}
              {screen.k === "screensaver" && <SleekScreensaverSettings isAdmin={isAdmin} />}
              {screen.k === "voice" && <SleekVoice />}
              {screen.k === "insights" && <Insights isAdmin={isAdmin} />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <Assistant available={data.aiAvailable} big />

      {data.protectedOff.length > 0 && !protDismissed && (
        <ProtectedAlert
          items={data.protectedOff}
          onTurnOn={(deviceId, code) => data.sendCommand(deviceId, code, true)}
          onDismiss={() => setProtDismissed(true)}
        />
      )}

      <SleekMasterControl onDone={data.reload} raised={isAdmin} />
      {/* Small Run / Edit button bottom-left under Master on every screen; it
          opens the toggle on tap. */}
      {isAdmin && <SleekModeFab editMode={editMode} onChange={toggleEditMode} />}
      {goodnightOpen && rooms && (
        <SleekGoodnight
          rooms={rooms}
          statusByDevice={data.statusByDevice}
          live={data.live}
          sendCommand={data.sendCommand}
          fetchDeviceStatus={data.fetchDeviceStatus}
          onClose={() => setGoodnightOpen(false)}
        />
      )}
      <SleekScreensaver
        stats={{ rooms: roomCount, devices: deviceCount, on: onCount, offline, protectedCount }}
      />
      <LockedOverlay isAdmin={isAdmin} locked={data.locked} info={data.lockInfo} onUnlocked={data.reload} />
      <SuperProtectedGate
        isAdmin={isAdmin}
        configured={data.superProtectedConfigured}
        rooms={rooms ?? []}
        onConfigured={data.reload}
      />
    </div>
  );
}
