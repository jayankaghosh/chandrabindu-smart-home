"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Settings as SettingsIcon, LogOut, Volume2, VolumeX, CloudDownload, Loader2, Pencil, Play } from "lucide-react";
import ScrambleText from "./ScrambleText";
import { sfx } from "./fx";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// The heads-up display along the top: house, time and link state on the left;
// command, Run/Edit (admins), sound, settings and sign-out on the right.
export default function Hud({
  houseName,
  greet,
  live,
  offline,
  isAdmin,
  editMode,
  onEditMode,
  syncing,
  onSync,
  sound,
  onSound,
  onCommand,
  onLogout,
}: {
  houseName: string;
  greet: string;
  live: boolean;
  offline: number;
  isAdmin: boolean;
  editMode: boolean;
  onEditMode: (on: boolean) => void;
  syncing: boolean;
  onSync: () => void;
  sound: boolean;
  onSound: () => void;
  onCommand: () => void;
  onLogout: () => void;
}) {
  const now = useClock();
  const time = now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--";
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-[rgba(6,8,22,0.55)] text-slate-300 backdrop-blur-xl transition hover:border-cyan-300/50 hover:text-white hover:shadow-[0_0_20px_-6px_rgba(34,211,238,0.8)] active:scale-90 disabled:opacity-50";

  return (
    <motion.header
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.15 }}
      className="fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-4 sm:px-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 rounded-full object-cover shadow-[0_0_24px_rgba(34,211,238,0.45)]" />
        <div className="min-w-0">
          <p className="nb-mono hidden text-[10px] uppercase text-cyan-200/70 sm:block">
            <ScrambleText text={greet || " "} />
          </p>
          <p className="nb-gradient-text truncate text-lg font-semibold leading-tight tracking-tight sm:text-xl">{houseName}</p>
          <p className="nb-mono flex items-center gap-2 whitespace-nowrap text-[10px] uppercase text-slate-400">
            <span>{time}</span>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "nb-blink bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"}`} />
            <span className="hidden sm:inline">{live ? "Live link" : "Polling"}</span>
            {offline > 0 && <span className="text-amber-300">{offline} offline</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={onCommand} className={`${btn} sm:w-auto sm:gap-2 sm:px-3.5`} aria-label="Open command bar">
          <Search size={16} />
          <kbd className="nb-mono hidden text-[10px] text-slate-500 sm:inline">⌘K</kbd>
        </button>
        {isAdmin && (
          <button
            onClick={() => {
              sfx("tick");
              onEditMode(!editMode);
            }}
            aria-label={editMode ? "Edit mode on. Switch to run mode" : "Run mode. Switch to edit mode"}
            title={editMode ? "Edit mode" : "Run mode"}
            className={`${btn} ${editMode ? "!border-amber-300/60 !bg-amber-400/20 !text-amber-200" : ""}`}
          >
            {editMode ? <Pencil size={15} /> : <Play size={15} />}
          </button>
        )}
        {isAdmin && editMode && (
          <button onClick={onSync} disabled={syncing} aria-label="Sync from cloud" title="Sync from cloud" className={btn}>
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
          </button>
        )}
        {/* On phones, sound / settings / sign-out live in the command bar. */}
        <button onClick={onSound} aria-label={sound ? "Mute interface sounds" : "Unmute interface sounds"} className={`${btn} hidden sm:flex`}>
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <Link href="/settings" aria-label="Settings" className={`${btn} hidden sm:flex`}>
          <SettingsIcon size={16} />
        </Link>
        <button onClick={onLogout} aria-label="Log out" className={`${btn} hidden sm:flex`}>
          <LogOut size={16} />
        </button>
      </div>
    </motion.header>
  );
}
