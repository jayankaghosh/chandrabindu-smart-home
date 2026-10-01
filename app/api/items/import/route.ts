import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { importItem, ITEM_KINDS, type ItemKind } from "@/lib/itemTransfer";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

// Import an exported .cnbdu item as a NEW record (admin).
// POST /api/items/import?kind=routine  body: the file's contents.
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  const kind = new URL(req.url).searchParams.get("kind") as ItemKind;
  if (!ITEM_KINDS.includes(kind)) {
    return NextResponse.json({ error: "kind must be routine, automation or shortcut" }, { status: 400 });
  }
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "That isn't a .cnbdu file." }, { status: 400 });
  }
  try {
    const result = await importItem(kind, parsed);
    logAction("ITEM_IMPORT", { kind, id: result.id, name: result.name, warnings: result.warnings.length });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
