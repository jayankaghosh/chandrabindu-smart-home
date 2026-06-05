// Insights: feed recent action logs to an LLM (via OpenRouter) and cache the
// result. Not real-time — generated on demand and reused for the same
// timeframe until re-analyzed.

import fs from "fs";
import path from "path";
import { OpenRouter } from "@openrouter/sdk";
import { getOpenRouter, DEFAULT_INSIGHTS_MODEL } from "./config";
import { getModel, listRoutinesEnriched } from "./store";
import { extractJson } from "./ai";
import { buildDeviceIndex, validateActions } from "./chat";
import type { InsightReport, RecommendedRoutine } from "./types";

const LOG_DIR = path.join(process.cwd(), "logs");
const DATA_DIR = path.join(process.cwd(), "data");
const INSIGHTS_DIR = path.join(DATA_DIR, "insights");
const MAX_CHARS = 120_000; // keep the prompt within the model's context

export const INSIGHT_DAY_OPTIONS = [1, 2, 3, 7, 14, 30, 60, 90];

export interface InsightsResult {
  /** Unique cache key: `${days}d_${date}` (date = the day it was generated). */
  key: string;
  days: number;
  /** Calendar date the analysis was generated (YYYY-MM-DD). */
  date: string;
  model: string;
  generatedAt: number;
  text: string;
  logLines: number;
  /** Structured report for rich rendering (falls back to `text` if absent). */
  report?: InsightReport;
}

/** Lightweight metadata for the "previously analyzed" list. */
export interface InsightMeta {
  key: string;
  days: number;
  date: string;
  generatedAt: number;
  model: string;
  logLines: number;
  headline: string;
}

const KEY_RE = /^\d+d_\d{4}-\d{2}-\d{2}$/;
function keyFor(days: number, date: string): string {
  return `${days}d_${date}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Concatenate the last `days` daily log files (oldest first). */
function readLogs(days: number): { text: string; lines: number } {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    try {
      const content = fs
        .readFileSync(path.join(LOG_DIR, `${dateStr(d)}.log`), "utf8")
        .trim();
      if (content) out.push(`# ${dateStr(d)}\n${content}`);
    } catch {
      /* no log for that day */
    }
  }
  out.reverse();
  let text = out.join("\n\n");
  const lines = text ? text.split("\n").length : 0;
  if (text.length > MAX_CHARS) {
    text = "…(older entries truncated)…\n" + text.slice(text.length - MAX_CHARS);
  }
  return { text, lines };
}

/** A compact description of the home so the model has structural context. */
async function buildDigest(): Promise<string> {
  const { rooms } = await getModel();
  const routines = await listRoutinesEnriched();
  const lines: string[] = [
    "Rooms, devices and their controls (use the exact deviceId and control code when proposing recommendedRoutines):",
  ];
  for (const r of rooms) {
    lines.push(`- ${r.name}:`);
    if (!r.devices.length) lines.push("    • (no devices)");
    for (const d of r.devices) {
      const controls = d.functions
        .map((f) => {
          if (f.type === "Enum" && f.range?.length)
            return `code "${f.code}" (${f.name}) Enum[${f.range.join("/")}]`;
          if (f.type === "Integer")
            return `code "${f.code}" (${f.name}) Integer[${f.min ?? 0}-${f.max ?? 100}]`;
          return `code "${f.code}" (${f.name}) Boolean`;
        })
        .join("; ");
      lines.push(`    • ${d.name} (deviceId: ${d.id}): ${controls || "(no controls)"}`);
    }
  }
  lines.push("", "Routines:");
  if (!routines.length) {
    lines.push("- (none defined yet)");
  } else {
    for (const rt of routines) {
      const acts = rt.actions
        .map(
          (a) =>
            `${a.deviceName} ${a.controlName}→${a.valueLabel}${a.delayMs ? ` (after ${a.delayMs}ms)` : ""}`,
        )
        .join("; ");
      lines.push(`- ${rt.name}: ${acts}`);
    }
  }
  return lines.join("\n");
}

export function today(): string {
  return dateStr(new Date());
}

