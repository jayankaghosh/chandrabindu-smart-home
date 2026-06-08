// Shared types for the dashboard <-> backend contract.

export interface TuyaCreds {
  accessId: string;
  accessSecret: string;
  baseUrl: string;
}

/** A controllable function (action) of a device, with its local dp id. */
export interface CatalogFunction {
  code: string;
  /** Tuya local datapoint id used by tuyapi (e.g. 101). */
  dpId: number;
  /** "Boolean" | "Enum" | "Integer" | "String". */
  type: string;
  /** Display label — your custom name from the app, else the code. */
  name: string;
  range?: string[];
  min?: number;
  max?: number;
  step?: number;
  /** Tuya integer scale: real value = raw / 10^scale. */
  scale?: number;
  unit?: string;
}

/** A device as captured from the last cloud sync (held locally). */
export interface CatalogDevice {
  id: string;
  /** Local key for tuyapi LAN control (secret — stays on disk only). */
  key: string;
  /** Detected/assumed local protocol version, e.g. "3.4". */
  version: string;
  category: string;
  cloudName: string;
  cloudRoomId?: string;
  /** Known LAN IP (from a scan or manual entry) — skips UDP discovery. */
  ip?: string;
  /** Last-known online flag from the cloud at sync time. */
  online: boolean;
  /** True for devices added by hand (not from a cloud sync). */
  manual?: boolean;
  functions: CatalogFunction[];
}

export interface CatalogRoom {
  id: string;
  name: string;
}

export interface Catalog {
  syncedAt: number;
  rooms: CatalogRoom[];
  devices: CatalogDevice[];
}

/** Local-only edits that survive a re-sync. */
export interface Overrides {
  /** deviceId -> roomId */
  deviceRoom: Record<string, string>;
  /** deviceId -> custom display name */
  deviceName: Record<string, string>;
  /** roomId -> custom room name */
  roomName: Record<string, string>;
  /** deviceId -> { control code -> custom label } */
  controlName: Record<string, Record<string, string>>;
  /** Locally-created rooms not present in the cloud. */
  extraRooms: CatalogRoom[];
}

// ── Shapes sent to the browser ──────────────────────────────────────────────

export interface UiDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  roomId: string;
  functions: DeviceFunction[];
}

export interface Room {
  id: string;
  name: string;
  devices: UiDevice[];
  /** True if an admin has set a password lock on this room. */
  locked?: boolean;
  /** True if this room is accessible to the current session (not locked, or unlocked). */
  unlocked?: boolean;
}

/** Function shape exposed to the UI (no dp id / key). */
export interface DeviceFunction {
  code: string;
  name: string;
  type: string;
  range?: string[];
  min?: number;
  max?: number;
  step?: number;
  scale?: number;
  unit?: string;
  /** Admin-marked critical control — never auto-toggled, control restricted. */
  protected?: boolean;
}

export interface DeviceStatus {
  code: string;
  value: unknown;
}

export interface CommandRequest {
  code: string;
  value: unknown;
}

// ── Routines (scenes) ───────────────────────────────────────────────────────
export interface RoutineAction {
  deviceId: string;
  code: string;
  value: unknown;
  /** Wait this many milliseconds before running this action (default 0). */
  delayMs?: number;
}

export interface Routine {
  id: string;
  name: string;
  actions: RoutineAction[];
}

/** A routine action with resolved display labels, for the UI. */
export interface EnrichedRoutineAction extends RoutineAction {
  roomName: string;
  deviceName: string;
  controlName: string;
  type?: string;
  valueLabel: string;
}

export interface EnrichedRoutine {
  id: string;
  name: string;
  actions: EnrichedRoutineAction[];
}

// ── Insights ────────────────────────────────────────────────────────────────
export interface InsightSection {
  /** Icon keyword: activity | device | room | clock | alert | suggestion | energy | info */
  icon: string;
  title: string;
  bullets: string[];
}

/** A concrete action the user can one-click turn into a routine. */
export interface RecommendedAction {
  deviceId: string;
  code: string;
  value: unknown;
  deviceName: string;
  controlName: string;
  valueLabel: string;
}

export interface RecommendedRoutine {
  name: string;
  description?: string;
  actions: RecommendedAction[];
}

export interface InsightReport {
  headline: string;
  sections: InsightSection[];
  /** Actionable routine suggestions, validated against the catalog. */
  recommendedRoutines?: RecommendedRoutine[];
}
