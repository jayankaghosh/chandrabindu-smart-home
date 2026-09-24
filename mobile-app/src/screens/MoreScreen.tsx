import React from "react";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Zap, LineChart, LogOut, ChevronRight, Home } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth";
import { useRooms } from "../queries";
import { SERVER_URL } from "../config";
import { usePalette } from "../theme";
import type { MoreStackParams } from "../navigation";

export default function MoreScreen({ navigation }: NativeStackScreenProps<MoreStackParams, "More">) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { session, logout } = useAuth();
  const rooms = useRooms();

  const Row = ({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.row, { backgroundColor: p.cardOff, borderColor: p.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: p.dark ? "rgba(255,255,255,0.08)" : "#fff" }]}>{icon}</View>
      <Text style={{ color: p.text, fontSize: 16, fontWeight: "600", flex: 1 }}>{label}</Text>
      <ChevronRight size={18} color={p.textDim} />
    </Pressable>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 12, paddingBottom: insets.bottom + 24 }}>
      <Text style={[styles.h1, { color: p.text }]}>More</Text>

      <View style={[styles.house, { backgroundColor: p.cardOff, borderColor: p.border }]}>
        <View style={[styles.rowIcon, { backgroundColor: p.brand }]}>
          <Home size={20} color={p.brandText} />
        </View>
        <View>
          <Text style={{ color: p.text, fontWeight: "700", fontSize: 16 }}>{rooms.data?.houseName ?? "Home"}</Text>
          <Text style={{ color: p.textDim, fontSize: 13 }}>
            {session?.username} · {session?.role}
          </Text>
        </View>
      </View>

      <Row icon={<Zap size={20} color={p.text} />} label="Automations" onPress={() => navigation.navigate("Automations")} />
      <Row icon={<LineChart size={20} color={p.text} />} label="Insights" onPress={() => navigation.navigate("Insights")} />

      <Pressable onPress={logout} style={[styles.logout, { borderColor: p.border }]}>
        <LogOut size={18} color={p.danger} />
        <Text style={{ color: p.danger, fontWeight: "700" }}>Log out</Text>
      </Pressable>

      <Text style={{ color: p.textDim, fontSize: 12, textAlign: "center", marginTop: 6 }}>{SERVER_URL}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "800", marginBottom: 4 },
  house: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, padding: 14 },
  rowIcon: { height: 40, width: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  logout: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 18, borderWidth: 1, paddingVertical: 15, marginTop: 8 },
});
