# Realtime Voice (OpenAI gpt-realtime) — design spec

Date: 2026-09-16
Status: approved (design), implementing

## Problem

The current voice mode is a clunky pipeline: record audio → OpenRouter STT
(`/api/voice/transcribe`) → OpenRouter chat (`/api/ai/chat`) → auto-run actions →
OpenRouter TTS (`/api/voice/speak`) → play. It's slow, turn-based, and "sucks".

Replace it with a **hands-free, speech-to-speech** conversation powered by
OpenAI's **`gpt-realtime`** over WebRTC, where the model calls **tools** to
control the house. It must **never actuate protected switches**.

## Decisions (from the user)

| Decision | Choice |
|---|---|
| Key & model | Stored in Settings (server-side), like the OpenRouter key; browser gets a short-lived ephemeral token. Model + voice configurable. |
| Interaction | Hands-free continuous conversation (tap connect → talk → tap end). |
| Command engine | The Realtime model maps devices itself via granular tools it calls directly (OpenAI-only for voice). |
| Confirmation | Auto-execute and narrate the result. Protected switches always skipped. |

## Non-goals

- No change to the other AI features (chat, insights) — they stay on OpenRouter.
- Voice stays **Sleek-only** (the Voice section). No Classic voice.
- No change to how routines/automations are authored or run beyond calling the
  existing run-routine endpoint.

## External API (verified 2026-09)

- Model: `gpt-realtime` (GA).
- Ephemeral secret: `POST https://api.openai.com/v1/realtime/client_secrets`
  with `Authorization: Bearer <apiKey>`, body `{ session: { type: "realtime",
  model, instructions, audio: { output: { voice }, input: { transcription, turn_detection } }, tools, tool_choice } }`.
  Returns a short-lived client secret (default ~600s; we request a short TTL).
- Browser WebRTC SDP exchange: `POST https://api.openai.com/v1/realtime/calls`
  (optionally `?model=`), `Authorization: Bearer <ephemeral>`,
  `Content-Type: application/sdp`, body = SDP offer, response = SDP answer.
- Data channel: `oai-events`. Function calls arrive as realtime events
  (`response.function_call_arguments.done` / `response.output_item.done` with a
  `function_call` item); the client replies with a `conversation.item.create` of
  type `function_call_output` then `response.create`.
  (Exact event field names to be pinned against the events reference during
  implementation.)

## Architecture

### Config (`lib/config.ts`)
New `AppConfig.openaiRealtime?: { apiKey: string; model?: string; voice?: string; enabled?: boolean }`.
Helpers mirroring the OpenRouter ones:
- `getOpenaiRealtime(): { apiKey, model, voice } | null` (null if no key or disabled)
- `isRealtimeVoiceEnabled(): boolean`
- `getRealtimeVoiceStatus(): { hasKey, enabled, available, model, voice }` (non-secret, for Settings)
- `setOpenaiRealtime({ apiKey?, model?, voice?, enabled? })`
Defaults: model `gpt-realtime`, voice `marin`. Preserve the field in `setPassword`'s
reconstruction (that function rebuilds config explicitly).

### Server endpoints (all `guard()` — any signed-in user; re-validate server-side)
- `POST /api/voice/session` — mint the ephemeral client secret via OpenAI using
  the stored key. Builds the session server-side:
  - `instructions`: a home-assistant persona + a compact **catalog** (room →
    device name/id → controllable codes with type/range) from `buildDeviceIndex()`,
    the **routine list** (id + name), and the **hard rule**: never actuate a
    protected control; lists the protected `deviceId:code`s; if asked, say it's
    protected. Also: keep replies short; you may call tools to act or read state.
  - `audio.output.voice`, server-VAD `turn_detection`, input-audio `transcription`.
  - `tools`: `set_controls`, `get_status`, `run_routine` (schemas below).
  Returns `{ clientSecret, model }`. 503 if voice not configured.
