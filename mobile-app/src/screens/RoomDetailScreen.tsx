import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bluetooth, Lock, LockOpen } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../api";
import { useAuth } from "../auth";
import { useFavourites, useRooms, useSendCommand, useStatuses, useToggleFavourite } from "../queries";
import { CONTROLLABLE, favKey } from "../lib/format";
import ControlTile from "../components/ControlTile";
import { Loading } from "../components/ui";
import { usePalette } from "../theme";
import type { RoomsStackParams } from "../navigation";

export default function RoomDetailScreen({ route }: NativeStackScreenProps<RoomsStackParams, "RoomDetail">) {
  const { roomId } = route.params;
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const rooms = useRooms();
  const room = rooms.data?.rooms.find((r) => r.id === roomId);
  const deviceIds = useMemo(() => room?.devices.map((d) => d.id) ?? [], [room]);
  const statuses = useStatuses(deviceIds);
  const favourites = useFavourites();
  const send = useSendCommand();
  const toggleFav = useToggleFavourite();

  if (!room) return <Loading />;

  if (room.locked && !room.unlocked) {
    return <LockedRoom roomId={room.id} name={room.name} onUnlocked={() => rooms.refetch()} />;
  }

  const devices = room.devices.filter((d) => d.functions.some((f) => CONTROLLABLE.includes(f.type)));

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 22 }}
      refreshControl={undefined}
    >
      {devices.length === 0 ? (
        <Text style={{ color: p.textDim, textAlign: "center", paddingVertical: 40 }}>No controllable switches here.</Text>
      ) : null}

      {devices.map((device) => {
        const st = statuses.data?.[device.id];
        const controls = device.functions.filter((f) => CONTROLLABLE.includes(f.type));
        return (
          <View key={device.id} style={{ gap: 10 }}>
            <Text style={[styles.deviceLabel, { color: p.textDim }]}>
              {device.name}
              {st?.reachable === false ? "  · offline" : ""}
            </Text>
            {device.bluetooth ? (
              <View style={[styles.bt, { backgroundColor: p.cardOff, borderColor: p.border }]}>
                <Bluetooth size={20} color="#38bdf8" />
                <Text style={{ color: p.textDim, flex: 1 }}>Bluetooth device — control it from the Smart Life app.</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {controls.map((fn) => (
                  <View key={fn.code} style={fn.type === "Boolean" ? styles.half : styles.full}>
                    <ControlTile
                      fn={fn}
                      value={st?.values?.[fn.code]}
                      reachable={st?.reachable ?? null}
                      isProtected={!!fn.protected}
                      isAdmin={isAdmin}
                      isFavourite={favourites.data?.has(favKey(device.id, fn.code))}
                      onCommand={(v) => send.mutate({ deviceId: device.id, code: fn.code, value: v })}
                      onToggleFavourite={() =>
                        toggleFav.mutate({
                          deviceId: device.id,
                          code: fn.code,
                          favourite: !favourites.data?.has(favKey(device.id, fn.code)),
                        })
                      }
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function LockedRoom({ roomId, name, onUnlocked }: { roomId: string; name: string; onUnlocked: () => void }) {
  const p = usePalette();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/rooms/${roomId}/unlock`, { password });
      await qc.invalidateQueries({ queryKey: ["rooms"] });
      onUnlocked();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't unlock");
      setBusy(false);
    }
  }

  return (
    <View style={styles.lockWrap}>
      <View style={[styles.lockIcon, { backgroundColor: p.cardOff }]}>
        <Lock size={30} color={p.textDim} />
      </View>
      <Text style={{ color: p.text, fontSize: 18, fontWeight: "700", marginBottom: 4 }}>{name} is locked</Text>
      <Text style={{ color: p.textDim, marginBottom: 18 }}>Enter the room password.</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Room password"
        placeholderTextColor={p.textDim}
        secureTextEntry
        style={[styles.field, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
      />
      {error ? <Text style={{ color: p.danger, marginBottom: 8 }}>{error}</Text> : null}
      <Pressable onPress={unlock} disabled={busy || !password} style={[styles.unlockBtn, { backgroundColor: p.brand, opacity: busy || !password ? 0.6 : 1 }]}>
        <LockOpen size={18} color={p.brandText} />
        <Text style={{ color: p.brandText, fontWeight: "700" }}>Unlock</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  deviceLabel: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  half: { width: "48%" },
  full: { width: "100%" },
  bt: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, padding: 16 },
  lockWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  lockIcon: { height: 80, width: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  field: { width: "100%", maxWidth: 320, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12, textAlign: "center" },
  unlockBtn: { flexDirection: "row", gap: 8, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 40, alignItems: "center" },
});
