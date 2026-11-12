"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ChevronLeft, Home as HomeIcon, LogOut, Settings as SettingsIcon, Loader2, CloudDownload, Volume2, VolumeX } from "lucide-react";
import { useHomeData } from "../useHomeData";
import Assistant from "../Assistant";
import Insights from "../Insights";
import ProtectedAlert from "../ProtectedAlert";
import LockedOverlay from "../LockedOverlay";
import SuperProtectedGate from "../SuperProtectedGate";
import { readEditMode, setEditMode as persistEditMode } from "../sleek/editMode";
import { greeting, houseStats, loadNav, roomPills, saveNav, screenTitle, type Screen } from "../sleek/nav";
import type { Section } from "../sleek/SleekHome";
import SleekModeFab from "../sleek/SleekModeFab";
import SleekGoodnight from "../sleek/SleekGoodnight";
import SleekFavourites from "../sleek/SleekFavourites";
import SleekRoomDetail from "../sleek/SleekRoomDetail";
import SleekRoutines from "../sleek/SleekRoutines";
import SleekAutomations from "../sleek/SleekAutomations";
import SleekShortcuts from "../sleek/SleekShortcuts";
import SleekSwitchGroups from "../sleek/SleekSwitchGroups";
import SleekUsage from "../sleek/SleekUsage";
import SleekScreensaverSettings from "../sleek/SleekScreensaverSettings";
import SleekScreensaver from "../sleek/SleekScreensaver";
import SleekVoice from "../sleek/SleekVoice";
import NebulaBackground from "./NebulaBackground";
import NebulaBoot from "./NebulaBoot";
import CursorAura from "./CursorAura";
import NebulaHome from "./NebulaHome";
import NebulaRoomList from "./NebulaRoomList";
import NebulaRoomSwitcher from "./NebulaRoomSwitcher";
import NebulaControlTile from "./NebulaControlTile";
import NebulaMasterControl from "./NebulaMasterControl";
import ScrambleText from "./ScrambleText";
import { SOUND_EVENT, emitWarp, setSoundOn, sfx, soundOn } from "./fx";
import { depthTransition, depthVariants } from "./motion";

const NAV_KEY = "nebula-nav";

