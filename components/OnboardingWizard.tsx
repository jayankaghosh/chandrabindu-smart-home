"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Lock,
  CloudDownload,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { REGIONS } from "@/lib/regions";
import ManualDeviceForm from "./ManualDeviceForm";

type Step = "password" | "cloud";

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");

  // step 1
  const [houseName, setHouseName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // step 2
  const [accessId, setAccessId] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState(REGIONS[0].url);
  const [openrouterKey, setOpenrouterKey] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualCount, setManualCount] = useState(0);

  const card = "card w-full max-w-md rounded-3xl p-8";
  const field =
    "field";

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 4) return setError("Password must be at least 4 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, houseName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      setStep("cloud");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitSync(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Save the optional OpenRouter key first (independent of sync outcome).
    if (openrouterKey.trim()) {
      try {
        await fetch("/api/insights/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: openrouterKey.trim() }),
        });
      } catch {
        /* non-blocking */
      }
    }
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId, accessSecret, baseUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(
        `${(e as Error).message}. You can add devices manually instead.`,
      );
      setManualMode(true);
    } finally {
      setBusy(false);
    }
  }

  if (step === "password") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <form onSubmit={submitPassword} className={card}>
          <Header subtitle="Step 1 of 2 · Name your home & set a password" />
          <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Home name
          </label>
          <input
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            className={`${field} mb-3`}
            placeholder="e.g. Sharma Residence"
          />
          <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
            New password
          </label>
          <div className="relative mb-3">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={`${field} pl-9`} placeholder="••••••••" />
          </div>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} placeholder="Confirm password" />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={busy || !password} className="btn-primary mt-5 w-full py-2.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={manualMode ? "w-full max-w-2xl" : card}>
        {!manualMode ? (
          <form onSubmit={submitSync}>
            <Header subtitle="Step 2 of 2 · Connect Tuya cloud (one-time sync)" />
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              We use these once to pull your rooms, devices and local keys.
              After that the app controls everything locally over Wi-Fi.
            </p>
            <div className="space-y-3">
              <input value={accessId} onChange={(e) => setAccessId(e.target.value)} className={field} placeholder="Access ID / Client ID" />
              <input value={accessSecret} onChange={(e) => setAccessSecret(e.target.value)} className={field} placeholder="Access Secret / Client Secret" />
              <select value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={field}>
                {REGIONS.map((r) => (
                  <option key={r.url} value={r.url}>
                    {r.label} — {r.url}
                  </option>
                ))}
              </select>
              <input
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                className={field}
                placeholder="OpenRouter API key — optional, for Insights"
              />
            </div>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={busy || !accessId || !accessSecret} className="btn-primary mt-5 w-full py-2.5">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
              {busy ? "Syncing…" : "Sync from cloud"}
            </button>
            <button type="button" onClick={() => setManualMode(true)} className="mt-3 w-full text-center text-sm text-slate-500 dark:text-slate-400 transition hover:text-slate-900">
              Skip — add devices manually instead
            </button>
          </form>
        ) : (
          <div className="card rounded-3xl p-8">
            <Header subtitle="Add devices manually" />
            {error && <p className="mb-3 text-sm text-amber-600 dark:text-slate-300">{error}</p>}
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Enter each device's ID and local key. Added so far:{" "}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{manualCount}</span>
            </p>
            <ManualDeviceForm onAdded={() => setManualCount((n) => n + 1)} />
            <button
              onClick={() => {
                router.replace("/");
                router.refresh();
              }}
              disabled={manualCount === 0}
              className="btn-ghost mt-6 w-full py-2.5"
            >
              <CheckCircle2 size={16} />
              Finish — go to dashboard
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Logo"
        className="h-11 w-11 rounded-2xl object-cover shadow-[0_8px_24px_-8px_rgba(16,24,40,0.4)]"
      />
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Smart Home setup</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}
