import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Play, Sparkles } from "lucide-react-native";
import { useRoutines, useRunRoutine } from "../queries";
import { Loading, ErrorView } from "../components/ui";
import { usePalette } from "../theme";

export default function RoutinesScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const routines = useRoutines();
  const run = useRunRoutine();
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);

  if (routines.isLoading) return <Loading />;
  if (routines.error) return <ErrorView message={(routines.error as Error).message} onRetry={() => routines.refetch()} />;

  async function trigger(id: string) {
    setRunning(id);
    setDone(null);
    try {
      const res = await run.mutateAsync(id);
      setDone({ id, text: `${res.ok} run${res.ok === 1 ? "" : ""}${res.failed ? `, ${res.failed} failed` : ""}` });
    } catch {
      setDone({ id, text: "Failed to run" });
    } finally {
      setRunning(null);
      setTimeout(() => setDone(null), 2500);
    }
  }

  return (
    <FlatList
      data={routines.data ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 12, paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={<Text style={[styles.h1, { color: p.text }]}>Routines</Text>}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Sparkles size={38} color={p.textDim} />
          <Text style={{ color: p.textDim, marginTop: 12 }}>No routines yet.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => trigger(item.id)}
          disabled={running === item.id}
          style={[styles.card, { backgroundColor: p.cardOff, borderColor: p.border }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: p.text }]}>{item.name}</Text>
            <Text style={{ color: p.textDim, fontSize: 13 }}>
              {done?.id === item.id ? done.text : `${item.actions.length} action${item.actions.length === 1 ? "" : "s"}`}
            </Text>
          </View>
          <View style={[styles.playBtn, { backgroundColor: p.brand }]}>
            {running === item.id ? <ActivityIndicator color={p.brandText} /> : <Play size={18} color={p.brandText} fill={p.brandText} />}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "800", marginBottom: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, padding: 16 },
  name: { fontSize: 16, fontWeight: "700" },
  playBtn: { height: 46, width: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingVertical: 60 },
});
