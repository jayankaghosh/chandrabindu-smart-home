import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { usePalette } from "../theme";

export function Screen({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <View style={{ flex: 1, backgroundColor: p.bg }}>{children}</View>;
}

export function Loading({ label }: { label?: string }) {
  const p = usePalette();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={p.brand} />
      {label ? <Text style={{ color: p.textDim, marginTop: 10 }}>{label}</Text> : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const p = usePalette();
  return (
    <View style={styles.center}>
      <Text style={{ color: p.danger, textAlign: "center", marginBottom: 12 }}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={[styles.btn, { backgroundColor: p.brand }]}>
          <Text style={{ color: p.brandText, fontWeight: "600" }}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Badge({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: p.dark ? "#fff" : "#0f172a" }]}>
      <Text style={{ color: p.dark ? "#0f172a" : "#fff", fontSize: 11, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  btn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  badge: { minWidth: 22, paddingHorizontal: 7, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
