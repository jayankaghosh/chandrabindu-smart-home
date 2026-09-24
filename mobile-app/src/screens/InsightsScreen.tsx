import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useInsight, useInsights } from "../queries";
import { Loading, ErrorView } from "../components/ui";
import { usePalette } from "../theme";

export default function InsightsScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const insights = useInsights();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const detail = useInsight(openKey);

  if (insights.isLoading) return <Loading />;
  if (insights.error) return <ErrorView message={(insights.error as Error).message} onRetry={() => insights.refetch()} />;

  const analyses = insights.data?.analyses ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
      {insights.data?.available === false ? (
        <Text style={{ color: p.textDim, textAlign: "center", marginTop: 20 }}>
          Insights aren't set up on the hub yet.
        </Text>
      ) : null}
      {analyses.length === 0 ? (
        <Text style={{ color: p.textDim, textAlign: "center", marginTop: 30 }}>No insight reports yet.</Text>
      ) : null}

      {analyses.map((a) => {
        const open = openKey === a.key;
        return (
          <View key={a.key} style={[styles.card, { backgroundColor: p.cardOff, borderColor: p.border }]}>
            <Pressable onPress={() => setOpenKey(open ? null : a.key)} style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: p.text }]}>{a.headline || `Last ${a.days} days`}</Text>
                <Text style={{ color: p.textDim, fontSize: 12 }}>
                  {a.days}-day report · {a.date}
                </Text>
              </View>
              {open ? <ChevronUp size={18} color={p.textDim} /> : <ChevronDown size={18} color={p.textDim} />}
            </Pressable>

            {open ? (
              detail.isLoading ? (
                <Text style={{ color: p.textDim, marginTop: 10 }}>Loading…</Text>
              ) : detail.data?.report ? (
                <View style={{ marginTop: 10, gap: 12 }}>
                  {detail.data.report.sections.map((s, i) => (
                    <View key={i}>
                      <Text style={{ color: p.text, fontWeight: "700", marginBottom: 4 }}>{s.title}</Text>
                      {s.bullets.map((b, j) => (
                        <Text key={j} style={{ color: p.textDim, fontSize: 14, marginBottom: 2 }}>• {b}</Text>
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={{ color: p.textDim, marginTop: 10, fontSize: 14 }}>{detail.data?.text ?? "No report body."}</Text>
              )
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 16, fontWeight: "700" },
});
