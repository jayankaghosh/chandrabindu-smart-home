// Framer Motion variants for the Nebula theme.
import type { Transition, Variants } from "framer-motion";

// Screen change as depth: pushing flies forward into the scene (the old
// screen swells and blurs past you, the new one arrives from the distance);
// back reverses it.
export const depthVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, scale: dir >= 0 ? 0.9 : 1.08, filter: "blur(14px)", y: dir >= 0 ? 24 : -12 }),
  center: { opacity: 1, scale: 1, filter: "blur(0px)", y: 0 },
  exit: (dir: number) => ({ opacity: 0, scale: dir >= 0 ? 1.08 : 0.92, filter: "blur(14px)", y: dir >= 0 ? -12 : 24 }),
};
export const depthTransition: Transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] };

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.94, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 260, damping: 24 } },
};
