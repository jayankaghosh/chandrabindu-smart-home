import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAutomations } from "../queries";
import { Loading, ErrorView } from "../components/ui";
import { usePalette } from "../theme";

export default function AutomationsScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const automations = useAutomations();

  if (automations.isLoading) return <Loading />;
  if (automations.error) return <ErrorView message={(automations.error as Error).message} onRetry={() => automations.refetch()} />;

  return (
    <FlatList
      data={automations.data ?? []}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}
      ListEmptyComponent={<Text style={{ color: p.textDim, textAlign: "center", marginTop: 40 }}>No automations.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: p.cardOff, borderColor: p.border }]}>
          <View style={styles.head}>
            <Text style={[styles.name, { color: p.text }]}>{item.name}</Text>
            <View style={[styles.pill, { backgroundColor: item.enabled ? "#22c55e" : p.textDim }]}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{item.enabled ? "On" : "Off"}</Text>
            </View>
          </View>
          <Text style={{ color: p.textDim, fontSize: 13 }}>
            If {item.match === "all" ? "all" : "any"} of {item.conditions.length} condition
            {item.conditions.length === 1 ? "" : "s"} → {item.actions.length} action{item.actions.length === 1 ? "" : "s"}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 6 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { fontSize: 16, fontWeight: "700" },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
});