- `POST /api/voice/execute` `{ actions: [{deviceId, code, value}] }` — reuse
  `buildDeviceIndex` + `validateActions`; **skip protected controls for EVERYONE**
  (stricter than `/api/ai/execute`); skip locked rooms; execute via
  `setCommandLocal`; log `AI_COMMAND`; return `{ ok, failed, skippedProtected,
  skippedLocked, results }`. **This is the real protection boundary.**
- `POST /api/voice/status` `{ deviceIds: string[] }` — return current values per
  device (reuse the local status read path), so the model can answer "is X on?".
- Run-routine reuses the existing `POST /api/routines/[id]/run`.

### Tool schemas (given to the model)
- `set_controls({ actions: [{ deviceId, code, value }] })` — turn things on/off /
  set fan speed etc. `value` is boolean | string(enum) | number(integer).
- `get_status({ deviceIds?: string[] })` — read current state.
- `run_routine({ routineId })` — run a scene.

### Browser (`components/sleek/SleekVoice.tsx`, rewritten)
Hands-free session controller:
1. Connect: `getUserMedia({audio})`, `POST /api/voice/session`, create
   `RTCPeerConnection`, add mic track, create `oai-events` data channel, set an
   `ontrack` handler that plays the remote audio, create offer, `POST` SDP to
   `/v1/realtime/calls` with the ephemeral bearer, set remote answer.
2. Events: parse `oai-events` messages → maintain a live transcript (user via
   input-audio transcription, assistant via response text/audio-transcript
   deltas); on a function call, POST to the matching endpoint, then send
   `function_call_output` + `response.create`.
3. End: close the peer connection + data channel, stop mic tracks.
State machine: `idle → connecting → live(listening/speaking) → ended/error`.
Empty state when voice isn't configured. Barge-in + turn-taking are native.

### Settings (`components/Settings.tsx`)
New **Voice (Realtime)** admin card mirroring the AI-features card: enable
toggle, OpenAI key input (write-only; shows "key set"), optional model + voice,
Save → `PUT /api/voice/config` (admin) → `setOpenaiRealtime`. A GET returns the
non-secret status.

### Removals
Delete `app/api/voice/transcribe/route.ts` and `app/api/voice/speak/route.ts`
and their `VOICE_*` env usage. Remove the old pipeline from `SleekVoice`.

## Protection & security

- **Two layers.** (a) The model is instructed never to touch protected controls.
  (b) `/api/voice/execute` **refuses** to actuate any protected control for any
  role — the model/browser cannot override it. A misfire cannot flip a protected
  switch. Locked rooms are likewise skipped.
- The OpenAI key stays server-side; the browser holds only a ~60s ephemeral
  token. Cost runs on the user's OpenAI account.
- All tool endpoints re-validate actions against the catalog (never trust the
  model's arguments).

## Testing / verification

- Config round-trip: `PUT/GET /api/voice/config` (admin) persists key + settings;
  other config fields preserved.
- `/api/voice/session` returns a client secret with a real key (mock error path
  when unset → 503).
- `/api/voice/execute`: a protected control in the payload is skipped
  (`skippedProtected`), a normal control executes, a locked room is skipped.
- `tsc` + `npm run build` clean after each phase.
- Browser: load the Voice screen, connect, and — with the real key — hold a live
  conversation ("turn off the …", "is the … on?"). If the live audio path can't
  be driven headlessly, verify up to the WebRTC handshake + tool round-trip and
  do the final talk-test manually.

## Phasing

1. **Config** — `lib/config.ts` fields/helpers; store the key.
2. **Server** — `/api/voice/session`, `/api/voice/execute`, `/api/voice/status`,
   `/api/voice/config`.
3. **Settings UI** — Voice (Realtime) card.
4. **SleekVoice rewrite** — WebRTC + tools + transcript + hands-free UI.
5. **Cleanup** — delete `transcribe`/`speak`; update docs (CLAUDE.md §8, §12).
