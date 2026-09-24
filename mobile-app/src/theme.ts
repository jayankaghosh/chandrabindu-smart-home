import { useColorScheme } from "react-native";

// A small token set mirroring the web Sleek theme: a slate/indigo base with a
// brand accent, plus explicit light + dark palettes. Colour communicates state.
export interface Palette {
  dark: boolean;
  bg: string;
  card: string;
  cardOff: string;
  text: string;
  textDim: string;
  border: string;
  brand: string;
  brandText: string;
  tileOnFrom: string;
  tileOnTo: string;
  danger: string;
  overlay: string;
}

const light: Palette = {
  dark: false,
  bg: "#eef2f7",
  card: "#ffffff",
  cardOff: "rgba(255,255,255,0.7)",
  text: "#0f172a",
  textDim: "#64748b",
  border: "rgba(15,23,42,0.08)",
  brand: "#6366f1",
  brandText: "#ffffff",
  tileOnFrom: "#7c6cf6",
  tileOnTo: "#9d8bff",
  danger: "#ef4444",
  overlay: "rgba(148,163,184,0.5)",
};

const dark: Palette = {
  dark: true,
  bg: "#0b1220",
  card: "#ffffff",
  cardOff: "rgba(255,255,255,0.06)",
  text: "#f1f5f9",
  textDim: "#94a3b8",
  border: "rgba(255,255,255,0.10)",
  brand: "#818cf8",
  brandText: "#0f172a",
  tileOnFrom: "#7c6cf6",
  tileOnTo: "#9d8bff",
  danger: "#f87171",
  overlay: "rgba(15,23,42,0.55)",
};

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}
