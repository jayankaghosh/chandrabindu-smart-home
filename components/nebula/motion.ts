// Framer Motion variants for the Nebula theme.
import type { Variants } from "framer-motion";

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 26, scale: 0.94, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 260, damping: 24 } },
};
