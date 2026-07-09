"use client";

// Shared live-data layer for the home UI: rooms, real-time device status (via
// the SSE stream with polling fallback), commands, and favourites. Used by the
// Sleek theme; the Classic Dashboard has its own equivalent copy. Both talk to
// the same APIs + SSE, so they stay in sync at runtime regardless.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "@/lib/types";
import { favKey } from "./favKey";

export interface DeviceStatusState {
  reachable: boolean | null;
  scanning: boolean;
  values: Record<string, unknown>;
}

export function useHomeData() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [houseName, setHouseName] = useState("Home");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusByDevice, setStatusByDevice] = useState<Record<string, DeviceStatusState>>({});
  const [live, setLive] = useState(false);
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const liveRef = useRef(live);
  liveRef.current = live;

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/rooms");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRooms(data.rooms);
      setAiAvailable(Boolean(data.aiAvailable));
      if (data.houseName) setHouseName(data.houseName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const fetchDeviceStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/devices/${id}/status`);
      const data = await res.json().catch(() => ({}));
      setStatusByDevice((prev) => {
        const cur = prev[id] ?? { reachable: null, scanning: false, values: {} };
        if (!res.ok) return { ...prev, [id]: { ...cur, reachable: false, scanning: Boolean(data.scanning) } };
        const values: Record<string, unknown> = {};
        for (const s of data.status ?? []) values[s.code] = s.value;
        return { ...prev, [id]: { reachable: true, scanning: false, values } };
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Live SSE — snapshot + change/state events keep statusByDevice current.
  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const applySnapshot = (devices: { id: string; connected: boolean; status: Record<string, unknown> }[]) => {
      setStatusByDevice((prev) => {
        const next = { ...prev };
        for (const d of devices) next[d.id] = { reachable: !!d.connected, scanning: false, values: d.status ?? {} };
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

  // Polling fallback: when the live SSE stream isn't connected (no gateway),
  // poll every device's status so the UI still reflects real state.
  useEffect(() => {
    if (!rooms || live) return;
    const ids = rooms.flatMap((r) => r.devices.map((d) => d.id));
    if (ids.length === 0) return;
    const tick = () => {
      if (document.visibilityState === "visible") ids.forEach(fetchDeviceStatus);
    };
    tick();
    const t = setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [rooms, live, fetchDeviceStatus]);

  // Favourites
  const loadFavourites = useCallback(async () => {
    try {
      const res = await fetch("/api/favourites");
      if (!res.ok) return;
      const data = await res.json();
      const keys = (data.favourites ?? []).map((f: { deviceId: string; code: string }) => favKey(f.deviceId, f.code));
      setFavourites(new Set(keys));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    loadFavourites();
  }, [loadFavourites]);

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
      setFavourites((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(key);
        else copy.add(key);
        return copy;
      });
    }
  }, []);

  const sendCommand = useCallback(
    async (deviceId: string, code: string, value: unknown) => {
      let previous: unknown;
      setStatusByDevice((prev) => {
        const cur = prev[deviceId] ?? { reachable: true, scanning: false, values: {} };
        previous = cur.values[code];
        return { ...prev, [deviceId]: { ...cur, reachable: true, values: { ...cur.values, [code]: value } } };
      });
      try {
        const res = await fetch(`/api/devices/${deviceId}/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: [{ code, value }] }),
        });
        if (!res.ok) throw new Error();
        if (!liveRef.current) setTimeout(() => fetchDeviceStatus(deviceId), 600);
      } catch {
        setStatusByDevice((prev) => {
          const cur = prev[deviceId];
          if (!cur) return prev;
          return { ...prev, [deviceId]: { ...cur, values: { ...cur.values, [code]: previous } } };
        });
      }
    },
    [fetchDeviceStatus],
  );

  return {
    rooms,
    houseName,
    aiAvailable,
    loading,
    error,
    statusByDevice,
    live,
    favourites,
    toggleFavourite,
    sendCommand,
    fetchDeviceStatus,
    reload: load,
  };
}
