"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Loader2, Settings as SettingsIcon, LogOut, Volume2, VolumeX } from "lucide-react";
import { useHomeData } from "../useHomeData";
import { favKey } from "../favKey";
import Assistant from "../Assistant";
import Insights from "../Insights";
import ProtectedAlert from "../ProtectedAlert";
import LockedOverlay from "../LockedOverlay";
import SuperProtectedGate from "../SuperProtectedGate";
import { readEditMode, setEditMode as persistEditMode } from "../sleek/editMode";
import { greeting, houseStats } from "../sleek/nav";
import SleekGoodnight from "../sleek/SleekGoodnight";
import SleekScreensaver from "../sleek/SleekScreensaver";
import SleekScreensaverSettings from "../sleek/SleekScreensaverSettings";
import SleekVoice from "../sleek/SleekVoice";
import SleekRoutines from "../sleek/SleekRoutines";
import SleekAutomations from "../sleek/SleekAutomations";
import SleekShortcuts from "../sleek/SleekShortcuts";
import SleekSwitchGroups from "../sleek/SleekSwitchGroups";
import NebulaBackground from "./NebulaBackground";
import NebulaBoot from "./NebulaBoot";
import CursorAura from "./CursorAura";
import Hud from "./Hud";
import Dock, { dockItem, type DockKey, type PanelKind } from "./Dock";
import OrbitScene from "./OrbitScene";
import RoomFocus from "./RoomFocus";
import NebulaPanel, { ManageTabs } from "./NebulaPanel";
import CommandBar, { type CommandAction } from "./CommandBar";
import NebulaMasterControl from "./NebulaMasterControl";
import RoutinesPanel from "./panels/RoutinesPanel";
import { AutomationsPanel, ShortcutsPanel } from "./panels/RulesPanels";
import { FavouritesPanel, GroupsPanel } from "./panels/ControlPanels";
import UsagePanel from "./panels/UsagePanel";
import { SOUND_EVENT, emitWarp, setSoundOn, sfx, soundOn } from "./fx";

const VIEW_KEY = "nebula-view";
const PANELS: PanelKind[] = ["favourites", "routines", "automations", "shortcuts", "switchGroups", "usage", "insights", "voice", "screensaver"];
/** Panels whose authoring (admin, Edit Mode) reuses the shared editors. */
const MANAGED: PanelKind[] = ["routines", "automations", "shortcuts", "switchGroups"];

type View = { room: string | null; panel: PanelKind | null };
type Anchor = { x: number; y: number };

function loadView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}");
    return {
      room: typeof v.room === "string" ? v.room : null,
      panel: PANELS.includes(v.panel) ? v.panel : null,
    };
  } catch {
    return { room: null, panel: null };
  }
}

