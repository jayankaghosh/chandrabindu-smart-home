// Switch-group store (data/switchGroups.json). Admin-authored via the web UI;
// the device gateway watches this file and keeps each group's members in sync
// (any member on → all on, any off → all off). Mirrors lib/automations.ts.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { SwitchGroup, SwitchGroupMember } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const PATH = path.join(DATA_DIR, "switchGroups.json");

function read(): SwitchGroup[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATH, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed?.groups;
    return Array.isArray(list) ? list.filter(isGroup) : [];
  } catch {
    return [];
  }
}

function write(list: SwitchGroup[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify({ groups: list }, null, 2), "utf8");
}

function isGroup(x: any): x is SwitchGroup {
  return x && typeof x.id === "string" && Array.isArray(x.members);
}

function cleanMembers(raw: unknown): SwitchGroupMember[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SwitchGroupMember[] = [];
  for (const m of raw as any[]) {
    if (!m || typeof m.deviceId !== "string" || typeof m.code !== "string") continue;
    const key = `${m.deviceId}::${m.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ deviceId: m.deviceId, code: m.code });
  }
  return out;
}

interface GroupInput {
  name?: unknown;
  members?: unknown;
}

function normalize(input: GroupInput): Omit<SwitchGroup, "id"> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Group name is required");
  const members = cleanMembers(input.members);
  if (members.length < 2) throw new Error("Add at least two switches to a group");
  return { name, members };
}

export function listSwitchGroups(): SwitchGroup[] {
  return read();
}

export function addSwitchGroup(input: GroupInput): SwitchGroup {
  const body = normalize(input);
  const group: SwitchGroup = { id: `grp-${crypto.randomBytes(6).toString("hex")}`, ...body };
  const list = read();
  list.push(group);
  write(list);
  return group;
}

export function updateSwitchGroup(id: string, input: GroupInput): SwitchGroup {
  const list = read();
  const idx = list.findIndex((g) => g.id === id);
  if (idx < 0) throw new Error("Group not found");
  list[idx] = { id, ...normalize(input) };
  write(list);
  return list[idx];
}

export function deleteSwitchGroup(id: string): void {
  write(read().filter((g) => g.id !== id));
}
