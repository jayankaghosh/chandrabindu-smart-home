import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { deleteRoutine, getRoutine, updateRoutine } from "@/lib/store";
import { logAction } from "@/lib/logger";
import type { RoutineAction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
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
    return NextResponse.json({ error: "Add at least one action" }, { status: 400 });
  }

  const ok = await updateRoutine(params.id, name, actions);
  if (!ok) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }
  logAction("ROUTINE_EDIT", { name, actions: actions.length });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  const routine = await getRoutine(params.id);
  await deleteRoutine(params.id);
  if (routine) logAction("ROUTINE_DELETE", { name: routine.name });
  return NextResponse.json({ ok: true });
}
