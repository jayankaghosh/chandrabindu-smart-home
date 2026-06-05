"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CloudDownload,
  Settings as SettingsIcon,
} from "lucide-react";
import type { Room } from "@/lib/types";
import RoomCard, { type DeviceStatusState } from "./RoomCard";
import Routines from "./Routines";
import Insights from "./Insights";
import Assistant from "./Assistant";
import ThemeToggle from "./ThemeToggle";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function tabCls(active: boolean): string {
  return active
    ? "rounded-xl bg-white px-5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm dark:bg-white/90 dark:text-slate-900"
    : "rounded-xl px-5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-300 dark:hover:text-white";
}

export default function Dashboard({
  role,
  username,
}: {
  role: "admin" | "user";
  username: string;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [houseName, setHouseName] = useState("Home");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<"rooms" | "routines" | "insights">("rooms");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [statusByDevice, setStatusByDevice] = useState<
    Record<string, DeviceStatusState>
  >({});

  const roomsRef = useRef<Room[] | null>(null);
  roomsRef.current = rooms;

  const fetchDeviceStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/devices/${id}/status`);
      const data = await res.json().catch(() => ({}));
      setStatusByDevice((prev) => {
        const cur = prev[id] ?? { reachable: null, scanning: false, values: {} };
        if (!res.ok) {
          return {
            ...prev,
            [id]: { ...cur, reachable: false, scanning: Boolean(data.scanning) },
          };
        }
        const values: Record<string, unknown> = {};
        for (const s of data.status ?? []) values[s.code] = s.value;
        return { ...prev, [id]: { reachable: true, scanning: false, values } };
      });
    } catch {
      /* ignore */
    }
  }, []);

  const fetchAllStatus = useCallback(() => {
    const list = roomsRef.current;
    if (!list) return;
    const ids = list.flatMap((r) => r.devices.map((d) => d.id));
    ids.forEach((id) => fetchDeviceStatus(id));
  }, [fetchDeviceStatus]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/rooms");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRooms(data.rooms);
      setSyncedAt(data.syncedAt);
      setAiAvailable(Boolean(data.aiAvailable));
      if (data.houseName) setHouseName(data.houseName);
      roomsRef.current = data.rooms;
      // Status is fetched per-device only while expanded (see RoomCard).
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router, fetchAllStatus]);

  useEffect(() => {
    load();
  }, [load]);

  // Manual refresh: reload rooms + pull status for everything once.
  const refresh = useCallback(() => {
    load();
    fetchAllStatus();
  }, [load, fetchAllStatus]);

  const sendCommand = useCallback(
    async (deviceId: string, code: string, value: unknown) => {
      let previous: unknown;
      setStatusByDevice((prev) => {
        const cur = prev[deviceId] ?? {
          reachable: true,
          scanning: false,
          values: {},
        };
        previous = cur.values[code];
        return {
          ...prev,
          [deviceId]: {
            ...cur,
            reachable: true,
            values: { ...cur.values, [code]: value },
          },
        };
      });
      try {
        const res = await fetch(`/api/devices/${deviceId}/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: [{ code, value }] }),
        });
        if (!res.ok) throw new Error();
        setTimeout(() => fetchDeviceStatus(deviceId), 600);
      } catch {
        setStatusByDevice((prev) => {
          const cur = prev[deviceId];
          if (!cur) return prev;
          return {
            ...prev,
            [deviceId]: { ...cur, values: { ...cur.values, [code]: previous } },
          };
        });
      }
    },
    [fetchDeviceStatus],
  );

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const deviceCount = rooms?.reduce((n, r) => n + r.devices.length, 0) ?? 0;
  const roomOptions = (rooms ?? []).map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/40 bg-white/40 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="mx-auto flex w-full max-w-[1700px] items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Logo"
              className="h-11 w-11 shrink-0 rounded-2xl object-cover shadow-[0_8px_22px_-6px_rgba(16,24,40,0.35)]"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {greeting()}
              </p>
              <h1 className="-mt-0.5 truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {houseName}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="hidden items-center gap-1.5 rounded-full bg-white/40 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-white/[0.06] dark:text-slate-300 sm:inline-flex"
              title={isAdmin ? "Admin user" : "Standard user"}
            >
              {username}
              <span className="text-slate-400 dark:text-slate-500">
                · {isAdmin ? "admin user" : "standard user"}
              </span>
            </span>
            {isAdmin && (
              <button onClick={sync} disabled={syncing} className="btn-ghost hidden sm:inline-flex">
                {syncing ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CloudDownload size={15} />
                )}
                Sync
              </button>
            )}
            <button onClick={refresh} title="Refresh" className="icon-btn">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <ThemeToggle />
            <Link href="/settings" title="Settings" className="icon-btn">
              <SettingsIcon size={16} />
            </Link>
            <button onClick={logout} title="Log out" className="icon-btn">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1700px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-5 inline-flex rounded-2xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.05] p-1 backdrop-blur-xl">
          <button onClick={() => setView("rooms")} className={tabCls(view === "rooms")}>
            Rooms
          </button>
          <button
            onClick={() => setView("routines")}
            className={tabCls(view === "routines")}
          >
            Routines
          </button>
          <button
            onClick={() => setView("insights")}
            className={tabCls(view === "insights")}
          >
            Insights
          </button>
        </div>

        {view === "routines" && <Routines rooms={rooms ?? []} isAdmin={isAdmin} />}
        {view === "insights" && <Insights isAdmin={isAdmin} />}

        {view === "rooms" && rooms && rooms.length > 0 && (
          <div className="mb-5 flex items-baseline justify-between px-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{rooms.length}</span>{" "}
              rooms ·{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{deviceCount}</span>{" "}
              devices
            </p>
            {syncedAt && (
              <p className="text-xs text-slate-400 dark:text-slate-500">synced {timeAgo(syncedAt)}</p>
            )}
          </div>
        )}

        {view === "rooms" && loading && !rooms && (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-400 dark:text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            Loading…
          </div>
        )}

        {view === "rooms" && error && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {view === "rooms" && rooms && rooms.length === 0 && !loading && (
          <div className="card animate-fade-in mx-auto mt-10 max-w-lg p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/12 dark:bg-white/10 text-brand-600 dark:text-slate-200">
              <CloudDownload size={26} />
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">No devices yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              {isAdmin
                ? "Sync from the cloud or add devices manually. After the one-time sync, everything is controlled locally over your Wi-Fi."
                : "No devices have been set up yet. Ask an admin to add them."}
            </p>
            {isAdmin && (
              <div className="mt-5 flex items-center justify-center gap-2.5">
                <button onClick={sync} disabled={syncing} className="btn-primary">
                  {syncing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CloudDownload size={16} />
                  )}
                  Sync
                </button>
                <Link href="/settings" className="btn-ghost">
                  <SettingsIcon size={16} />
                  Settings
                </Link>
              </div>
            )}
          </div>
        )}

        {view === "rooms" && rooms && rooms.length > 0 && (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
            {rooms.map((room, i) => (
              <RoomCard
                key={room.id}
                room={room}
                index={i}
                isAdmin={isAdmin}
                statusByDevice={statusByDevice}
                rooms={roomOptions}
                onCommand={sendCommand}
                onPoll={fetchDeviceStatus}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating AI assistant (only when AI features are available) */}
      <Assistant available={aiAvailable} />
    </div>
  );
}
