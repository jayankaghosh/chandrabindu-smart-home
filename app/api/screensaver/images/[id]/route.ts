import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { guard } from "@/lib/auth";
import { updateScreensaverImages } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "data", "screensaver");
const TYPE: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// A stored id is `<hex>.<ext>` — reject anything else (path-traversal guard).
function safeId(id: string): boolean {
  return /^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(id);
}

// Serve an uploaded screensaver image (any signed-in user).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = guard();
  if (denied) return denied;
  if (!safeId(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const buf = fs.readFileSync(path.join(DIR, params.id));
    const ext = params.id.split(".").pop()!;
    return new NextResponse(buf, {
      headers: { "Content-Type": TYPE[ext] || "application/octet-stream", "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// Delete an uploaded image (admin): removes the file and the config entry.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = guard({ admin: true });
  if (denied) return denied;
  if (!safeId(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    fs.unlinkSync(path.join(DIR, params.id));
  } catch {
    /* file already gone */
  }
  const images = updateScreensaverImages((ids) => ids.filter((x) => x !== params.id));
  logAction("SCREENSAVER_IMAGE_DELETE", { id: params.id });
  return NextResponse.json({ images });
}
