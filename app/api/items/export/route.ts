import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { exportItem, ITEM_KINDS, type ItemKind } from "@/lib/itemTransfer";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Download one routine / automation / shortcut as <timestamp>.cnbdu (admin).
// GET /api/items/export?kind=routine&id=rtn-…
export async function GET(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as ItemKind;
  const id = url.searchParams.get("id") ?? "";
  if (!ITEM_KINDS.includes(kind) || !id) {
    return NextResponse.json({ error: "kind (routine|automation|shortcut) and id are required" }, { status: 400 });
  }
  const out = await exportItem(kind, id);
  if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stamp = new Date(out.bundle.exportedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  logAction("ITEM_EXPORT", { kind, id, name: out.name });
  return new NextResponse(JSON.stringify(out.bundle, null, 2), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${stamp}.cnbdu"`,
      "Cache-Control": "no-store",
    },
  });
}
