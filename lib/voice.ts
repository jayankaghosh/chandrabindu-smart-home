// Server-only helpers for the Realtime (speech-to-speech) voice mode.
//
// Builds the OpenAI Realtime session (persona + a compact device/routine catalog
// + the hard "never touch protected controls" rule + tool schemas), mints the
// short-lived ephemeral client secret the browser uses for its WebRTC handshake,
// and reads live device status for the model's get_status tool.
//
// The real protection boundary is NOT here — it is /api/voice/execute, which
// re-validates every action server-side and refuses protected controls. The
// instructions below are only the soft first layer.

import { getModel, getCatalogDevice, listRoutinesEnriched } from "./store";
import { listProtectedControls, getOpenaiRealtime } from "./config";
import { getStatusLocal } from "./local";

const OPENAI_BASE = "https://api.openai.com/v1";
const CONTROLLABLE = ["Boolean", "Enum", "Integer"];

/** A compact, model-readable catalog: rooms → devices (id) → controllable codes. */
async function buildCatalogText(): Promise<string> {
  const { rooms } = await getModel();
  const protectedSet = new Set(listProtectedControls().map((p) => `${p.deviceId}:${p.code}`));
  const lines: string[] = [];
  for (const room of rooms) {
    for (const d of room.devices) {
      if (d.bluetooth) continue; // can't control BLE over the LAN
      const controls = d.functions.filter((f) => CONTROLLABLE.includes(f.type));
      if (controls.length === 0) continue;
      const ctlText = controls
        .map((f) => {
          const prot = protectedSet.has(`${d.id}:${f.code}`) ? " [PROTECTED]" : "";
          let dom = f.type;
          if (f.type === "Enum" && f.range?.length) dom = `Enum(${f.range.join("/")})`;
          if (f.type === "Integer") dom = `Integer(${f.min ?? 0}-${f.max ?? 100})`;
          return `${f.code}="${f.name}" ${dom}${prot}`;
        })
        .join(", ");
      lines.push(`- Room "${room.name}" · device "${d.name}" id=${d.id} · controls: ${ctlText}`);
    }
  }
  return lines.join("\n");
}

async function buildRoutineText(): Promise<string> {
  const routines = await listRoutinesEnriched();
  if (!routines.length) return "(none)";
  return routines.map((r) => `- id=${r.id} "${r.name}" (${r.actions.length} actions)`).join("\n");
}

/** The natural-language contract + catalog the Realtime model runs under. */
async function buildInstructions(): Promise<string> {
  const [catalog, routines] = await Promise.all([buildCatalogText(), buildRoutineText()]);
  return `You are the voice assistant for a smart home called Chandrabindu. Speak naturally and keep replies short and friendly.

You can control the house and answer questions about it by calling tools:
- set_controls: turn devices on/off or set a value (fan speed, brightness). Boolean controls take true/false; Enum controls take one of their listed values; Integer controls take a number in range.
- get_status: read the current state of one or more devices before answering "is X on?" or reporting state.
- run_routine: run a saved scene by its id.

When the user gives an instruction (e.g. "turn off the bedroom lights", "set the fan to medium"), figure out which device(s) and control code(s) they mean from the catalog and call set_controls. Do it right away, then briefly say what you did. If a request is ambiguous, ask a short clarifying question instead of guessing.

HARD RULE — PROTECTED CONTROLS: never call set_controls for any control marked [PROTECTED]. Do not turn them on or off under any circumstance. If the user asks, tell them it's a protected control you can't change. (You may still report its state via get_status.)

Only act on controls that exist in the catalog. Never invent device ids or codes.

DEVICE CATALOG:
${catalog}

ROUTINES:
${routines}`;
}

/** Realtime function-tool schemas exposed to the model. */
function realtimeTools() {
  return [
    {
      type: "function",
      name: "set_controls",
      description:
        "Turn one or more device controls on/off or set their value. Never use for controls marked [PROTECTED].",
      parameters: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            description: "Controls to set.",
            items: {
              type: "object",
              properties: {
                deviceId: { type: "string", description: "Device id from the catalog." },
                code: { type: "string", description: "Control code, e.g. switch_1, fan_1." },
                value: {
                  description:
                    "true/false for a Boolean control, one of the listed strings for an Enum, or a number for an Integer.",
                },
              },
              required: ["deviceId", "code", "value"],
            },
          },
        },
        required: ["actions"],
      },
    },
    {
      type: "function",
      name: "get_status",
      description: "Read the current state (values) of one or more devices.",
      parameters: {
        type: "object",
        properties: {
          deviceIds: { type: "array", items: { type: "string" }, description: "Device ids to read." },
        },
        required: ["deviceIds"],
      },
    },
    {
      type: "function",
      name: "run_routine",
      description: "Run a saved routine/scene by its id.",
      parameters: {
        type: "object",
        properties: { routineId: { type: "string" } },
        required: ["routineId"],
      },
    },
  ];
}

export interface RealtimeSecret {
  clientSecret: string;
  model: string;
  expiresAt: number;
}

/**
 * Mint a short-lived ephemeral client secret with the session fully configured
 * server-side (instructions, tools, voice, VAD, transcription). Returns null-ish
 * by throwing when voice isn't configured or OpenAI rejects the request.
 */
export async function createRealtimeSecret(): Promise<RealtimeSecret> {
  const cfg = getOpenaiRealtime();
  if (!cfg) throw new Error("Voice is not configured");

  const instructions = await buildInstructions();
  const session = {
    type: "realtime",
    model: cfg.model,
    instructions,
    tools: realtimeTools(),
    tool_choice: "auto",
    audio: {
      input: {
        transcription: { model: "gpt-4o-mini-transcribe" },
        turn_detection: { type: "server_vad", create_response: true, interrupt_response: true },
      },
      output: { voice: cfg.voice },
    },
  };

  const res = await fetch(`${OPENAI_BASE}/realtime/client_secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session, expires_after: { anchor: "created_at", seconds: 120 } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `OpenAI error ${res.status}`;
    throw new Error(msg);
  }
  const clientSecret: string = data?.value;
  if (!clientSecret) throw new Error("No client secret returned");
  return { clientSecret, model: cfg.model, expiresAt: Number(data?.expires_at) || 0 };
}

/** Live status for the get_status tool: values per requested device. */
export async function readVoiceStatus(
  deviceIds: string[],
): Promise<{ deviceId: string; reachable: boolean; values: Record<string, unknown> }[]> {
  const out = [];
  for (const id of deviceIds.slice(0, 30)) {
    const meta = await getCatalogDevice(id);
    if (!meta) {
      out.push({ deviceId: id, reachable: false, values: {} });
      continue;
    }
    try {
      const status = await getStatusLocal(meta);
      const values: Record<string, unknown> = {};
      for (const s of status) values[s.code] = s.value;
      out.push({ deviceId: id, reachable: true, values });
    } catch {
      out.push({ deviceId: id, reachable: false, values: {} });
    }
  }
  return out;
}