/** Read a single cached analysis by key (key validated to avoid traversal). */
export function readInsight(key: string): InsightsResult | null {
  if (!KEY_RE.test(key)) return null;
  try {
    return JSON.parse(
      fs.readFileSync(path.join(INSIGHTS_DIR, `${key}.json`), "utf8"),
    ) as InsightsResult;
  } catch {
    return null;
  }
}

/** All cached analyses (metadata), newest first. */
export function listInsights(): InsightMeta[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(INSIGHTS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const metas: InsightMeta[] = [];
  for (const f of files) {
    try {
      const r = JSON.parse(
        fs.readFileSync(path.join(INSIGHTS_DIR, f), "utf8"),
      ) as InsightsResult;
      metas.push({
        key: r.key,
        days: r.days,
        date: r.date,
        generatedAt: r.generatedAt,
        model: r.model,
        logLines: r.logLines,
        headline: r.report?.headline ?? r.text.split("\n")[0] ?? "",
      });
    } catch {
      /* skip bad file */
    }
  }
  return metas.sort((a, b) => b.generatedAt - a.generatedAt);
}

function writeCache(r: InsightsResult) {
  fs.mkdirSync(INSIGHTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(INSIGHTS_DIR, `${r.key}.json`),
    JSON.stringify(r, null, 2),
    "utf8",
  );
}

const SYSTEM_PROMPT = `You are a smart-home analytics assistant. You receive (1) a digest of the home's current setup — its rooms, devices, the controls each device exposes, and the saved routines — and (2) an action log of a local home-automation dashboard (device on/off commands, fan speeds, routines run, syncs, scans, logins). Each log line is "DATE TIME  ACTION  {json}".

Use the home digest as context: reference real room/device/control names, point out devices or rooms that are rarely or never used, and make suggestions that use controls and routines that actually exist (or sensible new ones).

Analyze it and respond with ONLY a JSON object (no markdown, no code fences) in exactly this shape:
{
  "headline": "one concise sentence summarizing overall home activity",
  "sections": [
    {
      "icon": "<one of: activity, device, room, clock, trend, forecast, good, bad, alert, suggestion, routine, energy, info>",
      "title": "Short section title",
      "bullets": ["A short insight. Use **bold** for device names, room names, and key numbers.", "..."]
    }
  ],
  "recommendedRoutines": [
    {
      "name": "Good Night",
      "description": "one short sentence on when/why to use it",
      "actions": [ { "deviceId": "<id from the home setup>", "code": "<control code>", "value": <true|false | "enumValue" | number> } ]
    }
  ]
}

Create sections in exactly this order:
1. Activity Summary (icon "activity") — how busy, busiest day, totals.
2. Most-Used Devices & Rooms (icon "device") — also note rarely/never used ones.
3. Usage Patterns by Time of Day (icon "clock").
4. Trends (icon "trend") — how activity is changing across the period (rising/falling, shifting times, growing routine use).
5. Forecast (icon "forecast") — what to expect next: likely upcoming usage and any issues likely to recur.
6. What's Good (icon "good") — positives: reliable devices, healthy/efficient habits, well-used routines.
7. What's Bad (icon "bad") — problems: failed/unreachable commands and causes, wasteful or risky patterns.
8. Suggestions (icon "suggestion") — general improvements to the setup or usage.
9. Energy-Saving Tips (icon "energy").

For "recommendedRoutines": propose 0–4 genuinely useful routines that are NOT duplicates of the saved routines. Each action MUST use an exact deviceId and control code from the home setup, with a value matching the control type (Boolean true/false; Enum one of its listed values; Integer within range). Use an empty array if you have nothing strong to recommend.

Reference real device and room names. Keep each bullet to one short sentence. Output JSON only.`;

function parseReport(raw: string): InsightReport | undefined {
  let s = raw.trim();
  // strip ```json … ``` fences if the model added them
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // otherwise slice to the outermost braces
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const j = s.lastIndexOf("}");
    if (i >= 0 && j > i) s = s.slice(i, j + 1);
  }
  try {
    const obj = JSON.parse(s);
    if (obj && Array.isArray(obj.sections)) {
      return {
        headline: typeof obj.headline === "string" ? obj.headline : "",
        sections: obj.sections
          .filter((x: any) => x && typeof x.title === "string")
          .map((x: any) => ({
            icon: typeof x.icon === "string" ? x.icon : "info",
            title: x.title,
            bullets: Array.isArray(x.bullets)
              ? x.bullets.filter((b: any) => typeof b === "string")
              : [],
          })),
      };
    }
  } catch {
    /* not valid JSON → caller falls back to raw text */
  }
  return undefined;
}

