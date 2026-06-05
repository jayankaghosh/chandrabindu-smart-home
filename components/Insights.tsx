"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  KeyRound,
  Activity,
  ToggleRight,
  Home,
  Clock,
  AlertTriangle,
  Lightbulb,
  Leaf,
  Info,
  TrendingUp,
  Telescope,
  ThumbsUp,
  ThumbsDown,
  Wand2,
  Plus,
  Check,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type { InsightReport, RecommendedRoutine } from "@/lib/types";

const DAY_OPTIONS = [1, 2, 3, 7, 14, 30, 60, 90];

const SECTION_ICONS: Record<string, { Icon: LucideIcon; chip: string }> = {
  activity: { Icon: Activity, chip: "bg-indigo-500/15 dark:bg-white/10 text-indigo-600 dark:text-slate-200" },
  device: { Icon: ToggleRight, chip: "bg-sky-500/15 dark:bg-white/10 text-sky-600 dark:text-slate-300" },
  room: { Icon: Home, chip: "bg-violet-500/15 dark:bg-white/10 text-violet-600 dark:text-slate-200" },
  clock: { Icon: Clock, chip: "bg-amber-500/15 dark:bg-white/10 text-amber-600 dark:text-slate-300" },
  trend: { Icon: TrendingUp, chip: "bg-cyan-500/15 dark:bg-white/10 text-cyan-600 dark:text-slate-200" },
  forecast: { Icon: Telescope, chip: "bg-blue-500/15 dark:bg-white/10 text-blue-600 dark:text-slate-200" },
  good: { Icon: ThumbsUp, chip: "bg-emerald-500/15 dark:bg-white/10 text-emerald-600 dark:text-slate-300" },
  bad: { Icon: ThumbsDown, chip: "bg-rose-500/15 dark:bg-white/10 text-rose-600 dark:text-slate-200" },
  alert: { Icon: AlertTriangle, chip: "bg-rose-500/15 dark:bg-white/10 text-rose-600 dark:text-slate-200" },
  suggestion: { Icon: Lightbulb, chip: "bg-indigo-500/15 dark:bg-white/10 text-indigo-600 dark:text-slate-200" },
  routine: { Icon: Wand2, chip: "bg-fuchsia-500/15 dark:bg-white/10 text-fuchsia-600 dark:text-slate-200" },
  energy: { Icon: Leaf, chip: "bg-emerald-500/15 dark:bg-white/10 text-emerald-600 dark:text-slate-300" },
  info: { Icon: Info, chip: "bg-slate-500/15 dark:bg-white/10 text-slate-600 dark:text-slate-300" },
};

interface InsightsResult {
  key: string;
  days: number;
  date: string;
  model: string;
  generatedAt: number;
  text: string;
  logLines: number;
  report?: InsightReport;
}

interface InsightMeta {
  key: string;
  days: number;
  date: string;
  generatedAt: number;
  model: string;
  logLines: number;
  headline: string;
}

function fmtDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Minimal markdown rendering (headings, bullets, bold) ────────────────────
function inline(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(
        <ul key={out.length} className="my-2 ml-1 space-y-1.5">
          {list.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-500" />
              <span>{inline(t, i)}</span>
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      flush();
      out.push(
        <h4 key={out.length} className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {line.replace(/^#+\s/, "")}
        </h4>,
      );
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      out.push(
        <p key={out.length} className="my-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {inline(line, 0)}
        </p>,
      );
    }
  }
  flush();
  return out;
}

function Report({ report }: { report: InsightReport }) {
  return (
    <div className="space-y-5">
      {report.headline && (
        <p className="text-[15px] font-medium leading-relaxed text-slate-800 dark:text-slate-200">
          {report.headline}
        </p>
      )}
      {report.sections.map((s, i) => {
        const { Icon, chip } = SECTION_ICONS[s.icon] ?? SECTION_ICONS.info;
        return (
          <div key={i}>
            <div className="mb-2 flex items-center gap-2.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${chip}`}>
                <Icon size={16} />
              </span>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.title}</h4>
            </div>
            <ul className="ml-1 space-y-1.5">
              {s.bullets.map((b, j) => (
                <li key={j} className="flex gap-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500/70 dark:bg-white/40" />
                  <span>{inline(b, j)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// Actionable routine suggestions with a one-click "Create routine" (admin).
function RecommendedRoutines({
  routines,
  isAdmin,
}: {
  routines: RecommendedRoutine[];
  isAdmin: boolean;
}) {
  const [state, setState] = useState<Record<number, "busy" | "done" | string>>({});

  async function create(i: number, r: RecommendedRoutine) {
    setState((s) => ({ ...s, [i]: "busy" }));
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: r.name,
          actions: r.actions.map((a) => ({
            deviceId: a.deviceId,
            code: a.code,
            value: a.value,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to create");
      setState((s) => ({ ...s, [i]: "done" }));
    } catch (e) {
      setState((s) => ({ ...s, [i]: (e as Error).message }));
    }
  }

  return (
    <div className="mt-6 border-t border-white/50 pt-5 dark:border-white/10">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-600 dark:bg-white/10 dark:text-slate-200">
          <Wand2 size={16} />
        </span>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Recommended Routines
        </h4>
      </div>
      <div className="space-y-3">
        {routines.map((r, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/60 bg-white/45 p-4 dark:border-white/10 dark:bg-white/[0.05]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {r.name}
                </p>
                {r.description && (
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    {r.description}
                  </p>
                )}
              </div>
              {isAdmin &&
                (state[i] === "done" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-600 dark:text-slate-200">
                    <Check size={15} /> Created
                  </span>
                ) : (
                  <button
                    onClick={() => create(i, r)}
                    disabled={state[i] === "busy"}
                    className="btn-primary shrink-0"
                  >
                    {state[i] === "busy" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    Create routine
                  </button>
                ))}
            </div>
            <ul className="mt-2.5 space-y-1">
              {r.actions.map((a, j) => (
                <li
                  key={j}
                  className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {a.deviceName}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {a.controlName}
                  </span>
                  <ArrowRight size={11} className="shrink-0 text-slate-300 dark:text-slate-600" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {a.valueLabel}
                  </span>
                </li>
              ))}
            </ul>
            {typeof state[i] === "string" &&
              state[i] !== "done" &&
              state[i] !== "busy" && (
                <p className="mt-2 text-sm text-red-500">{state[i]}</p>
              )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Insights({ isAdmin }: { isAdmin: boolean }) {
  const [days, setDays] = useState(7);
  const [analyses, setAnalyses] = useState<InsightMeta[]>([]);
  const [today, setToday] = useState("");
  const [current, setCurrent] = useState<InsightsResult | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false); // generating
  const [viewing, setViewing] = useState(false); // fetching a cached one
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    const res = await fetch("/api/insights");
    if (!res.ok) return null;
    const data = await res.json();
    setHasKey(data.hasKey);
    setAvailable(data.available);
    setToday(data.today);
    setAnalyses(data.analyses ?? []);
    return data as { today: string; analyses: InsightMeta[] };
  }, []);

  const view = useCallback(async (key: string) => {
    setViewing(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/${key}`);
      if (!res.ok) throw new Error("Could not load that analysis");
      const data: InsightsResult = await res.json();
      setCurrent(data);
      setDays(data.days);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setViewing(false);
    }
  }, []);

  // On mount: load the list, then show the most recent analysis if any.
  useEffect(() => {
    (async () => {
      const data = await fetchList();
      if (data?.analyses?.length) view(data.analyses[0].key);
    })();
  }, [fetchList, view]);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setCurrent(data);
      setHasKey(true);
      fetchList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onDaysChange(d: number) {
    setDays(d);
    const match = analyses.find((a) => a.days === d && a.date === today);
    if (match) view(match.key);
    else setCurrent(null);
  }

  // Is there a fresh (today's) analysis for the selected timeframe?
  const freshForSelected = analyses.some(
    (a) => a.days === days && a.date === today,
  );
  const showingFresh = current && current.days === days && current.date === today;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      {available === false ? (
        <div className="card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 dark:bg-white/10 text-brand-600 dark:text-slate-200">
            <KeyRound size={26} />
          </div>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {!isAdmin
              ? "No insights yet"
              : hasKey
                ? "AI features are turned off"
                : "Add an OpenRouter API key"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {!isAdmin
              ? "AI features are off. Ask an admin to enable them, then insights will show up here."
              : hasKey
                ? "Insights, Assistant and routine suggestions are disabled. Turn them back on in Settings → AI features."
                : "Insights uses an LLM (via OpenRouter) to analyze your action logs. Add your key in Settings → AI features to get started."}
          </p>
          {isAdmin && (
            <Link href="/settings" className="btn-primary mx-auto mt-5">
              <KeyRound size={16} />
              Open settings
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* New analysis controls */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500 dark:text-slate-400">
                {isAdmin ? "Analyze the last" : "Show the last"}
              </label>
              <select
                value={days}
                onChange={(e) => onDaysChange(Number(e.target.value))}
                className="rounded-xl border border-white/60 dark:border-white/10 bg-white/55 dark:bg-white/[0.07] px-3 py-2 text-sm font-medium text-slate-900 dark:text-slate-100 outline-none backdrop-blur-md focus:border-brand-500"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
            {isAdmin && (
              <button onClick={analyze} disabled={loading} className="btn-primary">
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : freshForSelected ? (
                  <RefreshCw size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                {loading
                  ? "Analyzing…"
                  : freshForSelected
                    ? "Reanalyze"
                    : "Analyze"}
              </button>
            )}
          </div>

          {/* Previously analyzed timeframes */}
          {analyses.length > 0 && (
            <div className="mb-4 px-1">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Analyzed timeframes
              </p>
              <div className="flex flex-wrap gap-2">
                {analyses.map((a) => {
                  const active = current?.key === a.key;
                  const fresh = a.date === today;
                  return (
                    <button
                      key={a.key}
                      onClick={() => view(a.key)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-brand-500/40 dark:border-white/25 bg-brand-500/10 dark:bg-white/10 text-brand-700 dark:text-white"
                          : "border-white/60 dark:border-white/10 bg-white/45 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:bg-white/70"
                      }`}
                      title={`Generated ${fmtDate(a.date)}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${fresh ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      Last {a.days}d · {fmtDate(a.date)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="card p-6">
            {loading || viewing ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400 dark:text-slate-500">
                <Loader2 size={18} className="animate-spin" />
                {loading
                  ? `Analyzing ${days} day${days === 1 ? "" : "s"} of activity…`
                  : "Loading…"}
              </div>
            ) : current ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1 font-medium text-brand-600 dark:text-slate-200">
                    <Sparkles size={12} /> Insights
                  </span>
                  <span>· last {current.days} days</span>
                  <span>· {current.logLines} log lines</span>
                  <span>· {current.model}</span>
                  <span>· generated {fmtDate(current.date)}</span>
                  {current.date !== today && (
                    <span className="rounded-full bg-amber-100 dark:bg-white/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-slate-200">
                      window has shifted — reanalyze for today
                    </span>
                  )}
                </div>
                {current.report ? (
                  <Report report={current.report} />
                ) : (
                  <div>{renderMarkdown(current.text)}</div>
                )}
                {current.report?.recommendedRoutines &&
                  current.report.recommendedRoutines.length > 0 && (
                    <RecommendedRoutines
                      routines={current.report.recommendedRoutines}
                      isAdmin={isAdmin}
                    />
                  )}
              </>
            ) : (
              <div className="py-16 text-center">
                <Sparkles size={26} className="mx-auto mb-3 text-brand-500 dark:text-slate-200" />
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  No analysis for the last {days} day{days === 1 ? "" : "s"} today
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  {isAdmin ? (
                    <>
                      Click <span className="font-medium text-slate-700 dark:text-slate-200">Analyze</span>{" "}
                      to generate it, or pick an earlier one above.
                    </>
                  ) : (
                    <>
                      Ask an admin to generate it, or pick an earlier one above.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
