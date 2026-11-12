"use client";

import { useEffect, useState } from "react";

/** Live viewport size (0 x 0 until mounted, to stay SSR-safe). */
export function useViewport() {
  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const read = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return vp;
}
