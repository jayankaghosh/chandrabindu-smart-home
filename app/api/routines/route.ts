import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { addRoutine, listRoutinesEnriched } from "@/lib/store";
import { logAction } from "@/lib/logger";
import type { RoutineAction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = guard();
  if (denied) return denied;
  return NextResponse.json({ routines: await listRoutinesEnriched() });
}

export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const rawActions = Array.isArray(body?.actions) ? body.actions : [];
  const actions: RoutineAction[] = rawActions
    .filter(
      (a: any) =>
        a && typeof a.deviceId === "string" && typeof a.code === "string",
    )
    .map((a: any) => ({
      deviceId: a.deviceId,
      code: a.code,
      value: a.value,
      delayMs:
        typeof a.delayMs === "number" && a.delayMs > 0
          ? Math.floor(a.delayMs)
          : 0,
    }));

  if (!name) {
    return NextResponse.json({ error: "Routine name required" }, { status: 400 });
  }
  if (actions.length === 0) {
    return NextResponse.json(
      { error: "Add at least one action" },
      { status: 400 },
    );
  }

  const routine = await addRoutine(name, actions);
  logAction("ROUTINE_CREATE", { name, actions: actions.length });
  return NextResponse.json({ id: routine.id });
}
