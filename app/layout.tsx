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
  maximumScale: 1,
  userScalable: false,
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
        {/* Disable pinch-zoom / double-tap-zoom (iOS Safari ignores the viewport
            user-scalable flag, so block the gesture + multi-touch events too). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('gesturestart',function(e){e.preventDefault()},{passive:false});document.addEventListener('gesturechange',function(e){e.preventDefault()},{passive:false});document.addEventListener('touchmove',function(e){if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});var _lt=0;document.addEventListener('touchend',function(e){var n=Date.now();if(n-_lt<=300)e.preventDefault();_lt=n},{passive:false});`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
