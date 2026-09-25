// Client helpers for screensaver image uploads:
//  • resizeImage — downscale/compress in the browser so each upload stays well
//    under any proxy body-size limit (fixes 413) and batches upload fast.
//  • collectImageFiles — pull image files out of a drag-drop, recursing into
//    dropped folders (all subfolders) via the webkitGetAsEntry API.

const MAX_DIM = 1920;
const QUALITY = 0.82;
const IMAGE_RE = /\.(jpe?g|png|webp|gif)$/i;

/** Downscale to <=MAX_DIM on the long edge and re-encode as JPEG (or keep GIF). */
export async function resizeImage(file: File): Promise<Blob> {
  // GIFs may be animated — canvas would flatten them, so upload as-is.
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // fall back to original if decode fails
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
  return blob ?? file;
}

function readEntries(reader: any): Promise<any[]> {
  return new Promise((resolve) => reader.readEntries((e: any[]) => resolve(e), () => resolve([])));
}

function fileFromEntry(entry: any): Promise<File | null> {
  return new Promise((resolve) => entry.file((f: File) => resolve(f), () => resolve(null)));
}

async function walkEntry(entry: any, out: File[]): Promise<void> {
  if (!entry) return;
  if (entry.isFile) {
    const f = await fileFromEntry(entry);
    if (f && IMAGE_RE.test(f.name)) out.push(f);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    // readEntries returns in batches; keep reading until empty.
    let batch = await readEntries(reader);
    while (batch.length) {
      for (const child of batch) await walkEntry(child, out);
      batch = await readEntries(reader);
    }
  }
}

/** Collect image files from a drop, recursing into any dropped folders. */
export async function collectImageFiles(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const items = dt.items ? Array.from(dt.items) : [];
  const entries = items
    .map((it) => (typeof (it as any).webkitGetAsEntry === "function" ? (it as any).webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length) {
    for (const entry of entries) await walkEntry(entry, out);
  } else {
    // No entry API (rare) — fall back to the flat file list.
    for (const f of Array.from(dt.files)) if (IMAGE_RE.test(f.name)) out.push(f);
  }
  return out;
}

/** Filter a plain FileList (e.g. from a <input webkitdirectory>) to images. */
export function imageFilesFrom(list: FileList | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => IMAGE_RE.test(f.name));
}
