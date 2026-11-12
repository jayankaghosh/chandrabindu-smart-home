"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Power, PowerOff, Zap, X, Loader2 } from "lucide-react";
import { runMaster } from "../sleek/masterApi";
import { HUES, emitPulse, emitWarp, haptic, sfx } from "./fx";

// Master all-on / all-off as a reactor button (bottom-left on every screen).
// Same rules as Sleek's: both actions confirm, protected controls stay on,
// locked rooms are skipped (server-side). A run sends a house-wide shockwave.
export default function NebulaMasterControl({ onDone, raised = false }: { onDone: () => void; raised?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function run(on: boolean) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await runMaster(on));
      emitPulse(window.innerWidth / 2, window.innerHeight / 2, on ? HUES.light : HUES.white, 2.2);
      emitWarp(on ? 1 : -1);
      sfx("power");
      haptic(30);
      onDone();
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(null);
      setOpen(false);
      setTimeout(() => setResult(null), 3500);
    }
  }

  return (
    <>
      <div className={`fixed left-6 z-40 flex flex-col items-start gap-2 ${raised ? "bottom-[76px]" : "bottom-6"}`}>
        <AnimatePresence>
          {open && (
            <motion.div
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, staggerDirection: -1 } } }}
              className="flex flex-col gap-2"
            >
              {[
                { on: true, label: "All On", Icon: Power, cls: "from-amber-300 to-orange-500 text-slate-950 shadow-[0_0_30px_-6px_rgba(251,191,36,0.9)]" },
                { on: false, label: "All Off", Icon: PowerOff, cls: "from-slate-200 to-slate-400 text-slate-950 shadow-[0_0_30px_-8px_rgba(226,232,240,0.7)]" },
              ].map(({ on, label, Icon, cls }) => (
                <motion.button
                  key={label}
                  variants={{ hidden: { opacity: 0, x: -20, scale: 0.8 }, show: { opacity: 1, x: 0, scale: 1 } }}
                  onClick={() => {
                    sfx("nav");
                    setConfirm(on);
                  }}
                  className={`flex items-center gap-2 rounded-2xl bg-gradient-to-r px-4 py-3 font-semibold ${cls}`}
                >
                  <Icon size={18} /> {label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.06 }}
          onClick={() => {
            sfx(open ? "back" : "nav");
            setOpen((v) => !v);
          }}
          aria-label="Master on/off"
          className="nb-border relative flex h-14 w-14 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#67e8f9,#7c3aed_60%,#1e1b4b)] text-white shadow-[0_0_34px_-4px_rgba(124,58,237,0.9)]"
          style={{ ["--nb-hue" as string]: "103 232 249" }}
        >
          <span className="nb-breathe absolute inset-1 rounded-full bg-cyan-300/10" />
          <motion.span animate={{ rotate: open ? 90 : 0 }} className="relative z-[2]">
            {open ? <X size={22} /> : <Zap size={22} className="drop-shadow-[0_0_6px_#fff]" />}
          </motion.span>
        </motion.button>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10 }}
            className={`nb-mono fixed left-6 z-40 max-w-xs rounded-2xl border border-cyan-300/20 bg-[rgba(4,6,18,0.85)] px-4 py-2.5 text-xs uppercase text-cyan-100 shadow-[0_0_30px_-10px_rgba(34,211,238,0.8)] backdrop-blur ${raised ? "bottom-[148px]" : "bottom-24"}`}
          >
            {result}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirm !== null && (
          <motion.div
            className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgba(2,3,10,0.72)] p-6 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && setConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="card w-full max-w-sm p-6 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                  confirm ? "bg-amber-400/15 text-amber-300" : "bg-slate-400/15 text-slate-200"
                }`}
              >
                <span className={`nb-breathe absolute inset-0 rounded-full ${confirm ? "shadow-[0_0_40px_rgba(251,191,36,0.6)]" : "shadow-[0_0_30px_rgba(226,232,240,0.35)]"}`} />
                {confirm ? <Power size={28} /> : <PowerOff size={28} />}
              </div>
              <h2 className="mb-1 text-lg font-semibold text-slate-100">{confirm ? "Turn everything on?" : "Turn everything off?"}</h2>
              <p className="mb-5 text-sm text-slate-400">
                {confirm ? "Every switch in every unlocked room will turn on." : "Every switch will turn off. Protected controls stay on."}
              </p>
              <div className="flex justify-center gap-2">
                <button onClick={() => setConfirm(null)} disabled={busy} className="btn-ghost">
                  Cancel
                </button>
                <button onClick={() => run(confirm)} disabled={busy} className="btn-primary">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : confirm ? <Power size={15} /> : <PowerOff size={15} />}
                  {confirm ? "Turn all on" : "Turn all off"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
