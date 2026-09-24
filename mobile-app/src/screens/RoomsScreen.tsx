import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BedDouble, Sofa, CookingPot, Bath, Car, Trees, Sparkles, DoorOpen, Lock, ChevronRight } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRooms, useStatuses } from "../queries";
import { Loading, ErrorView, Badge } from "../components/ui";
import { usePalette } from "../theme";
import type { Room } from "../types";
import type { RoomsStackParams } from "../navigation";

function roomIcon(name: string) {
  const s = name.toLowerCase();
  if (/bed|bedroom|\bbr\b|mbr|gbr|fbr/.test(s)) return BedDouble;
  if (/living|lounge|drawing|hall|sofa/.test(s)) return Sofa;
  if (/kitchen/.test(s)) return CookingPot;
  if (/bath|wash|toilet/.test(s)) return Bath;
  if (/garage|parking|car/.test(s)) return Car;
  if (/balcony|garden|terrace|lawn|outdoor/.test(s)) return Trees;
  if (/pooja|temple|prayer/.test(s)) return Sparkles;
  return DoorOpen;
}

export default function RoomsScreen({ navigation }: NativeStackScreenProps<RoomsStackParams, "Rooms">) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const rooms = useRooms();
  const allIds = useMemo(
    () => (rooms.data?.rooms ?? []).flatMap((r) => r.devices.map((d) => d.id)),
    [rooms.data],
  );
  const statuses = useStatuses(allIds);

  if (rooms.isLoading) return <Loading label="Loading your home…" />;
  if (rooms.error) return <ErrorView message={(rooms.error as Error).message} onRetry={() => rooms.refetch()} />;

  const list = (rooms.data?.rooms ?? []).filter((r) => r.devices.length > 0);

  function onCount(room: Room): number {
    let n = 0;
    for (const d of room.devices) {
      const vals = statuses.data?.[d.id]?.values ?? {};
      for (const f of d.functions) if (f.type === "Boolean" && !f.protected && vals[f.code] === true) n++;
    }
    return n;
  }

  return (
    <FlatList
      data={list}
      keyExtractor={(r) => r.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 12, paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={
        <Text style={[styles.h1, { color: p.text }]}>{rooms.data?.houseName ?? "Rooms"}</Text>
      }
      refreshing={rooms.isFetching}
      onRefresh={() => rooms.refetch()}
      renderItem={({ item }) => {
        const locked = item.locked && !item.unlocked;
        const Icon = locked ? Lock : roomIcon(item.name);
        const on = onCount(item);
        return (
          <Pressable
            onPress={() => navigation.navigate("RoomDetail", { roomId: item.id, name: item.name })}
            style={[styles.card, { backgroundColor: p.cardOff, borderColor: p.border }]}
          >
            <View style={styles.cardTop}>
              <View style={[styles.iconBox, { backgroundColor: p.dark ? "rgba(255,255,255,0.08)" : "#fff" }]}>
                <Icon size={22} color={p.text} />
              </View>
              {!locked && on > 0 ? <Badge text={`${on} on`} /> : <ChevronRight size={18} color={p.textDim} />}
            </View>
            <Text numberOfLines={1} style={[styles.roomName, { color: p.text }]}>{item.name}</Text>
            <Text style={{ color: p.textDim, fontSize: 13 }}>
              {locked ? "Locked" : `${item.devices.length} device${item.devices.length === 1 ? "" : "s"}`}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "800", marginBottom: 8 },
  card: { flex: 1, borderRadius: 24, padding: 16, borderWidth: 1, minHeight: 130, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  iconBox: { height: 44, width: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  roomName: { fontSize: 17, fontWeight: "700" },
});
