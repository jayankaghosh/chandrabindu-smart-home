// Shared Framer Motion variants for the Sleek theme.
import type { Variants, Transition } from "framer-motion";

// Screen slide: pushes slide in from the right, back pops from the left.
export const screenVariants: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -48 : 48, opacity: 0 }),
};

export const screenTransition: Transition = { type: "spring", stiffness: 400, damping: 36 };

// Staggered entrance for a grid of tiles.
export const gridContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035 } },
};
export const gridItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 30 } },
};
