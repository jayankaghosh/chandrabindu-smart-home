"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";
import SleekApp from "./sleek/SleekApp";
import { readUiTheme, type UiTheme } from "./uiTheme";

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400 dark:text-slate-500">
      <Loader2 size={22} className="animate-spin" />
    </div>
  );
}

// Nebula (WebGL, heavy animation) is its own chunk, fetched only on devices that
// picked it, so Sleek and Classic never pay for it.
const NebulaApp = dynamic(() => import("./nebula/NebulaApp"), { ssr: false, loading: Spinner });

// Chooses the experience per device: the Classic dashboard, the Sleek guided
// theme or Nebula. Read from localStorage after mount (avoids an SSR mismatch);
// a brief spinner covers the one-frame gap.
export default function HomeRoot({
  role,
  username,
}: {
  role: "admin" | "user";
  username: string;
}) {
  const [theme, setTheme] = useState<UiTheme | null>(null);
  useEffect(() => {
    setTheme(readUiTheme());
  }, []);

  if (theme === null) return <Spinner />;
  if (theme === "nebula") return <NebulaApp role={role} username={username} />;

  return theme === "sleek" ? (
    <SleekApp role={role} username={username} />
  ) : (
    <Dashboard role={role} username={username} />
  );
}
