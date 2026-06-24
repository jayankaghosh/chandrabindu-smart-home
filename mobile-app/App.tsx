// Chandrabindu — Android WebView wrapper.
//
// Flow:
//   1. On launch (and on Retry), fetch BASE_URL/api/metadata.
//   2. If it doesn't load, or the reported `name` isn't EXPECTED_NAME, show an
//      error telling the user to get on the home network.
//   3. Otherwise load the full website (BASE_URL) inside a WebView.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { BASE_URL, EXPECTED_NAME, METADATA_URL } from "./config";

type Phase = "checking" | "ready" | "error";

const COLORS = {
  bg: "#0b0e16",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  brand: "#6366f1",
  text: "#e7e7ea",
  muted: "#94a3b8",
  danger: "#fb7185",
};

export default function App() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string>("");
  const webRef = useRef<WebView>(null);
  const canGoBack = useRef(false);

  // Verify we're talking to a real Chandrabindu hub before loading the site.
  const check = useCallback(async () => {
    setPhase("checking");
    setMessage("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(METADATA_URL, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.name !== EXPECTED_NAME) {
        setMessage(
          "That address answered, but it doesn't look like your Chandrabindu hub. Check the server address.",
        );
        setPhase("error");
        return;
      }
      setPhase("ready");
    } catch {
      setMessage(
        "Oops — can't find your home server. Make sure you're connected to your home Wi-Fi network and the hub is on.",
      );
      setPhase("error");
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // Android hardware back navigates within the WebView when possible.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "ready" && canGoBack.current) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [phase]);

  const onNavChange = (nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {phase === "checking" ? (
        <Centered>
          <ActivityIndicator color={COLORS.brand} size="large" />
          <Text style={styles.muted}>Connecting to your home hub…</Text>
        </Centered>
      ) : phase === "error" ? (
        <Centered>
          <View style={styles.card}>
            <Text style={styles.emoji}>📡</Text>
            <Text style={styles.title}>Can&apos;t reach your hub</Text>
            <Text style={styles.body}>{message}</Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
              onPress={check}
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
            <Text style={styles.faint}>{BASE_URL}</Text>
          </View>
        </Centered>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: BASE_URL }}
          style={styles.web}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          // Allow the plain-HTTP LAN site to load all its resources.
          mixedContentMode="always"
          pullToRefreshEnabled
          startInLoadingState
          renderLoading={() => (
            <Centered>
              <ActivityIndicator color={COLORS.brand} size="large" />
            </Centered>
          )}
          onNavigationStateChange={onNavChange}
          // If the main page fails to load (e.g. hub went offline), fall back
          // to the error screen rather than showing a blank WebView.
          onError={(e) => {
            if (e.nativeEvent?.url?.startsWith(BASE_URL)) {
              setMessage(
                "Lost connection to your hub. Make sure you're on the home network and try again.",
              );
              setPhase("error");
            }
          }}
        />
      )}
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0,
  },
  web: { flex: 1, backgroundColor: COLORS.bg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 14,
    backgroundColor: COLORS.bg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 12,
    padding: 24,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  emoji: { fontSize: 40 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  body: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  muted: { color: COLORS.muted, fontSize: 14 },
  faint: { color: "#64748b", fontSize: 12, marginTop: 4 },
  button: {
    marginTop: 6,
    alignSelf: "stretch",
    backgroundColor: COLORS.brand,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
