import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { favKey } from "./lib/format";
import type {
  Automation,
  DeviceStatusState,
  Favourite,
  InsightMeta,
  InsightResult,
  RoomsResponse,
  Routine,
} from "./types";

// ── Rooms / house ──────────────────────────────────────────────────────────
export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: () => apiGet<RoomsResponse>("/api/rooms"),
    staleTime: 15_000,
  });
}

// ── Live status (bulk) ───────────────────────────────────────────────────────
// One request for many devices via the status endpoint that accepts a device
// list; polled so the UI stays roughly live without an SSE connection.
type StatusResponse = { devices: { deviceId: string; reachable: boolean; values: Record<string, unknown> }[] };

export function useStatuses(deviceIds: string[]) {
  const ids = [...deviceIds].sort();
  return useQuery({
    queryKey: ["statuses", ids],
    enabled: ids.length > 0,
    refetchInterval: 6_000,
    queryFn: async (): Promise<Record<string, DeviceStatusState>> => {
      const map: Record<string, DeviceStatusState> = {};
      // The endpoint caps at 30 ids per call; chunk to be safe.
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        const res = await apiPost<StatusResponse>("/api/voice/status", { deviceIds: chunk });
        for (const d of res.devices ?? []) map[d.deviceId] = { reachable: d.reachable, values: d.values ?? {} };
      }
      return map;
    },
  });
}

// ── Commands ─────────────────────────────────────────────────────────────────
export function useSendCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, code, value }: { deviceId: string; code: string; value: unknown }) =>
      apiPost<{ ok: boolean }>(`/api/devices/${deviceId}/commands`, { commands: [{ code, value }] }),
    // Refresh status shortly after a command lands.
    onSettled: () => setTimeout(() => qc.invalidateQueries({ queryKey: ["statuses"] }), 500),
  });
}

// ── Favourites ───────────────────────────────────────────────────────────────
export function useFavourites() {
  return useQuery({
    queryKey: ["favourites"],
    queryFn: async () => {
      const res = await apiGet<{ favourites: Favourite[] }>("/api/favourites");
      return new Set((res.favourites ?? []).map((f) => favKey(f.deviceId, f.code)));
    },
    staleTime: 30_000,
  });
}

export function useToggleFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, code, favourite }: { deviceId: string; code: string; favourite: boolean }) =>
      apiPost<{ favourites: Favourite[] }>("/api/favourites", { deviceId, code, favourite }),
    onSuccess: (res) => {
      qc.setQueryData(["favourites"], new Set((res.favourites ?? []).map((f) => favKey(f.deviceId, f.code))));
    },
  });
}

// ── Routines ─────────────────────────────────────────────────────────────────
export function useRoutines() {
  return useQuery({
    queryKey: ["routines"],
    queryFn: () => apiGet<{ routines: Routine[] }>("/api/routines").then((r) => r.routines ?? []),
    staleTime: 30_000,
  });
}

export function useRunRoutine() {
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<{ ok: number; failed: number; ignoredProtected: number; ignoredLocked: number }>(
        `/api/routines/${id}/run`,
      ),
  });
}

// ── Automations (read-only) ──────────────────────────────────────────────────
export function useAutomations() {
  return useQuery({
    queryKey: ["automations"],
    queryFn: () => apiGet<{ automations: Automation[] }>("/api/automations").then((r) => r.automations ?? []),
    staleTime: 30_000,
  });
}

// ── Insights (read-only) ─────────────────────────────────────────────────────
export function useInsights() {
  return useQuery({
    queryKey: ["insights"],
    queryFn: () =>
      apiGet<{ available: boolean; hasKey: boolean; model: string; today: string; analyses: InsightMeta[] }>(
        "/api/insights",
      ),
    staleTime: 60_000,
  });
}

export function useInsight(key: string | null) {
  return useQuery({
    queryKey: ["insight", key],
    enabled: !!key,
    queryFn: () => apiGet<InsightResult>(`/api/insights/${key}`),
  });
}

// ── Voice availability ───────────────────────────────────────────────────────
export function useVoiceAvailable() {
  return useQuery({
    queryKey: ["voice-available"],
    queryFn: () => apiGet<{ available: boolean }>("/api/voice/session").then((r) => r.available),
    staleTime: 60_000,
  });
}
