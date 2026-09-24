import type { Metadata, Viewport } from "next";
import "./globals.css";
import { startAutomationScheduler } from "@/lib/automationScheduler";

// RootLayout is a server component (Node runtime), so this is a safe place to
// boot the automation scheduler once per server process. The call is a no-op
// after the first invocation (global singleton) and never runs on the client.
if (typeof window === "undefined") {
  startAutomationScheduler();
}

export const metadata: Metadata = {
  title: "Smart Home",
  description: "Control your home",
};

export const viewport: Viewport = {
  themeColor: "#eceef3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}try{var u=localStorage.getItem('ui-theme');document.documentElement.dataset.ui=(u==='classic'?'classic':'sleek')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
