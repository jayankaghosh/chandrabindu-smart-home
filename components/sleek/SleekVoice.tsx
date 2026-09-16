"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Loader2, PhoneOff, Volume2, MicOff, Sparkles } from "lucide-react";

// Hands-free voice assistant powered by OpenAI's Realtime (gpt-realtime) over
// WebRTC. Tap Connect → talk naturally (the model listens continuously, handles
// turn-taking and interruptions) → tap End. The model calls tools to control the
// house; every actuation is re-validated server-side and protected controls are
// never touched (see /api/voice/execute).

type State = "idle" | "connecting" | "live" | "error";
interface Turn {
  role: "user" | "assistant";
  content: string;
}

const OPENAI_CALLS = "https://api.openai.com/v1/realtime/calls";

export default function SleekVoice() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [state, setState] = useState<State>("idle");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Streaming transcript buffers keyed by item/response id.
  const asstBuf = useRef<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/voice/session")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => setAvailable(Boolean(d.available)))
      .catch(() => setAvailable(false));
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, state]);

  function pushTurn(role: "user" | "assistant", content: string) {
    setTurns((t) => [...t, { role, content }]);
  }
  function updateAssistant(id: string, delta: string) {
    asstBuf.current[id] = (asstBuf.current[id] || "") + delta;
    const text = asstBuf.current[id];
    setTurns((t) => {
      const last = t[t.length - 1];
      if (last && last.role === "assistant" && (last as any)._id === id) {
        const copy = t.slice(0, -1);
        return [...copy, { role: "assistant", content: text, _id: id } as any];
      }
      return [...t, { role: "assistant", content: text, _id: id } as any];
    });
  }

  function teardown() {
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
    } catch {}
    micRef.current?.getTracks().forEach((t) => t.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    pcRef.current = null;
    dcRef.current = null;
    micRef.current = null;
    asstBuf.current = {};
    setSpeaking(false);
  }

  async function connect() {
    setError(null);
    setState("connecting");
    try {
      // 1) Mic
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("Microphone blocked — allow mic access and try again.");
        setState("error");
        return;
      }
      micRef.current = mic;

      // 2) Ephemeral session token (server-configured session)
      const sres = await fetch("/api/voice/session", { method: "POST" });
      const sdata = await sres.json().catch(() => ({}));
      if (!sres.ok || !sdata.clientSecret) {
        teardown();
        setError(sdata.error || "Voice isn't set up.");
        setState("error");
        return;
      }

      // 3) WebRTC peer
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };
      pc.addTrack(mic.getAudioTracks()[0], mic);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => handleEvent(e.data);

      // 4) SDP offer/answer with OpenAI
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch(`${OPENAI_CALLS}?model=${encodeURIComponent(sdata.model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sdata.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!answer.ok) {
        teardown();
        setError("Couldn't connect to the voice service.");
        setState("error");
        return;
      }
      const answerSdp = await answer.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setState("live");
    } catch (e) {
      teardown();
      setError((e as Error).message);
      setState("error");
    }
  }

  function end() {
    teardown();
    setState("idle");
  }

  // ── Realtime event handling ────────────────────────────────────────────────
  function handleEvent(raw: string) {
    let ev: any;
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }
    const type: string = ev.type || "";

    // User speech transcript (final)
    if (type.includes("input_audio_transcription") && (type.endsWith(".completed") || type.endsWith(".done"))) {
      const text = ev.transcript || ev.text;
      if (text) pushTurn("user", text);
      return;
    }
    // Assistant spoken text — streamed (handle old + new event names)
    if (/audio_transcript\.delta$/.test(type) || type === "response.output_text.delta") {
      const id = ev.response_id || ev.item_id || "cur";
      if (typeof ev.delta === "string") updateAssistant(id, ev.delta);
      setSpeaking(true);
      return;
    }
    if (/audio_transcript\.done$/.test(type) || type === "response.output_text.done") {
      return;
    }
    if (type === "output_audio_buffer.started" || type === "response.output_audio.started") {
      setSpeaking(true);
      return;
    }
    if (type === "output_audio_buffer.stopped" || type === "response.done") {
      setSpeaking(false);
      return;
    }
    // Function/tool call
    if (type === "response.function_call_arguments.done") {
      void handleToolCall(ev.name, ev.call_id, ev.arguments);
      return;
    }
    if (type === "response.output_item.done" && ev.item?.type === "function_call") {
      void handleToolCall(ev.item.name, ev.item.call_id, ev.item.arguments);
      return;
    }
    if (type === "error") {
      setError(ev.error?.message || "Voice error");
    }
  }

  async function handleToolCall(name: string, callId: string, argsJson: string) {
    let args: any = {};
    try {
      args = JSON.parse(argsJson || "{}");
    } catch {}
    let output: any = { ok: false };
    try {
      if (name === "set_controls") {
        const res = await fetch("/api/voice/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actions: args.actions ?? [] }),
        });
        output = await res.json().catch(() => ({ ok: 0 }));
      } else if (name === "get_status") {
        const res = await fetch("/api/voice/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceIds: args.deviceIds ?? [] }),
        });
        output = await res.json().catch(() => ({ devices: [] }));
      } else if (name === "run_routine") {
        const res = await fetch(`/api/routines/${args.routineId}/run`, { method: "POST" });
        output = await res.json().catch(() => ({ ok: false }));
      } else if (name === "remember") {
        const res = await fetch("/api/voice/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ add: args.add, remove: args.remove, scope: args.scope }),
        });
        output = await res.json().catch(() => ({ ok: false }));
      } else {
        output = { error: "unknown tool" };
      }
    } catch (e) {
      output = { error: (e as Error).message };
    }
    // Return the result to the model, then ask it to continue speaking.
    sendEvent({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(output) },
    });
    sendEvent({ type: "response.create" });
  }

  function sendEvent(obj: unknown) {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(obj));
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  if (available === false) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-slate-500 dark:text-slate-400">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-200/70 dark:bg-white/10">
          <MicOff size={30} />
        </span>
        <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Voice isn't set up</p>
        <p className="max-w-xs text-sm">An admin can add an OpenAI key in Settings → Voice to enable hands-free voice control.</p>
      </div>
    );
  }

  const connecting = state === "connecting";
  const live = state === "live";
  const statusText = connecting
    ? "Connecting…"
    : live
      ? speaking
        ? "Speaking…"
        : "Listening… just talk"
      : state === "error"
        ? error || "Something went wrong"
        : "Tap connect and talk to your home";

  return (
    <div className="flex min-h-[68vh] flex-col">
      {/* Transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">
        {turns.length === 0 && (
          <div className="flex h-full min-h-[28vh] flex-col items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
            <Sparkles size={26} className="opacity-60" />
            <p className="max-w-xs text-base">
              Hands-free voice — try “turn off the bedroom lights” or “is the kitchen light on?”
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
                t.role === "user" ? "bg-brand-500 text-white dark:bg-white dark:text-slate-900" : "card"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
      </div>

      {error && live === false && state !== "error" && (
        <p className="mb-2 text-center text-sm text-rose-500">{error}</p>
      )}

      {/* Orb + control */}
      <div className="flex shrink-0 flex-col items-center gap-5 pt-2">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <AnimatePresence>
            {live && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                    className={`absolute h-32 w-32 rounded-full ${speaking ? "bg-sky-500/30" : "bg-emerald-500/30"}`}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          <motion.div
            animate={{ scale: live ? 1.05 : 1 }}
            className={`relative z-10 flex h-32 w-32 items-center justify-center rounded-full text-white shadow-2xl ${
              connecting
                ? "bg-slate-400"
                : live
                  ? speaking
                    ? "bg-gradient-to-br from-sky-500 to-cyan-600"
                    : "bg-gradient-to-br from-emerald-500 to-teal-600"
                  : "bg-gradient-to-br from-brand-500 to-brand-400 dark:from-white dark:to-white dark:text-slate-900"
            }`}
          >
            {connecting ? (
              <Loader2 size={44} className="animate-spin" />
            ) : live && speaking ? (
              <Volume2 size={44} />
            ) : (
              <Mic size={44} />
            )}
          </motion.div>
        </div>

        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{statusText}</p>

        {live ? (
          <button onClick={end} className="btn-ghost !px-6 text-rose-500">
            <PhoneOff size={16} />
            End
          </button>
        ) : (
          <button onClick={connect} disabled={connecting || available === null} className="btn-primary !px-8 !py-3.5 text-base">
            {connecting ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
            {connecting ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
