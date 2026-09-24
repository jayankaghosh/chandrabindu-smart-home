// Mirrors the server's UI types (lib/types.ts) — only the fields the app uses.

export interface DeviceFunction {
  code: string;
  name: string;
  type: string; // "Boolean" | "Enum" | "Integer" | "String"
  range?: string[];
  min?: number;
  max?: number;
  step?: number;
  scale?: number;
  unit?: string;
  protected?: boolean;
}

export interface UiDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  roomId: string;
  bluetooth?: boolean;
  functions: DeviceFunction[];
}

export interface Room {
  id: string;
  name: string;
  locked?: boolean;
  unlocked?: boolean;
  devices: UiDevice[];
}

export interface RoomsResponse {
  syncedAt: number | null;
  rooms: Room[];
  houseName: string;
  aiAvailable: boolean;
}

export interface DeviceStatusState {
  reachable: boolean;
  values: Record<string, unknown>;
}

export interface Favourite {
  deviceId: string;
  code: string;
}

export interface RoutineAction {
  deviceId: string;
  code: string;
  value: unknown;
  roomName: string;
  deviceName: string;
  controlName: string;
  valueLabel: string;
  type?: string;
}

export interface Routine {
  id: string;
  name: string;
  actions: RoutineAction[];
}

export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  match: "all" | "any";
  conditions: { deviceId: string; code: string; value: unknown }[];
  actions: { deviceId: string; code: string; value: unknown }[];
}

export interface InsightMeta {
  key: string;
  days: number;
  date: string;
  generatedAt: number;
  model: string;
  logLines: number;
  headline: string;
}

export interface InsightReport {
  headline: string;
  sections: { icon?: string; title: string; bullets: string[] }[];
}

export interface InsightResult {
  key: string;
  days: number;
  date: string;
  model: string;
  generatedAt: number;
  text: string;
  logLines: number;
  report?: InsightReport;
}

export interface RealtimeSecret {
  clientSecret: string;
  model: string;
  expiresAt: number;
  idleTimeoutSec: number;
}

export type Session = { username: string; role: "admin" | "user"; token: string };
