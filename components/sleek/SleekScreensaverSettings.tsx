"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Monitor, Upload, Trash2, Loader2, FolderUp } from "lucide-react";
import { collectImageFiles, imageFilesFrom, resizeImage } from "./screensaverUpload";

const LS_KEY = "sleek-screensaver-on";

// Homepage "Screensaver" screen. Everyone can enable/disable it for THEIR device
// (localStorage). Admins additionally set the idle delay and manage the shared
// image set (drag-drop files, multiple, or whole folders — recursively).
export default function SleekScreensaverSettings({ isAdmin }: { isAdmin: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [idleSec, setIdleSec] = useState("120");
  const [imageSec, setImageSec] = useState("12");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(LS_KEY) === "on");
    } catch {}
    fetch("/api/screensaver")
      .then((r) => r.json())
      .then((d) => {
        setIdleSec(String(d.idleSec ?? 120));
        setImageSec(String(d.imageSec ?? 12));
        setImages(d.images ?? []);
      })
      .catch(() => {});
  }, []);

  function toggleEnabled(on: boolean) {
    setEnabled(on);
    try {
      localStorage.setItem(LS_KEY, on ? "on" : "off");
    } catch {}
    // Tell the running overlay (same tab) to pick up the change immediately.
    window.dispatchEvent(new Event("sleek-screensaver-change"));
  }

  async function saveTimings() {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/screensaver", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idleSec: Number(idleSec), imageSec: Number(imageSec) }),
      });
      const d = await res.json();
      if (res.ok) {
        setIdleSec(String(d.idleSec));
        setImageSec(String(d.imageSec));
      }
    } catch {}
  }

  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setMsg(null);
    let done = 0;
    let failed = 0;
    let latest: string[] = [];
    for (const file of files) {
      setProgress(`Uploading ${done + 1} / ${files.length}…`);
      try {
        const blob = await resizeImage(file);
        const form = new FormData();
        // resized non-gif images become jpeg; keep a sensible filename
        form.append("file", blob, file.type === "image/gif" ? file.name : "image.jpg");
        const res = await fetch("/api/screensaver/images", { method: "POST", body: form });
        const d = await res.json();
        if (res.ok) latest = d.images ?? latest;
        else failed++;
      } catch {
        failed++;
      }
      done++;
    }
    if (latest.length) setImages(latest);
    setProgress(null);
    setBusy(false);
    setMsg(`Added ${done - failed} image${done - failed === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`);
    setTimeout(() => setMsg(null), 3500);
  }, []);

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!isAdmin) return;
    const files = await collectImageFiles(e.dataTransfer);
    uploadFiles(files);
  }

  async function del(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/screensaver/images/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (res.ok) setImages(d.images ?? []);
    } finally {
      setBusy(false);
    }
  }

  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-6">
      {/* Per-device enable */}
      <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/60 bg-white/50 p-5 dark:border-white/10 dark:bg-white/[0.06]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-500">
            <Monitor size={22} />
          </span>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Screensaver on this device</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Shows a clock and photos after {idleSec}s of no activity.
            </p>
          </div>
        </div>
        <button
          onClick={() => toggleEnabled(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative h-8 w-14 shrink-0 rounded-full transition ${enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      {!isAdmin && (
        <p className="px-1 text-sm text-slate-500 dark:text-slate-400">
          The images are managed by an administrator.
        </p>
      )}

      {isAdmin && (
        <>
          {/* Timings */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Idle before showing (seconds)</span>
              <input
                value={idleSec}
                onChange={(e) => setIdleSec(e.target.value)}
                onBlur={saveTimings}
                inputMode="numeric"
                className="field w-32"
              />
            </label>
            <label className="text-sm text-slate-600 dark:text-slate-300">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Seconds per image</span>
              <input
                value={imageSec}
                onChange={(e) => setImageSec(e.target.value)}
                onBlur={saveTimings}
                inputMode="numeric"
                className="field w-32"
              />
            </label>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-3xl border-2 border-dashed p-8 text-center transition ${
              dragOver
                ? "border-brand-500 bg-brand-500/10"
                : "border-white/60 bg-white/40 dark:border-white/15 dark:bg-white/[0.04]"
            }`}
          >
            <FolderUp className="mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Drag &amp; drop images or folders here
            </p>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Folders are scanned recursively; images are resized before upload.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => fileInput.current?.click()} disabled={busy} className="btn-ghost">
                <Upload size={15} /> Choose images
              </button>
              <button onClick={() => folderInput.current?.click()} disabled={busy} className="btn-ghost">
                <FolderUp size={15} /> Choose folder
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(imageFilesFrom(e.target.files));
                e.target.value = "";
              }}
            />
            <input
              ref={folderInput}
              type="file"
              // @ts-expect-error non-standard but widely supported directory picker
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(imageFilesFrom(e.target.files));
                e.target.value = "";
              }}
            />
            {progress && (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 size={14} className="animate-spin" /> {progress}
              </p>
            )}
          </div>
          {msg && <p className="px-1 text-sm text-slate-600 dark:text-slate-300">{msg}</p>}

          {/* Image grid */}
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {images.map((id) => (
                <div key={id} className="relative aspect-video overflow-hidden rounded-2xl border border-white/60 dark:border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/screensaver/images/${id}`} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => del(id)}
                    disabled={busy}
                    aria-label="Delete image"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
