"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CloudDownload,
  Loader2,
  KeyRound,
  Plus,
  CheckCircle2,
  Radar,
  Sparkles,
  House,
  Users,
  Lock,
  MonitorSmartphone,
  Cpu,
  Palette,
  ShieldAlert,
  Mic,
} from "lucide-react";
import { REGIONS } from "@/lib/regions";
import ManualDeviceForm from "./ManualDeviceForm";
import UsersManager from "./UsersManager";
import ChangePassword from "./ChangePassword";
import DevicePairing from "./DevicePairing";
import GatewayControl from "./GatewayControl";
import ThemeSelect from "./ThemeSelect";

export default function Settings({ isAdmin }: { isAdmin: boolean }) {
  const [resyncing, setResyncing] = useState(false);
  const [resyncMsg, setResyncMsg] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  // Home name
  const [houseName, setHouseName] = useState("");
  const [houseMsg, setHouseMsg] = useState<string | null>(null);
  const [savingHouse, setSavingHouse] = useState(false);

  // AI features (OpenRouter)
  const [ai, setAi] = useState<{
    hasKey: boolean;
    enabled: boolean;
    available: boolean;
    model: string;
  } | null>(null);
  const [orKey, setOrKey] = useState("");
  const [orModel, setOrModel] = useState("");
  const [savingOr, setSavingOr] = useState(false);
  const [orMsg, setOrMsg] = useState<string | null>(null);
  const [togglingAi, setTogglingAi] = useState(false);

  // Auto-restore protected controls (gateway turns them back on if switched off)
  const [autoRestore, setAutoRestore] = useState<boolean | null>(null);
  const [togglingAutoRestore, setTogglingAutoRestore] = useState(false);

  // Realtime voice (OpenAI)
  const [voice, setVoice] = useState<{
    hasKey: boolean;
    enabled: boolean;
    available: boolean;
    model: string;
    voice: string;
  } | null>(null);
  const [voKey, setVoKey] = useState("");
  const [voModel, setVoModel] = useState("");
  const [voVoice, setVoVoice] = useState("");
  const [savingVo, setSavingVo] = useState(false);
  const [voMsg, setVoMsg] = useState<string | null>(null);
  const [togglingVoice, setTogglingVoice] = useState(false);

  const [creds, setCreds] = useState<{
    hasCreds: boolean;
    accessId?: string;
    baseUrl?: string;
  } | null>(null);
  const [accessId, setAccessId] = useState("");
  const [accessSecret, setAccessSecret] = useState("");
  const [baseUrl, setBaseUrl] = useState(REGIONS[0].url);
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState<string | null>(null);

  const loadCreds = useCallback(async () => {
    const res = await fetch("/api/credentials");
    if (!res.ok) return;
    const data = await res.json();
    setCreds(data);
    if (data.accessId) setAccessId(data.accessId);
    if (data.baseUrl) setBaseUrl(data.baseUrl);
  }, []);

  const loadAi = useCallback(async () => {
    const res = await fetch("/api/insights/config");
    if (!res.ok) return;
    const data = await res.json();
    setAi(data);
    if (data.model) setOrModel(data.model);
  }, []);

  const loadVoice = useCallback(async () => {
    const res = await fetch("/api/voice/config");
    if (!res.ok) return;
    const data = await res.json();
    setVoice(data);
    if (data.model) setVoModel(data.model);
    if (data.voice) setVoVoice(data.voice);
  }, []);

  async function saveVoice(payload: { apiKey?: string; model?: string; voice?: string; enabled?: boolean }) {
    const res = await fetch("/api/voice/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setVoice(data);
    return data;
  }

  async function saveVoiceForm(e: React.FormEvent) {
    e.preventDefault();
    setSavingVo(true);
    setVoMsg(null);
    try {
      await saveVoice({ apiKey: voKey || undefined, model: voModel || undefined, voice: voVoice || undefined });
      setVoKey("");
      setVoMsg("Saved.");
    } catch (e2) {
      setVoMsg((e2 as Error).message);
    } finally {
      setSavingVo(false);
    }
  }

  async function toggleVoice(next: boolean) {
    setTogglingVoice(true);
    setVoMsg(null);
    try {
      await saveVoice({ enabled: next });
    } catch (e2) {
      setVoMsg((e2 as Error).message);
    } finally {
      setTogglingVoice(false);
    }
  }

  async function toggleAi(next: boolean) {
    setTogglingAi(true);
    setOrMsg(null);
    try {
      const res = await fetch("/api/insights/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAi(data);
    } catch (e2) {
      setOrMsg((e2 as Error).message);
    } finally {
      setTogglingAi(false);
    }
  }

  const loadAutoRestore = useCallback(async () => {
    const res = await fetch("/api/protected/auto-restore");
    if (res.ok) setAutoRestore(Boolean((await res.json()).enabled));
  }, []);

  async function toggleAutoRestore(next: boolean) {
    setTogglingAutoRestore(true);
    try {
      const res = await fetch("/api/protected/auto-restore", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAutoRestore(Boolean(data.enabled));
    } catch {
      /* leave the previous state; the switch simply won't move */
    } finally {
      setTogglingAutoRestore(false);
    }
  }

  const loadHouse = useCallback(async () => {
    const res = await fetch("/api/house");
    if (res.ok) setHouseName((await res.json()).name || "");
  }, []);

  useEffect(() => {
    if (!isAdmin) return; // standard users only see the password section
    loadCreds();
    loadAi();
    loadHouse();
    loadAutoRestore();
    loadVoice();
  }, [isAdmin, loadCreds, loadAi, loadHouse, loadAutoRestore, loadVoice]);

  async function saveHouse(e: React.FormEvent) {
    e.preventDefault();
    setSavingHouse(true);
    setHouseMsg(null);
    try {
      const res = await fetch("/api/house", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: houseName }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setHouseMsg("Saved.");
    } catch (e2) {
      setHouseMsg((e2 as Error).message);
    } finally {
      setSavingHouse(false);
    }
  }

  async function saveInsights(e: React.FormEvent) {
    e.preventDefault();
    setSavingOr(true);
    setOrMsg(null);
    try {
      const res = await fetch("/api/insights/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: orKey, model: orModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setOrMsg("Saved.");
      setOrKey("");
      loadAi();
    } catch (e2) {
      setOrMsg((e2 as Error).message);
    } finally {
      setSavingOr(false);
    }
  }

  async function resync() {
    setResyncing(true);
    setResyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-sync failed");
      setResyncMsg(`Synced ${data.devices} devices across ${data.rooms} rooms.`);
    } catch (e) {
      setResyncMsg((e as Error).message);
    } finally {
      setResyncing(false);
    }
  }

  async function scan() {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setScanMsg(
        `Found ${data.found} Tuya device${data.found === 1 ? "" : "s"} on the network, matched ${data.matched} to your catalog. They're now reachable directly.`,
      );
    } catch (e) {
      setScanMsg((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function saveCreds(e: React.FormEvent) {
    e.preventDefault();
    setSavingCreds(true);
    setCredsMsg(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId, accessSecret, baseUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setCredsMsg("Credentials verified and saved.");
      setAccessSecret("");
      loadCreds();
    } catch (e) {
      setCredsMsg((e as Error).message);
    } finally {
      setSavingCreds(false);
    }
  }

  const field =
    "field";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="icon-btn"
        >
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {isAdmin ? "Advanced settings" : "Settings"}
        </h1>
      </header>

      <div className="space-y-4">
        {/* Change password — available to every signed-in user */}
        <Section icon={<Lock size={16} />} title="Change password">
          <ChangePassword minLength={isAdmin ? 4 : 6} />
        </Section>

        {/* Appearance / theme — available to every signed-in user, per device */}
        <Section icon={<Palette size={16} />} title="Appearance">
          <ThemeSelect />
        </Section>

        {/* Link an external device — available to every signed-in user */}
        <Section icon={<MonitorSmartphone size={16} />} title="Link a device">
          <DevicePairing />
        </Section>

        {isAdmin && (
          <>
            {/* Users */}
            <Section icon={<Users size={16} />} title="Users">
              <UsersManager />
            </Section>

            {/* Device gateway */}
            <Section icon={<Cpu size={16} />} title="Device gateway">
              <GatewayControl />
            </Section>

            {/* Protected controls */}
            <Section icon={<ShieldAlert size={16} />} title="Protected controls">
              <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                Controls you've marked as protected (e.g. a modem) should stay
                on. When this is enabled, the gateway turns a protected control
                back on the moment it's switched off — from anywhere — and logs
                it. Requires the device gateway to be running.
              </p>
              <div className="flex items-center justify-between rounded-xl border border-white/60 bg-white/40 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Auto turn back on
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {autoRestore == null
                      ? "…"
                      : autoRestore
                        ? "On · protected controls are kept on automatically"
                        : "Off · you'll only be warned when one is off"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(autoRestore)}
                  disabled={autoRestore == null || togglingAutoRestore}
                  onClick={() => toggleAutoRestore(!autoRestore)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    autoRestore ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                  title="Toggle auto turn-on of protected controls"
                >
                  <span
                    className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      autoRestore ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </Section>

            {/* Home name */}
            <Section icon={<House size={16} />} title="Home name">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Shown in the header beside the logo.
          </p>
          <form onSubmit={saveHouse} className="flex items-center gap-2">
            <input
              value={houseName}
              onChange={(e) => setHouseName(e.target.value)}
              className="field"
              placeholder="e.g. Sharma Residence"
            />
            <button
              type="submit"
              disabled={savingHouse || !houseName.trim()}
              className="btn-primary"
            >
              {savingHouse ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Save
            </button>
          </form>
          {houseMsg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{houseMsg}</p>}
        </Section>

        {/* Re-sync */}
        <Section icon={<CloudDownload size={16} />} title="Re-sync from cloud">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Re-pull devices, rooms and local keys using your stored
            credentials. Manual devices and your local edits are kept.
          </p>
          <button
            onClick={resync}
            disabled={resyncing || !creds?.hasCreds}
            className="btn-primary"
          >
            {resyncing ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CloudDownload size={15} />
            )}
            Re-sync now
          </button>
          {!creds?.hasCreds && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              No credentials stored — add them below first.
            </p>
          )}
          {resyncMsg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{resyncMsg}</p>}
        </Section>

        {/* LAN scan */}
        <Section icon={<Radar size={16} />} title="Scan LAN for devices">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            If devices show <span className="text-amber-600 dark:text-slate-300">Unreachable</span>,
            your network may be blocking Tuya's discovery broadcast. This scans
            your Wi-Fi for the devices directly and saves their addresses.
          </p>
          <button
            onClick={scan}
            disabled={scanning}
            className="btn-primary"
          >
            {scanning ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Radar size={15} />
            )}
            {scanning ? "Scanning… (up to a minute)" : "Scan LAN now"}
          </button>
          {scanMsg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{scanMsg}</p>}
        </Section>

        {/* Credentials */}
        <Section icon={<KeyRound size={16} />} title="Tuya credentials">
          {creds?.hasCreds && (
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Current: <span className="font-medium text-slate-900 dark:text-slate-100">{creds.accessId}</span>{" "}
              at {creds.baseUrl}
            </p>
          )}
          <form onSubmit={saveCreds} className="space-y-3">
            <input value={accessId} onChange={(e) => setAccessId(e.target.value)} className={field} placeholder="Access ID / Client ID" />
            <input value={accessSecret} onChange={(e) => setAccessSecret(e.target.value)} className={field} placeholder="Access Secret (re-enter to update)" />
            <select value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={field}>
              {REGIONS.map((r) => (
                <option key={r.url} value={r.url}>
                  {r.label} — {r.url}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={savingCreds || !accessId || !accessSecret}
              className="btn-primary"
            >
              {savingCreds ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Verify &amp; save
            </button>
            {credsMsg && <p className="text-sm text-slate-600 dark:text-slate-300">{credsMsg}</p>}
          </form>
        </Section>

        {/* AI features */}
        <Section icon={<Sparkles size={16} />} title="AI features">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Powers Insights, the Assistant chat, and routine recommendations via
            an LLM (OpenRouter). They all turn off together when disabled or when
            no key is set.
          </p>

          {/* Enable / disable toggle */}
          <div className="mb-4 flex items-center justify-between rounded-xl border border-white/60 bg-white/40 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                AI features
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {!ai?.hasKey
                  ? "Add an API key below to enable."
                  : ai.available
                    ? `On · model ${ai.model}`
                    : "Off"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(ai?.available)}
              disabled={!ai?.hasKey || togglingAi}
              onClick={() => toggleAi(!ai?.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                ai?.available
                  ? "bg-brand-500"
                  : "bg-slate-300 dark:bg-slate-600"
              }`}
              title={ai?.hasKey ? "Toggle AI features" : "Add a key first"}
            >
              <span
                className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  ai?.available ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <form onSubmit={saveInsights} className="space-y-3">
            <input
              value={orKey}
              onChange={(e) => setOrKey(e.target.value)}
              className="field"
              placeholder={
                ai?.hasKey
                  ? "OpenRouter API key (re-enter to change)"
                  : "OpenRouter API key (sk-or-…)"
              }
            />
            <input
              value={orModel}
              onChange={(e) => setOrModel(e.target.value)}
              className="field"
              placeholder="Model (e.g. qwen/qwen3-coder:free)"
            />
            <button
              type="submit"
              disabled={savingOr || (!orKey && !orModel)}
              className="btn-primary"
            >
              {savingOr ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CheckCircle2 size={15} />
              )}
              Save
            </button>
            {orMsg && <p className="text-sm text-slate-600 dark:text-slate-300">{orMsg}</p>}
          </form>
        </Section>

        {/* Voice (Realtime) */}
        <Section icon={<Mic size={16} />} title="Voice (Realtime)">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Hands-free voice control in the Sleek theme, powered by OpenAI's
            realtime model. Needs a separate OpenAI API key (it can't run through
            OpenRouter). The key stays on the server; the browser only gets a
            short-lived token.
          </p>

          {/* Enable / disable toggle */}
          <div className="mb-4 flex items-center justify-between rounded-xl border border-white/60 bg-white/40 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.05]">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Voice mode</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {!voice?.hasKey
                  ? "Add an OpenAI key below to enable."
                  : voice.available
                    ? `On · model ${voice.model}, voice ${voice.voice}`
                    : "Off"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(voice?.available)}
              disabled={!voice?.hasKey || togglingVoice}
              onClick={() => toggleVoice(!voice?.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                voice?.available ? "bg-brand-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
              title={voice?.hasKey ? "Toggle voice mode" : "Add a key first"}
            >
              <span
                className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  voice?.available ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <form onSubmit={saveVoiceForm} className="space-y-3">
            <input
              value={voKey}
              onChange={(e) => setVoKey(e.target.value)}
              className="field"
              placeholder={voice?.hasKey ? "OpenAI API key (re-enter to change)" : "OpenAI API key (sk-…)"}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                value={voModel}
                onChange={(e) => setVoModel(e.target.value)}
                className="field"
                placeholder="Model (e.g. gpt-realtime)"
              />
              <input
                value={voVoice}
                onChange={(e) => setVoVoice(e.target.value)}
                className="field"
                placeholder="Voice (e.g. marin)"
              />
            </div>
            <button type="submit" disabled={savingVo || (!voKey && !voModel && !voVoice)} className="btn-primary">
              {savingVo ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Save
            </button>
            {voMsg && <p className="text-sm text-slate-600 dark:text-slate-300">{voMsg}</p>}
          </form>
        </Section>

        {/* Manual add */}
        <Section icon={<Plus size={16} />} title="Add a device manually">
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Needs the device ID and 16-character local key. We'll connect over
            the LAN and detect its controls.
          </p>
          <ManualDeviceForm />
        </Section>
          </>
        )}
      </div>
    </main>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2 text-slate-800 dark:text-slate-200">
        <span className="text-brand-600 dark:text-slate-200">{icon}</span>
        <h2 className="font-medium">{title}</h2>
      </div>
      {children}
    </section>
  );
}
