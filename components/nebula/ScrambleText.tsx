"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./fx";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+<>/=";

// Text that decodes into place: each change scrambles the characters, then
// resolves them left to right. Screen readers get the real text.
export default function ScrambleText({ text, className, duration = 650 }: { text: string; className?: string; duration?: number }) {
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOut(text);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const fixed = Math.floor(p * text.length);
      let s = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) {
        s += text[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{out}</span>
    </span>
  );
}
