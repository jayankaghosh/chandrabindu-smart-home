import React, { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mic, PhoneOff } from "lucide-react-native";
import { useRealtimeVoice } from "../voice/useRealtimeVoice";
import { useVoiceAvailable } from "../queries";
import { usePalette } from "../theme";

export default function VoiceScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const available = useVoiceAvailable();
  const { state, error, messages, connect, end } = useRealtimeVoice();
  const scrollRef = useRef<ScrollView | null>(null);

  // End the session if the user navigates away / unmounts.
  useEffect(() => () => end(), [end]);
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const live = state === "live";
  const connecting = state === "connecting";

  const status =
    connecting ? "Connecting…" : live ? "Listening — just talk" : available.data === false ? "Voice isn't set up on the hub" : "Tap to start talking";

  return (
    <View style={{ flex: 1, backgroundColor: p.bg, paddingTop: insets.top + 12 }}>
      <Text style={[styles.h1, { color: p.text }]}>Voice</Text>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {messages.length === 0 ? (
          <Text style={{ color: p.textDim, textAlign: "center", marginTop: 40 }}>
            Ask me to turn things on or off, run a routine, or check what's on.
          </Text>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user"
                  ? { alignSelf: "flex-end", backgroundColor: p.brand }
                  : { alignSelf: "flex-start", backgroundColor: p.cardOff, borderColor: p.border, borderWidth: 1 },
              ]}
            >
              <Text style={{ color: m.role === "user" ? p.brandText : p.text }}>{m.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {error ? <Text style={{ color: p.danger, textAlign: "center", marginBottom: 8 }}>{error}</Text> : null}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={{ color: p.textDim, marginBottom: 14 }}>{status}</Text>
        {live ? (
          <Pressable onPress={() => end()} style={[styles.mic, { backgroundColor: p.danger }]}>
            <PhoneOff size={30} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={connect}
            disabled={connecting || available.data === false}
            style={[styles.mic, { backgroundColor: p.brand, opacity: connecting || available.data === false ? 0.6 : 1 }]}
          >
            <Mic size={30} color={p.brandText} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "800", paddingHorizontal: 16 },
  bubble: { maxWidth: "82%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  footer: { alignItems: "center", paddingTop: 8 },
  mic: { height: 78, width: 78, borderRadius: 39, alignItems: "center", justifyContent: "center" },
});
