"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Loader2, Volume2, User, Bot, MicOff } from "lucide-react";

type VoiceState = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";
interface Turn {
  role: "user" | "assistant";
  content: string;
}

// Full-screen push-to-talk voice assistant (walkie-talkie): press & hold the mic
// to speak, release to send. Pipeline: record → OpenRouter STT → existing chat
// → auto-run any device actions → OpenRouter TTS played aloud. Pressing the mic
// again (even mid-reply) cancels the current speech and starts a new turn.
export default function SleekVoice() {
  const [state, setState] = useState<VoiceState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micReady, setMicReady] = useState<boolean | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const turnIdRef = useRef(0); // bumps on every new press; stale async is discarded
  const historyRef = useRef<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Acquire the mic once for the screen; release on leave.
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        streamRef.current = s;
        setMicReady(true);
      })
      .catch(() => setMicReady(false));
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, state]);

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }

  function pickMime(): string {
    const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const o of opts) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(o)) return o;
    return "";
  }

  function startRecording() {
    if (!streamRef.current) return;
    stopAudio(); // barge-in: cut off any current reply
    const myTurn = ++turnIdRef.current; // invalidate anything in flight
    setError(null);
    chunksRef.current = [];
    const mime = pickMime();
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      void process(blob, myTurn);
    };
    rec.start();
    recRef.current = rec;
    setState("recording");
  }

  function stopRecording() {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
  }

  const alive = (myTurn: number) => myTurn === turnIdRef.current;

  async function process(blob: Blob, myTurn: number) {
    try {
      if (blob.size < 800) {
        setState("idle");
        return; // too short to be speech
      }
      setState("transcribing");
      const b64 = await blobToBase64(blob);
      if (!alive(myTurn)) return;
      const fmt = /mp4|m4a/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
      const tr = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64, format: fmt }),
      });
      const trd = await tr.json().catch(() => ({}));
      if (!alive(myTurn)) return;
      if (!tr.ok || !trd.text) {
        setError(trd.error || "Didn't catch that — try again.");
        setState("idle");
        return;
      }
      const userText: string = trd.text;
      historyRef.current = [...historyRef.current, { role: "user", content: userText }];
      setTurns([...historyRef.current]);

      setState("thinking");
      const chat = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyRef.current.slice(-8) }),
      });
      const cd = await chat.json().catch(() => ({}));
      if (!alive(myTurn)) return;
      if (!chat.ok) {
        setError(cd.error || "The assistant failed to reply.");
        setState("idle");
        return;
      }
      const reply: string = cd.reply || "Done.";
      historyRef.current = [...historyRef.current, { role: "assistant", content: reply }];
      setTurns([...historyRef.current]);

      // Auto-run any device actions / routines the assistant proposed.
      await executeAll(cd.actions, cd.routines);
      if (!alive(myTurn)) return;

      // Speak the reply.
      setState("speaking");
      const sp = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply }),
      });
      if (!alive(myTurn)) return;
      if (!sp.ok) {
        setState("idle");
        return;
      }
      const buf = await sp.blob();
      if (!alive(myTurn)) return;
      const audio = new Audio(URL.createObjectURL(buf));
      audioRef.current = audio;
      audio.onended = () => {
        if (alive(myTurn)) setState("idle");
      };
      audio.play().catch(() => {
        if (alive(myTurn)) setState("idle");
      });
    } catch (e) {
      if (alive(myTurn)) {
        setError((e as Error).message);
        setState("idle");
      }
    }
  }

  async function executeAll(actions: any[], routines: any[]) {
    try {
      if (Array.isArray(actions) && actions.length) {
        await fetch("/api/ai/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: actions.map((a) => ({ deviceId: a.deviceId, code: a.code, value: a.value })),
          }),
        });
      }
      for (const r of Array.isArray(routines) ? routines : []) {
        await fetch(`/api/routines/${r.routineId}/run`, { method: "POST" });
      }
    } catch {
      /* best-effort; the spoken reply still plays */
    }
  }

  // Press-and-hold handlers.
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (micReady === false) return;
    startRecording();
  };
  const onUp = () => {
    if (state === "recording") stopRecording();
  };

  const busy = state === "transcribing" || state === "thinking";
  const statusText =
    micReady === false
      ? "Microphone blocked — allow mic access and reload."
      : state === "recording"
        ? "Listening… release to send"
        : state === "transcribing"
          ? "Transcribing…"
          : state === "thinking"
            ? "Thinking…"
            : state === "speaking"
              ? "Speaking… (hold to interrupt)"
              : turns.length
                ? "Hold to speak again"
                : "Hold the mic and speak";

  return (
    <div className="flex min-h-[68vh] flex-col">
      {/* Conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">
        {turns.length === 0 && (
          <div className="flex h-full min-h-[30vh] flex-col items-center justify-center text-center text-slate-500 dark:text-slate-400">
            <p className="max-w-xs text-base">
              Ask about your home or give a command — e.g. “turn off the bedroom lights”.
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex gap-2.5 ${t.role === "user" ? "flex-row-reverse" : ""}`}>
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                t.role === "user"
                  ? "bg-brand-500/15 text-brand-600 dark:bg-white/10 dark:text-slate-200"
                  : "bg-slate-200/70 text-slate-600 dark:bg-white/10 dark:text-slate-200"
              }`}
            >
              {t.role === "user" ? <User size={17} /> : <Bot size={17} />}
            </span>
            <div
              className={`max-w-[80%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
                t.role === "user"
                  ? "bg-brand-500 text-white dark:bg-white dark:text-slate-900"
                  : "card"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mb-2 text-center text-sm text-rose-500">{error}</p>}

      {/* Mic */}
      <div className="flex shrink-0 flex-col items-center gap-4 pt-2">
        <div className="relative flex h-44 w-44 items-center justify-center">
          {/* pulse rings */}
          <AnimatePresence>
            {(state === "recording" || state === "speaking") && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0.8, opacity: 0.5 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                    className={`absolute h-32 w-32 rounded-full ${
                      state === "recording" ? "bg-rose-500/30" : "bg-sky-500/30"
                    }`}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          <motion.button
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            onContextMenu={(e) => e.preventDefault()}
            disabled={micReady === false || busy}
            animate={{ scale: state === "recording" ? 1.08 : 1 }}
            whileTap={{ scale: 1.04 }}
            className={`relative z-10 flex h-32 w-32 select-none items-center justify-center rounded-full text-white shadow-2xl transition-colors disabled:opacity-60 ${
              micReady === false
                ? "bg-slate-400"
                : state === "recording"
                  ? "bg-gradient-to-br from-rose-500 to-red-600"
                  : state === "speaking"
                    ? "bg-gradient-to-br from-sky-500 to-cyan-600"
                    : "bg-gradient-to-br from-brand-500 to-brand-400 dark:from-white dark:to-white dark:text-slate-900"
            }`}
            style={{ WebkitTouchCallout: "none", touchAction: "none" }}
          >
            {busy ? (
              <Loader2 size={44} className="animate-spin" />
            ) : state === "speaking" ? (
              <Volume2 size={44} />
            ) : micReady === false ? (
              <MicOff size={44} />
            ) : (
              <Mic size={44} />
            )}
          </motion.button>
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{statusText}</p>
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = String(reader.result || "");
      resolve(s.slice(s.indexOf(",") + 1)); // strip data:...;base64,
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