export async function generateInsights(days: number): Promise<InsightsResult> {
  const cfg = getOpenRouter();
  if (!cfg) {
    throw new Error(
      "AI features are off. Add an OpenRouter key and enable them in Settings.",
    );
  }
  const model = cfg.model || DEFAULT_INSIGHTS_MODEL;
  const { text: logs, lines } = readLogs(days);

  let text: string;
  if (!logs) {
    text = `No actions were logged in the last ${days} day${days === 1 ? "" : "s"}. Control some devices or run a routine, then re-analyze.`;
  } else {
    const digest = await buildDigest();
    const client = new OpenRouter({ apiKey: cfg.apiKey });
    const chatRequest = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `=== HOME SETUP (context) ===\n${digest}\n\n=== ACTION LOG — last ${days} day(s) ===\n${logs}`,
        },
      ],
      stream: false,
      maxTokens: 1400,
      temperature: 0.4,
      responseFormat: { type: "json_object" },
    };

    let result: any;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await client.chat.send({ chatRequest } as any);
        break;
      } catch (err) {
        const e = err as any;
        const status: number | undefined = e?.statusCode;
        // Retry once for transient provider overload / rate limit.
        if (attempt < 1 && [429, 500, 502, 503].includes(status ?? 0)) {
          await new Promise((r) => setTimeout(r, 1800));
          continue;
        }
        // Surface the real reason from the OpenRouter error body.
        console.error("[insights] OpenRouter error", status, e?.body ?? e?.message);
        let detail = e?.message || "request failed";
        if (typeof e?.body === "string" && e.body) {
          try {
            const parsed = JSON.parse(e.body);
            detail = parsed?.error?.message || e.body;
            const raw = parsed?.error?.metadata?.raw;
            if (raw) detail += ` — ${typeof raw === "string" ? raw : JSON.stringify(raw)}`;
          } catch {
            detail = e.body;
          }
        }
        throw new Error(
          `OpenRouter${status ? ` (${status})` : ""}: ${detail}. The free model may be overloaded — try again, or pick another model in Settings.`,
        );
      }
    }

    let content = result?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      content = content.map((c: any) => c?.text ?? c?.content ?? "").join("");
    }
    text =
      typeof content === "string" && content.trim()
        ? content.trim()
        : "The model returned no text. Try again or pick a different model.";
  }

  const report = logs ? parseReport(text) : undefined;
  // Validate any recommendedRoutines against the catalog so the UI can offer a
  // one-click "Create routine" with real, runnable actions.
  if (report) {
    const obj = extractJson(text);
    const rawRec = Array.isArray(obj?.recommendedRoutines)
      ? obj.recommendedRoutines
      : [];
    if (rawRec.length) {
      const index = await buildDeviceIndex();
      const recommended: RecommendedRoutine[] = rawRec
        .map((r: any) => {
          const actions = validateActions(
            Array.isArray(r?.actions) ? r.actions : [],
            index,
          ).map((a) => ({
            deviceId: a.deviceId,
            code: a.code,
            value: a.value,
            deviceName: a.deviceName,
            controlName: a.controlName,
            valueLabel: a.valueLabel,
          }));
          return {
            name:
              typeof r?.name === "string" && r.name.trim()
                ? r.name.trim()
                : "Suggested routine",
            description:
              typeof r?.description === "string" ? r.description.trim() : undefined,
            actions,
          };
        })
        .filter((r: RecommendedRoutine) => r.actions.length > 0);
      if (recommended.length) report.recommendedRoutines = recommended;
    }
  }
  const date = today();
  const out: InsightsResult = {
    key: keyFor(days, date),
    days,
    date,
    model,
    generatedAt: Date.now(),
    text,
    logLines: lines,
    report,
  };
  writeCache(out);
  return out;
}