// Nebula: an orbital deck. Home is a solar system (rooms as planets round the
// energy core); tapping a planet flies into that room. Everything else lives
// in the dock and opens as holographic panels over the scene, and the command
// bar (Cmd/Ctrl+K) drives anything by typing. Same data, APIs and safety rules
// as the other themes; the safety overlays are the shared ones.
export default function NebulaApp({ role }: { role: "admin" | "user"; username: string }) {
  const isAdmin = role === "admin";
  const router = useRouter();
  const data = useHomeData();
  const { rooms, statusByDevice, favourites } = data;

  const [view, setView] = useState<View>(loadView);
  const [origin, setOrigin] = useState<Anchor>({ x: 0, y: 0 });
  const [commandOpen, setCommandOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [goodnightOpen, setGoodnightOpen] = useState(false);
  const [protDismissed, setProtDismissed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      /* ignore */
    }
  }, [view]);

  // Nebula is always dark, whatever this device's light/dark choice is.
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.ui = "nebula";
    setOrigin({ x: innerWidth / 2, y: innerHeight / 2 });
  }, []);

  // A restored room that no longer exists drops back to the orbit.
  useEffect(() => {
    if (view.room && rooms && !rooms.find((r) => r.id === view.room)) setView((v) => ({ ...v, room: null }));
  }, [view.room, rooms]);

  const [greet, setGreet] = useState("");
  useEffect(() => setGreet(greeting()), []);

  const [sound, setSound] = useState(true);
  useEffect(() => {
    const sync = () => setSound(soundOn());
    sync();
    window.addEventListener(SOUND_EVENT, sync);
    return () => window.removeEventListener(SOUND_EVENT, sync);
  }, []);

  const [editMode, setEditModeState] = useState(false);
  useEffect(() => {
    if (isAdmin) setEditModeState(readEditMode());
  }, [isAdmin]);
  const toggleEditMode = (on: boolean) => {
    setEditModeState(on);
    persistEditMode(on);
    if (!on) setManage(false);
  };

  // Which controls belong to a switch group (badge on the orbs). Re-read when
  // a panel closes, since the groups may have just been edited.
  const [groupedKeys, setGroupedKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (view.panel) return;
    fetch("/api/switch-groups")
      .then((r) => r.json())
      .then((d) => {
        const set = new Set<string>();
        for (const g of d.groups ?? []) for (const m of g.members ?? []) set.add(favKey(m.deviceId, m.code));
        setGroupedKeys(set);
      })
      .catch(() => {});
  }, [view.panel]);

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

  const enterRoom = useCallback((roomId: string, at?: Anchor) => {
    if (at) setOrigin(at);
    emitWarp(1);
    sfx("nav");
    window.scrollTo({ top: 0 });
    setView((v) => ({ ...v, room: roomId }));
  }, []);
  const leaveRoom = useCallback(() => {
    emitWarp(-1);
    sfx("back");
    setView((v) => ({ ...v, room: null }));
  }, []);
  const openPanel = useCallback((k: DockKey) => {
    if (k === "search") return setCommandOpen(true);
    if (k === "goodnight") return setGoodnightOpen(true);
    setManage(false);
    setView((v) => ({ ...v, panel: v.panel === k ? null : k }));
  }, []);
  const closePanel = useCallback(() => setView((v) => ({ ...v, panel: null })), []);

  // Keyboard: Cmd/Ctrl+K opens the command bar; Escape closes the panel, then
  // leaves the room. Popovers and the command bar catch their own Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        sfx("nav");
        return;
      }
      if (e.key !== "Escape" || commandOpen || goodnightOpen) return;
      if (view.panel) {
        // Manage hosts editors with their own dialogs; don't close under them.
        if (!manage) closePanel();
      } else if (view.room) leaveRoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, goodnightOpen, view.panel, view.room, manage, closePanel, leaveRoom]);

  const stats = useMemo(() => houseStats(rooms, statusByDevice), [rooms, statusByDevice]);
  const energy = stats.switchCount > 0 ? stats.onCount / stats.switchCount : 0;
  const currentRoom = view.room ? (rooms ?? []).find((r) => r.id === view.room) : undefined;
  const canManage = isAdmin && editMode && !!view.panel && MANAGED.includes(view.panel);
  const showManage = canManage && manage;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const toggleSound = () => {
    setSoundOn(!sound);
    if (!sound) setTimeout(() => sfx("on"), 0);
  };
  const shellActions: CommandAction[] = [
    { id: "x:sound", title: sound ? "Mute sounds" : "Unmute sounds", hint: "Interface", icon: sound ? VolumeX : Volume2, run: toggleSound },
    { id: "x:settings", title: "Settings", hint: "Open", icon: SettingsIcon, run: () => router.push("/settings") },
    { id: "x:logout", title: "Log out", hint: "Account", icon: LogOut, run: logout },
  ];

  const controlProps = {
    rooms: rooms ?? [],
    statusByDevice,
    isAdmin,
    favourites,
    groupedKeys,
    onCommand: data.sendCommand,
    onToggleFavourite: data.toggleFavourite,
  };

  function panelBody(k: PanelKind) {
    if (showManage) {
      if (k === "routines") return <SleekRoutines rooms={rooms ?? []} isAdmin editMode />;
      if (k === "automations") return <SleekAutomations rooms={rooms ?? []} isAdmin editMode />;
      if (k === "shortcuts") return <SleekShortcuts rooms={rooms ?? []} isAdmin editMode />;
      if (k === "switchGroups") return <SleekSwitchGroups rooms={rooms ?? []} isAdmin editMode />;
    }
    switch (k) {
      case "favourites":
        return <FavouritesPanel {...controlProps} />;
      case "routines":
        return <RoutinesPanel />;
      case "automations":
        return <AutomationsPanel rooms={rooms ?? []} isAdmin={isAdmin} />;
      case "shortcuts":
        return <ShortcutsPanel rooms={rooms ?? []} />;
      case "switchGroups":
        return <GroupsPanel {...controlProps} />;
      case "usage":
        return <UsagePanel />;
      case "insights":
        return <Insights isAdmin={isAdmin} />;
      case "voice":
        return <SleekVoice />;
      case "screensaver":
        return <SleekScreensaverSettings isAdmin={isAdmin} />;
    }
  }

  const fly = `${origin.x}px ${origin.y}px`;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-clip text-slate-100">
        <NebulaBackground energy={energy} />
        <CursorAura />

        <Hud
          houseName={data.houseName}
          greet={greet}
          live={data.live}
          offline={stats.offline}
          isAdmin={isAdmin}
          editMode={editMode}
          onEditMode={toggleEditMode}
          syncing={syncing}
          onSync={syncFromCloud}
          sound={sound}
          onSound={toggleSound}
          onCommand={() => setCommandOpen(true)}
          onLogout={logout}
        />

        {!rooms && !data.error ? (
          <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 text-cyan-200/70">
            <Loader2 size={26} className="animate-spin" />
            <span className="nb-mono text-[11px] uppercase">Linking</span>
          </div>
        ) : data.error ? (
          <p className="pt-40 text-center text-red-400">{data.error}</p>
        ) : (
          <AnimatePresence initial={false}>
            {!currentRoom ? (
              <motion.div
                key="orbit"
                style={{ transformOrigin: fly }}
                initial={{ opacity: 0, scale: 2.4, filter: "blur(16px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
                exit={{ opacity: 0, scale: 2.8, filter: "blur(18px)" }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="fixed inset-0"
              >
                <OrbitScene
                  rooms={rooms ?? []}
                  statusByDevice={statusByDevice}
                  onCount={stats.onCount}
                  switchCount={stats.switchCount}
                  live={data.live}
                  onEnter={enterRoom}
                />
              </motion.div>
            ) : (
              <motion.div
                key={`room:${currentRoom.id}`}
                style={{ transformOrigin: fly }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.55, filter: "blur(10px)" }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="pt-24"
              >
                <RoomFocus
                  room={currentRoom}
                  rooms={rooms ?? []}
                  statusByDevice={statusByDevice}
                  isAdmin={isAdmin}
                  editMode={editMode}
                  favourites={favourites}
                  groupedKeys={groupedKeys}
                  onCommand={data.sendCommand}
                  onToggleFavourite={data.toggleFavourite}
                  onChanged={data.reload}
                  onBack={leaveRoom}
                  onSwitchRoom={(id) => enterRoom(id)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {view.panel && (
            <NebulaPanel
              key={view.panel}
              title={dockItem(view.panel).label}
              icon={dockItem(view.panel).icon}
              hue={dockItem(view.panel).hue}
              wide={showManage || view.panel === "insights"}
              tabs={canManage ? <ManageTabs manage={manage} onChange={setManage} /> : undefined}
              onClose={closePanel}
            >
              {panelBody(view.panel)}
            </NebulaPanel>
          )}
        </AnimatePresence>

        <Dock active={view.panel} onPick={openPanel} />
        <NebulaMasterControl onDone={data.reload} />
        <Assistant available={data.aiAvailable} big />

        <AnimatePresence>
          {commandOpen && rooms && (
            <CommandBar
              rooms={rooms}
              statusByDevice={statusByDevice}
              isAdmin={isAdmin}
              onClose={() => setCommandOpen(false)}
              onEnterRoom={(id) => {
                setView((v) => ({ ...v, panel: null }));
                enterRoom(id);
              }}
              onOpen={openPanel}
              onCommand={data.sendCommand}
              actions={shellActions}
            />
          )}
        </AnimatePresence>

        {data.protectedOff.length > 0 && !protDismissed && (
          <ProtectedAlert
            items={data.protectedOff}
            onTurnOn={(deviceId, code) => data.sendCommand(deviceId, code, true)}
            onDismiss={() => setProtDismissed(true)}
          />
        )}
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
