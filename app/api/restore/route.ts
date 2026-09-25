import { NextResponse } from "next/server";
import { guard } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";
import { gatewayReinit } from "@/lib/gateway";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Restore a .cnbdu backup (admin only). Accepts the file either as a multipart
// upload (field "file") or as the raw JSON body. Overwrites the bundled files,
// then re-inits the gateway so a restored catalog takes effect.
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let text = "";
  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file && typeof file !== "string") text = await (file as File).text();
    } else {
      text = await req.text();
    }
  } catch {
    return NextResponse.json({ error: "Couldn't read the uploaded file" }, { status: 400 });
  }

  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Not a valid .cnbdu file" }, { status: 400 });
  }

  try {
    const { restored, catalogChanged } = restoreBackup(bundle);
    logAction("RESTORE", { restored });
    if (catalogChanged) {
      try {
        await gatewayReinit();
      } catch {
        /* gateway may be down; catalog still restored, it'll pick up on next start */
      }
    }
    return NextResponse.json({ ok: true, restored });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
