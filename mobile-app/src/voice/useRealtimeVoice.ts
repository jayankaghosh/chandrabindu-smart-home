import { useCallback, useRef, useState } from "react";
import { apiPost } from "../api";
import type { RealtimeSecret } from "../types";

// Load react-native-webrtc lazily, only when a voice session starts. It runs
// native-module code at import time, so importing it at the top would crash the
// WHOLE app on a binary that lacks the native module (Expo Go or a stale dev
// build). Loading it here means a missing module only disables voice.
function loadWebRTC() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("react-native-webrtc") as typeof import("react-native-webrtc");
}

const OPENAI_CALLS = "https://api.openai.com/v1/realtime/calls";

export type VoiceState = "idle" | "connecting" | "live";
export interface VoiceMessage {
  role: "user" | "assistant";
  text: string;
}

// A hands-free speech-to-speech session with OpenAI Realtime over WebRTC, ported
// from the web SleekVoice component. The hub mints a short-lived client secret
// (server holds the real OpenAI key); the model calls tools we forward to the
// hub's voice endpoints. Protection is enforced server-side in /api/voice/execute.
export function useRealtimeVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);

  const pcRef = useRef<any>(null);
  const dcRef = useRef<any>(null);
  const localRef = useRef<any>(null);

  // Idle / turn bookkeeping (see refreshIdle).
  const idleSec = useRef(10);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speaking = useRef(false);
  const userSpeaking = useRef(false);
  const activeResponse = useRef(false);
  const toolPromises = useRef<Promise<unknown>[]>([]);
  const toolHandled = useRef(false);
  const endRequested = useRef(false);
  const endAfterResponse = useRef(false);
  const asstText = useRef<Record<string, string>>({});

  const sendEvent = useCallback((ev: unknown) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(ev));
  }, []);

  const teardown = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.getSenders?.().forEach((s: any) => s.track && s.track.stop());
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      localRef.current?.getTracks?.().forEach((t: any) => t.stop());
    } catch {}
    dcRef.current = null;
    pcRef.current = null;
    localRef.current = null;
    speaking.current = false;
    userSpeaking.current = false;
    activeResponse.current = false;
    endRequested.current = false;
    endAfterResponse.current = false;
    toolPromises.current = [];
    toolHandled.current = false;
    asstText.current = {};
  }, []);

  const end = useCallback(
    (reason?: string) => {
      teardown();
      setState("idle");
      if (reason) setError(reason);
    },
    [teardown],
  );

  // Arm the idle auto-end, but only during true silence — paused while the
  // assistant is speaking, a response is generating, or the user is talking.
  const refreshIdle = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (!pcRef.current || idleSec.current <= 0) return;
    if (speaking.current || activeResponse.current || userSpeaking.current) return;
    idleTimer.current = setTimeout(() => end("Ended after a while with no activity."), idleSec.current * 1000);
  }, [end]);

  const addMessage = useCallback((role: "user" | "assistant", text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => [...prev, { role, text: t }]);
  }, []);

  const handleToolCall = useCallback(
    async (name: string, callId: string, argsRaw: string) => {
      let args: any = {};
      try {
        args = argsRaw ? JSON.parse(argsRaw) : {};
      } catch {}
      let output: unknown = { ok: true };
      try {
        if (name === "set_controls") output = await apiPost("/api/voice/execute", { actions: args.actions ?? [] });
        else if (name === "get_status") output = await apiPost("/api/voice/status", { deviceIds: args.deviceIds ?? [] });
        else if (name === "run_routine") output = await apiPost(`/api/routines/${args.routineId}/run`);
        else if (name === "remember")
          output = await apiPost("/api/voice/memory", { add: args.add, remove: args.remove, scope: args.scope });
      } catch (e: any) {
        output = { ok: false, error: e?.message ?? "Failed" };
      }
      sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
      });
    },
    [sendEvent],
  );

  const handleEvent = useCallback(
    (raw: string) => {
      let ev: any;
      try {
        ev = JSON.parse(raw);
      } catch {
        return;
      }
      const type: string = ev.type ?? "";

      // Activity bookkeeping
      if (type === "input_audio_buffer.speech_started") userSpeaking.current = true;
      else if (type === "input_audio_buffer.speech_stopped") userSpeaking.current = false;
      else if (type === "output_audio_buffer.started" || type === "response.output_audio.started")
        speaking.current = true;
      else if (type === "output_audio_buffer.stopped") {
        speaking.current = false;
        if (endRequested.current || endAfterResponse.current) setTimeout(() => end(), 300);
      } else if (type === "response.created") {
        activeResponse.current = true;
        toolHandled.current = false;
        toolPromises.current = [];
      } else if (type === "response.done") {
        activeResponse.current = false;
      }

      // Transcripts
      if (/input_audio_transcription.*(completed|done)$/.test(type)) {
        addMessage("user", ev.transcript || ev.text || "");
      } else if (/audio_transcript\.delta$/.test(type) || type === "response.output_text.delta") {
        const key = ev.response_id || ev.item_id || "cur";
        asstText.current[key] = (asstText.current[key] || "") + (ev.delta || "");
      } else if (/audio_transcript\.done$/.test(type) || type === "response.output_text.done") {
        const key = ev.response_id || ev.item_id || "cur";
        const text = ev.transcript || ev.text || asstText.current[key] || "";
        addMessage("assistant", text);
        delete asstText.current[key];
      }

      // Tool call
      if (type === "response.function_call_arguments.done") {
        const name: string = ev.name;
        const callId: string = ev.call_id;
        if (name === "end_conversation") {
          sendEvent({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ ok: true }) },
          });
          endRequested.current = true;
          setTimeout(() => end(), 4000); // fallback if the goodbye audio event never lands
        } else {
          toolHandled.current = true;
          toolPromises.current.push(handleToolCall(name, callId, ev.arguments));
        }
      }

      // After a turn, decide the follow-up
      if (type === "response.done") {
        if (toolHandled.current) {
          Promise.allSettled(toolPromises.current).then(() => {
            if (!activeResponse.current) sendEvent({ type: "response.create" });
          });
        } else if (idleSec.current <= 0) {
          endAfterResponse.current = true;
          setTimeout(() => {
            if (endAfterResponse.current) end();
          }, 3000);
        }
      }

      if (type === "error") setError(ev.error?.message || "Voice error");

      refreshIdle();
    },
    [addMessage, end, handleToolCall, refreshIdle, sendEvent],
  );

  const connect = useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    setMessages([]);
    setState("connecting");

    let webrtc: typeof import("react-native-webrtc");
    try {
      webrtc = loadWebRTC();
    } catch {
      setState("idle");
      setError("Voice needs a development build — it isn't available in Expo Go.");
      return;
    }
    const { mediaDevices, RTCPeerConnection, RTCSessionDescription } = webrtc;

    try {
      const mic = await mediaDevices.getUserMedia({ audio: true });
      localRef.current = mic;

      const sdata = await apiPost<RealtimeSecret>("/api/voice/session");
      idleSec.current = typeof sdata.idleTimeoutSec === "number" ? sdata.idleTimeoutSec : 10;

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      // Remote audio plays through the device automatically on react-native-webrtc.
      (pc as any).addEventListener?.("track", () => {});
      pc.addTrack(mic.getAudioTracks()[0], mic);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      (dc as any).addEventListener("message", (e: any) => handleEvent(e.data));

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      const res = await fetch(`${OPENAI_CALLS}?model=${encodeURIComponent(sdata.model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sdata.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!res.ok) throw new Error(`Realtime handshake failed (${res.status})`);
      const answer = await res.text();
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer }));

      setState("live");
      refreshIdle();
    } catch (e: any) {
      teardown();
      setState("idle");
      setError(e?.message ?? "Couldn't start voice");
    }
  }, [state, handleEvent, refreshIdle, teardown]);

  return { state, error, messages, connect, end };
}