// The Nebula experience: the same features, data and rules as Sleek (it reuses
// Sleek's feature screens and every safety overlay), wrapped in a cinematic
// shell: a live WebGL sky that reacts to the house, a boot sequence, depth
// transitions with a warp surge, holographic tiles and synthesised sound.
export default function NebulaApp({ role }: { role: "admin" | "user"; username: string }) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const data = useHomeData();
  const { rooms, statusByDevice, favourites } = data;

  const [stack, setStack] = useState<Screen[]>(() => loadNav(NAV_KEY));
  const [dir, setDir] = useState(1);
  const screen = stack[stack.length - 1];
  const atHome = screen.k === "home";

  useEffect(() => saveNav(NAV_KEY, stack), [stack]);

  // Each screen starts at the top (the depth transition reads as a new scene).
  const screenKey = screen.k === "room" ? `room:${screen.roomId}` : screen.k;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screenKey]);

  // Nebula is always dark, whatever this device's light/dark choice is.
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.ui = "nebula";
  }, []);

  // If a restored room no longer exists, drop that screen gracefully.
  useEffect(() => {
    if (screen.k === "room" && rooms && !rooms.find((r) => r.id === screen.roomId)) {
      setStack((st) => (st.length > 1 ? st.slice(0, -1) : [{ k: "home" }]));
    }
  }, [screen, rooms]);

  const [greet, setGreet] = useState("");
  useEffect(() => setGreet(greeting()), []);

  const [sound, setSound] = useState(true);
  useEffect(() => {
    const sync = () => setSound(soundOn());
    sync();
    window.addEventListener(SOUND_EVENT, sync);
    return () => window.removeEventListener(SOUND_EVENT, sync);
  }, []);

  const [protDismissed, setProtDismissed] = useState(false);

  const [editMode, setEditModeState] = useState(false);
  useEffect(() => {
    if (isAdmin) setEditModeState(readEditMode());
  }, [isAdmin]);
  const toggleEditMode = (on: boolean) => {
    setEditModeState(on);
    persistEditMode(on);
  };
  const [goodnightOpen, setGoodnightOpen] = useState(false);

  const [syncing, setSyncing] = useState(false);
  async function syncFromCloud() {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (res.ok) data.reload();
    } catch {
      /* ignore: a failed sync leaves current state untouched */
    } finally {
      setSyncing(false);
    }
  }

  const go = (s: Screen) => {
    setDir(1);
    emitWarp(1);
    sfx("nav");
    setStack((st) => [...st, s]);
  };
  const back = () => {
    setDir(-1);
    emitWarp(-1);
    sfx("back");
    setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  };
  const goHome = () => {
    setDir(-1);
    emitWarp(-1);
    sfx("back");
    setStack([{ k: "home" }]);
  };
  // Jump to another room in place, so Back still returns to the Rooms list.
  const switchRoom = (roomId: string) => {
    setStack((st) => {
      const top = st[st.length - 1];
      if (top.k !== "room" || top.roomId === roomId) return st;
      const list = rooms ?? [];
      setDir(list.findIndex((r) => r.id === roomId) >= list.findIndex((r) => r.id === top.roomId) ? 1 : -1);
      return [...st.slice(0, -1), { k: "room", roomId }];
    });
  };

  const stats = useMemo(() => houseStats(rooms, statusByDevice), [rooms, statusByDevice]);
  const energy = stats.switchCount > 0 ? stats.onCount / stats.switchCount : 0;

  const roomName = (id: string) => (rooms ?? []).find((r) => r.id === id)?.name;
  const currentRoom = screen.k === "room" ? (rooms ?? []).find((r) => r.id === screen.roomId) : undefined;
  const title = screenTitle(screen, data.houseName, currentRoom?.name);
  const crumbs = ["Home", ...stack.slice(1).map((s) => screenTitle(s, data.houseName, s.k === "room" ? roomName(s.roomId) : undefined))];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const hudBtn =
    "flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-slate-300 transition hover:border-cyan-300/50 hover:text-white hover:shadow-[0_0_20px_-6px_rgba(34,211,238,0.8)] active:scale-90 disabled:opacity-50";

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip text-slate-100">
        <NebulaBackground energy={energy} />
        <CursorAura />

        {/* HUD header: a floating capsule */}
        <header className="sticky top-0 z-20 px-3 pt-3 sm:px-6">
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.1 }}
            className="relative mx-auto flex w-full max-w-[1400px] items-center justify-between gap-3 overflow-hidden rounded-full border border-white/[0.08] bg-[rgba(6,8,22,0.55)] p-2 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
          >
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden">
              <span className="nb-scan absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
            </span>
            <div className="flex min-w-0 items-center gap-3">
              {atHome ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.png" alt="Logo" className="h-10 w-10 shrink-0 rounded-full object-cover shadow-[0_0_20px_rgba(34,211,238,0.45)]" />
              ) : (
                <button onClick={back} aria-label="Back" className={hudBtn}>
                  <ChevronLeft size={20} />
                </button>
              )}
              <nav aria-label="Breadcrumb" className="nb-mono flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] uppercase">
                {atHome ? (
                  <span className="truncate text-slate-300">
                    <span className="text-cyan-300">Nebula</span> <span className="text-slate-600">//</span> {data.houseName}
                  </span>
                ) : (
                  crumbs.map((c, i) => (
                    <span key={i} className={`min-w-0 items-center gap-1.5 ${i === crumbs.length - 1 ? "flex text-white" : "hidden text-slate-500 sm:flex"}`}>
                      {i > 0 && <span className="text-slate-600">/</span>}
                      <span className="truncate">{c}</span>
                    </span>
                  ))
                )}
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => {
                  setSoundOn(!sound);
                  if (!sound) setTimeout(() => sfx("on"), 0);
                }}
                aria-label={sound ? "Mute interface sounds" : "Unmute interface sounds"}
                title={sound ? "Sounds on" : "Sounds off"}
                className={hudBtn}
              >
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              {atHome ? (
                <>
                  {isAdmin && editMode && (
                    <button onClick={syncFromCloud} disabled={syncing} aria-label="Sync from cloud" title="Sync from cloud" className={hudBtn}>
                      {syncing ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
                    </button>
                  )}
                  <Link href="/settings" aria-label="Settings" className={hudBtn}>
                    <SettingsIcon size={16} />
                  </Link>
                  <button onClick={logout} aria-label="Log out" className={hudBtn}>
                    <LogOut size={16} />
                  </button>
                </>
              ) : (
                <button onClick={goHome} aria-label="Home" className={hudBtn}>
                  <HomeIcon size={17} />
                </button>
              )}
            </div>
          </motion.div>
        </header>

        {screen.k === "room" && (
          <NebulaRoomSwitcher rooms={roomPills(rooms, statusByDevice)} activeId={screen.roomId} onSwitch={switchRoom} />
        )}

        <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-8 sm:px-6">
          {!rooms && !data.error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-cyan-200/70">
              <Loader2 size={26} className="animate-spin" />
              <span className="nb-mono text-[11px] uppercase">Linking</span>
            </div>
          ) : data.error ? (
            <p className="py-16 text-center text-red-400">{data.error}</p>
          ) : (
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={screenKey}
                custom={dir}
                variants={depthVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={depthTransition}
              >
                {!atHome && (
                  <div className="mb-7">
                    <h1 className="nb-gradient-text text-4xl font-semibold tracking-tight sm:text-5xl">
                      <ScrambleText text={title} duration={500} />
                    </h1>
                    <div className="mt-3 h-px w-full max-w-md overflow-hidden bg-gradient-to-r from-cyan-300/40 via-violet-400/30 to-transparent">
                      <span className="nb-scan block h-full w-1/3 bg-gradient-to-r from-transparent via-white to-transparent" />
                    </div>
                  </div>
                )}
                {screen.k === "home" && (
                  <NebulaHome
                    houseName={data.houseName}
                    greet={greet}
                    onCount={stats.onCount}
                    switchCount={stats.switchCount}
                    offline={stats.offline}
                    roomCount={stats.roomCount}
                    deviceCount={stats.deviceCount}
                    live={data.live}
                    rooms={rooms ?? []}
                    statusByDevice={statusByDevice}
                    onOpen={(s: Section) => (s === "goodnight" ? setGoodnightOpen(true) : go({ k: s } as Screen))}
                    onOpenRoom={(roomId) => go({ k: "room", roomId })}
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
                    Tile={NebulaControlTile}
                  />
                )}
                {screen.k === "rooms" && (
                  <NebulaRoomList rooms={rooms ?? []} statusByDevice={statusByDevice} onOpenRoom={(roomId) => go({ k: "room", roomId })} />
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
                    Tile={NebulaControlTile}
                  />
                )}
                {screen.k === "routines" && <SleekRoutines rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />}
                {screen.k === "automations" && <SleekAutomations rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />}
                {screen.k === "shortcuts" && <SleekShortcuts rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />}
                {screen.k === "switchGroups" && <SleekSwitchGroups rooms={rooms ?? []} isAdmin={isAdmin} editMode={editMode} />}
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

        <NebulaMasterControl onDone={data.reload} raised={isAdmin} />
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
          stats={{ rooms: stats.roomCount, devices: stats.deviceCount, on: stats.onCount, offline: stats.offline, protectedCount: stats.protectedCount }}
        />
        <NebulaBoot houseName={data.houseName} deviceCount={stats.deviceCount} />
        <LockedOverlay isAdmin={isAdmin} locked={data.locked} info={data.lockInfo} onUnlocked={data.reload} />
        <SuperProtectedGate isAdmin={isAdmin} configured={data.superProtectedConfigured} rooms={rooms ?? []} onConfigured={data.reload} />
      </div>
    </MotionConfig>
  );
}
