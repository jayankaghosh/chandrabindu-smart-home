"use client";

import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, Check } from "lucide-react";
import { readUiTheme, setUiTheme, type UiTheme } from "./uiTheme";

const OPTIONS: { key: UiTheme; title: string; desc: string; icon: any }[] = [
  { key: "classic", title: "Classic", desc: "The full dashboard — dense, with tabs and cards. Best on a computer.", icon: LayoutDashboard },
  { key: "sleek", title: "Sleek", desc: "Big, guided, touch-first buttons. Best for phones, tablets and wall panels.", icon: Sparkles },
];

export default function ThemeSelect() {
  const [theme, setTheme] = useState<UiTheme | null>(null);
  useEffect(() => setTheme(readUiTheme()), []);

  function choose(t: UiTheme) {
    setUiTheme(t);
    setTheme(t);
    // Apply immediately by re-entering the home experience.
    window.location.assign("/");
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        Choose how this device shows the app. Saved per device, so a wall tablet can use Sleek while your laptop stays Classic.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const active = theme === o.key;
          return (
            <button
              key={o.key}
              onClick={() => choose(o.key)}
              className={`relative flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
                active
                  ? "border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/40 dark:border-white/40 dark:bg-white/10"
                  : "border-white/60 bg-white/40 hover:bg-white/60 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
              }`}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white dark:bg-white dark:text-slate-900">
                  <Check size={14} />
                </span>
              )}
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-white dark:from-white dark:to-white dark:text-slate-900">
                <o.icon size={22} />
              </span>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{o.title}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{o.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
