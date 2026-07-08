"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CloudDownload,
  Settings as SettingsIcon,
  ShieldAlert,
} from "lucide-react";
import type { Room } from "@/lib/types";
import RoomCard, { type DeviceStatusState } from "./RoomCard";
import Routines from "./Routines";
import Automations from "./Automations";
import Insights from "./Insights";
import Favourites from "./Favourites";
import { favKey } from "./favKey";
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

type View = "favourites" | "rooms" | "routines" | "automations" | "insights";
const VIEW_KEY = "dashboard-view";
const VIEWS: readonly View[] = ["favourites", "rooms", "routines", "automations", "insights"];

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
  // Default to "rooms" for SSR/first render; the last-open tab is restored from
  // localStorage in an effect (reading it in the initializer would break SSR).
  const [view, setView] = useState<View>("rooms");
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v && (VIEWS as readonly string[]).includes(v)) setView(v as View);
    } catch {
      /* ignore */
    }
  }, []);
  // Switch tabs and remember the choice for next time.
  const selectView = useCallback((v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }, []);
  const [aiAvailable, setAiAvailable] = useState(false);
  // True while the live SSE stream is connected (gateway present). When live,
  // device state is pushed in real time and interval polling is switched off.
  const [live, setLive] = useState(false);
  // The user's starred controls, keyed `${deviceId}::${code}`.
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  // Computed on the client only — depends on the local clock, so rendering it
  // during SSR causes a hydration mismatch (e.g. "Good evening" vs "Good morning").
  const [greet, setGreet] = useState("");
  useEffect(() => setGreet(greeting()), []);
  // All protected controls + their last server-read state (admin warning source).
  const [protectedControls, setProtectedControls] = useState<
    {
      deviceId: string;
      code: string;
      deviceName: string;
      controlName: string;
      state: string;
    }[]
  >([]);
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

  // Load this user's favourites.
  const loadFavourites = useCallback(async () => {
    try {
      const res = await fetch("/api/favourites");
      if (!res.ok) return;
      const data = await res.json();
      const keys = (data.favourites ?? []).map((f: { deviceId: string; code: string }) =>
        favKey(f.deviceId, f.code),
      );
      setFavourites(new Set(keys));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadFavourites();
  }, [loadFavourites]);

  // Live state stream (SSE) — when the gateway is present, device state is
  // pushed here in real time, so a change by ANY user/source reflects on every
  // open dashboard immediately. Falls back to polling when unavailable.
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const applySnapshot = (devices: { id: string; connected: boolean; status: Record<string, unknown> }[]) => {
      setStatusByDevice((prev) => {
        const next = { ...prev };
        for (const d of devices) {
          next[d.id] = { reachable: !!d.connected, scanning: false, values: d.status ?? {} };
        }
        return next;
      });
    };
    const applyChange = (e: { deviceId: string; code: string; value: unknown }) => {
      setStatusByDevice((prev) => {
        const cur = prev[e.deviceId] ?? { reachable: true, scanning: false, values: {} };
        return { ...prev, [e.deviceId]: { ...cur, reachable: true, values: { ...cur.values, [e.code]: e.value } } };
      });
    };
    const applyState = (e: { deviceId: string; connected: boolean }) => {
      setStatusByDevice((prev) => {
        const cur = prev[e.deviceId] ?? { reachable: null, scanning: false, values: {} };
        return { ...prev, [e.deviceId]: { ...cur, reachable: !!e.connected } };
      });
    };
    const parse = (e: Event) => {
      try {
        return JSON.parse((e as MessageEvent).data);
      } catch {
        return null;
      }
    };

    function connect() {
      es = new EventSource("/api/events");
      es.addEventListener("snapshot", (e) => {
        setLive(true);
        const d = parse(e);
        if (d?.devices) applySnapshot(d.devices);
      });
      es.addEventListener("change", (e) => {
        const d = parse(e);
        if (d) applyChange(d);
      });
      es.addEventListener("state", (e) => {
        const d = parse(e);
        if (d) applyState(d);
      });
      es.onerror = () => {
        setLive(false);
        es?.close();
        // Reconnect (covers a gateway restart). When there's no gateway the
        // endpoint returns 204 and this simply retries quietly in the background.
        if (!closed) retry = setTimeout(connect, 8000);
      };
    }
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, []);

  // Optimistically star/unstar a control, then persist. `next` is computed from
  // the latest favourites (via a ref — toggleFavourite is memoized) BEFORE the
  // state update, so the updater stays pure (safe under StrictMode double-invoke).
  const favouritesRef = useRef(favourites);
  favouritesRef.current = favourites;
  const toggleFavourite = useCallback(async (deviceId: string, code: string) => {
    const key = favKey(deviceId, code);
    const next = !favouritesRef.current.has(key);
    setFavourites((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
    try {
      const res = await fetch("/api/favourites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, code, favourite: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure.
      setFavourites((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(key);
        else copy.add(key);
        return copy;
      });
    }
  }, []);

  // Poll protected devices' power state (admin) and warn if any is off.
  const fetchProtected = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/protected");
      if (!res.ok) return;
      const data = await res.json();
      setProtectedControls(data.controls ?? []);
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchProtected();
    // When live, SSE keeps device states fresh (protectedOff reads statusByDevice),
    // so no polling is needed — the list of protected controls itself rarely changes.
    if (live) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") fetchProtected();
    }, 30_000);
    return () => clearInterval(t);
  }, [isAdmin, fetchProtected, live]);

  // Which protected controls are OFF — prefer the live status the dashboard
  // already has (updates instantly on toggle/poll), falling back to the last
  // server read for controls we haven't polled.
  const protectedOff = useMemo(
    () =>
      protectedControls.filter((c) => {
        if (c.state === "na") return false; // non-boolean → no "off"
        const live = statusByDevice[c.deviceId]?.values;
        if (live && c.code in live) return live[c.code] !== true;
        return c.state === "off";
      }),
    [protectedControls, statusByDevice],
  );

  // Manual refresh: reload rooms + pull status for everything once.
  const refresh = useCallback(() => {
    load();
    fetchAllStatus();
    fetchProtected();
  }, [load, fetchAllStatus, fetchProtected]);

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
                {greet || " "}
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
        {isAdmin && protectedOff.length > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-semibold">
                Protected control{protectedOff.length > 1 ? "s" : ""} OFF:
              </span>{" "}
              {protectedOff
                .map((c) => `${c.deviceName} – ${c.controlName}`)
                .join(", ")}
              . These should stay on — switch them back on.
            </p>
          </div>
        )}
        <div className="mb-5 inline-flex rounded-2xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.05] p-1 backdrop-blur-xl">
          <button
            onClick={() => selectView("favourites")}
            className={tabCls(view === "favourites")}
          >
            Favourites
          </button>
          <button onClick={() => selectView("rooms")} className={tabCls(view === "rooms")}>
            Rooms
          </button>
          <button
            onClick={() => selectView("routines")}
            className={tabCls(view === "routines")}
          >
            Routines
          </button>
          <button
            onClick={() => selectView("automations")}
            className={tabCls(view === "automations")}
          >
            Automations
          </button>
          <button
            onClick={() => selectView("insights")}
            className={tabCls(view === "insights")}
          >
            Insights
          </button>
        </div>

        {view === "favourites" && (
          <Favourites
            rooms={rooms ?? []}
            favourites={favourites}
            statusByDevice={statusByDevice}
            isAdmin={isAdmin}
            live={live}
            onCommand={sendCommand}
            onPoll={fetchDeviceStatus}
            onToggleFavourite={toggleFavourite}
          />
        )}
        {view === "routines" && <Routines rooms={rooms ?? []} isAdmin={isAdmin} />}
        {view === "automations" && <Automations rooms={rooms ?? []} isAdmin={isAdmin} />}
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
                favourites={favourites}
                live={live}
                onCommand={sendCommand}
                onPoll={fetchDeviceStatus}
                onToggleFavourite={toggleFavourite}
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
