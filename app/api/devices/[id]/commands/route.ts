import { NextResponse } from "next/server";
import { getSession, guard, isRoomAccessible } from "@/lib/auth";
import { getCatalogDevice, getDeviceRoomId, getDeviceRoomName } from "@/lib/store";
import { setCommandLocal } from "@/lib/local";
import { logAction } from "@/lib/logger";
import type { CommandRequest, CatalogFunction } from "@/lib/types";

export const dynamic = "force-dynamic";

// Validate a command against the device's catalog before sending it over the
// LAN — the code must be a known function and the value must fit its type.
function validate(cmd: CommandRequest, fn: CatalogFunction): string | null {
  switch (fn.type) {
    case "Boolean":
      if (typeof cmd.value !== "boolean") return `${fn.code} expects a boolean`;
      return null;
    case "Enum":
      if (typeof cmd.value !== "string") return `${fn.code} expects a string`;
      if (fn.range && !fn.range.includes(cmd.value))
        return `${cmd.value} is not valid for ${fn.code}`;
      return null;
    case "Integer":
      if (typeof cmd.value !== "number") return `${fn.code} expects a number`;
      if (typeof fn.min === "number" && cmd.value < fn.min)
        return `${fn.code} below minimum ${fn.min}`;
      if (typeof fn.max === "number" && cmd.value > fn.max)
        return `${fn.code} above maximum ${fn.max}`;
      return null;
    default:
      return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard();
  if (denied) return denied;
  const user = getSession()?.username;
  const device = await getCatalogDevice(params.id);
  if (!device) {
    return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }

  // Block control of devices in a locked room the session hasn't unlocked.
  const roomId = await getDeviceRoomId(params.id);
  if (!isRoomAccessible(roomId)) {
    return NextResponse.json(
      { error: "This room is locked. Unlock it to control its devices.", locked: true },
      { status: 423 },
    );
  }

  let commands: CommandRequest[] = [];
  try {
    const body = await req.json();
    commands = Array.isArray(body?.commands) ? body.commands : [];
  } catch {
    commands = [];
  }
  if (!commands.length) {
    return NextResponse.json({ error: "No commands provided" }, { status: 400 });
  }

  const byCode = new Map(device.functions.map((f) => [f.code, f]));
  for (const cmd of commands) {
    if (!cmd || typeof cmd.code !== "string") {
      return NextResponse.json(
        { error: "Each command needs a code" },
        { status: 400 },
      );
    }
    const fn = byCode.get(cmd.code);
    if (!fn) {
      return NextResponse.json(
        { error: `Unknown function "${cmd.code}" for this device` },
        { status: 400 },
      );
    }
    const problem = validate(cmd, fn);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const fnByCode = new Map(device.functions.map((f) => [f.code, f.name]));
  const room = await getDeviceRoomName(params.id);
  try {
    const ok = await setCommandLocal(device, commands);
    for (const c of commands) {
      logAction("COMMAND", {
        user,
        room,
        device: device.cloudName,
        control: fnByCode.get(c.code) ?? c.code,
        code: c.code,
        value: c.value,
        ok,
      });
    }
    return NextResponse.json({ ok });
  } catch (err) {
    const message = (err as Error).message;
    for (const c of commands) {
      logAction("COMMAND_FAILED", {
        user,
        room,
        device: device.cloudName,
        code: c.code,
        value: c.value,
        error: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
