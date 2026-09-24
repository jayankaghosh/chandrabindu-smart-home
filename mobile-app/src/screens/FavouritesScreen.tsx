import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Star } from "lucide-react-native";
import { useAuth } from "../auth";
import { useFavourites, useRooms, useSendCommand, useStatuses, useToggleFavourite } from "../queries";
import { favKey } from "../lib/format";
import ControlTile from "../components/ControlTile";
import { Loading } from "../components/ui";
import { usePalette } from "../theme";

export default function FavouritesScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const rooms = useRooms();
  const favourites = useFavourites();
  const send = useSendCommand();
  const toggleFav = useToggleFavourite();

  // Flatten every favourited control into {device, fn}.
  const items = useMemo(() => {
    const favs = favourites.data ?? new Set<string>();
    const out: { deviceId: string; deviceName: string; fn: any }[] = [];
    for (const room of rooms.data?.rooms ?? []) {
      for (const d of room.devices) {
        for (const f of d.functions) {
          if (favs.has(favKey(d.id, f.code))) out.push({ deviceId: d.id, deviceName: d.name, fn: f });
        }
      }
    }
    return out;
  }, [rooms.data, favourites.data]);

  const statuses = useStatuses(useMemo(() => [...new Set(items.map((i) => i.deviceId))], [items]));

  if (rooms.isLoading || favourites.isLoading) return <Loading />;

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Star size={40} color={p.textDim} />
        <Text style={{ color: p.textDim, marginTop: 14, textAlign: "center" }}>
          No favourites yet. Tap the star on any control to add it here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}>
      <Text style={[styles.h1, { color: p.text }]}>Favourites</Text>
      <View style={styles.grid}>
        {items.map(({ deviceId, deviceName, fn }) => {
          const st = statuses.data?.[deviceId];
          return (
            <View key={`${deviceId}:${fn.code}`} style={fn.type === "Boolean" ? styles.half : styles.full}>
              <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 12, marginBottom: 6 }}>{deviceName}</Text>
              <ControlTile
                fn={fn}
                value={st?.values?.[fn.code]}
                reachable={st?.reachable ?? null}
                isProtected={!!fn.protected}
                isAdmin={isAdmin}
                isFavourite
                onCommand={(v) => send.mutate({ deviceId, code: fn.code, value: v })}
                onToggleFavourite={() => toggleFav.mutate({ deviceId, code: fn.code, favourite: false })}
              />
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "800", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  half: { width: "48%" },
  full: { width: "100%" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
});
