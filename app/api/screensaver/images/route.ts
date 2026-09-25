import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { guard } from "@/lib/auth";
import { updateScreensaverImages } from "@/lib/config";
import { logAction } from "@/lib/logger";

export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "data", "screensaver");
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 8 * 1024 * 1024;

// Upload a screensaver image (admin, multipart field "file"). Saved to
// data/screensaver/<id>.<ext>; the id is appended to config.screensaver.images.
export async function POST(req: Request) {
  const denied = guard({ admin: true });
  if (denied) return denied;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f && typeof f !== "string") file = f as File;
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG, WebP or GIF image" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 400 });

  const id = `${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, id), buf);
  const images = updateScreensaverImages((ids) => [...ids, id]);
  logAction("SCREENSAVER_IMAGE_ADD", { id });
  return NextResponse.json({ images });
}
