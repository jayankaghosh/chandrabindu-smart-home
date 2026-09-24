import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Fan, Lightbulb, Lock, Minus, Plug, Plus, Power, Star } from "lucide-react-native";
import type { DeviceFunction } from "../types";
import { isOn, enumLabel, valueLabel } from "../lib/format";
import { usePalette } from "../theme";

function iconFor(fn: DeviceFunction) {
  const s = `${fn.name} ${fn.code}`.toLowerCase();
  if (/fan/.test(s)) return Fan;
  if (/light|lamp|strip|bulb|deco/.test(s)) return Lightbulb;
  if (/socket|plug|outlet/.test(s)) return Plug;
  if (/lock/.test(s)) return Lock;
  return Power;
}

export default function ControlTile({
  fn,
  value,
  reachable,
  isProtected,
  isAdmin,
  isFavourite,
  onCommand,
  onToggleFavourite,
}: {
  fn: DeviceFunction;
  value: unknown;
  reachable: boolean | null;
  isProtected?: boolean;
  isAdmin?: boolean;
  isFavourite?: boolean;
  onCommand: (value: unknown) => void;
  onToggleFavourite?: () => void;
}) {
  const p = usePalette();
  const on = isOn(fn, value);
  const Icon = iconFor(fn);
  const offline = reachable === false;
  const lockedOut = !!isProtected && !isAdmin;
  const disabled = offline || lockedOut;

  function request(v: unknown) {
    if (disabled) return;
    if (isProtected && isAdmin) {
      Alert.alert("Protected control", `"${fn.name}" is protected. Set it to ${valueLabel(fn, v)}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Yes", onPress: () => onCommand(v) },
      ]);
      return;
    }
    onCommand(v);
  }

  const tileBg = on ? p.tileOnFrom : p.cardOff;
  const contentColor = on ? "#fff" : p.text;

  return (
    <View style={styles.wrap}>
      {fn.type === "Boolean" ? (
        <Pressable
          onPress={() => request(value !== true)}
          disabled={disabled}
          style={[styles.tile, { backgroundColor: tileBg, borderColor: p.border, opacity: offline ? 0.5 : 1 }]}
        >
          <View style={[styles.iconBox, { backgroundColor: on ? "rgba(255,255,255,0.22)" : p.dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" }]}>
            <Icon size={22} color={on ? "#fff" : p.textDim} />
          </View>
          <View>
            <Text numberOfLines={1} style={[styles.name, { color: contentColor }]}>{fn.name}</Text>
            <Text style={{ color: on ? "rgba(255,255,255,0.85)" : p.textDim, fontSize: 13 }}>{valueLabel(fn, value)}</Text>
          </View>
        </Pressable>
      ) : (
        <View style={[styles.tileWide, { backgroundColor: tileBg, borderColor: p.border, opacity: offline ? 0.5 : 1 }]}>
          <View style={styles.rowHead}>
            <View style={[styles.iconBox, { backgroundColor: on ? "rgba(255,255,255,0.22)" : p.dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" }]}>
              <Icon size={20} color={on ? "#fff" : p.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.name, { color: contentColor }]}>{fn.name}</Text>
              <Text style={{ color: on ? "rgba(255,255,255,0.85)" : p.textDim, fontSize: 13 }}>{valueLabel(fn, value)}</Text>
            </View>
          </View>
          {fn.type === "Enum" ? (
            <View style={styles.segments}>
              {(fn.range ?? []).map((opt) => {
                const active = String(value ?? "") === opt;
                return (
                  <Pressable
                    key={opt}
                    disabled={disabled}
                    onPress={() => request(opt)}
                    style={[
                      styles.segment,
                      { backgroundColor: active ? (on ? "#fff" : p.brand) : on ? "rgba(0,0,0,0.15)" : p.dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.05)" },
                    ]}
                  >
                    <Text style={{ color: active ? (on ? "#0f172a" : "#fff") : on ? "#fff" : p.text, fontWeight: "700", fontSize: 13 }}>
                      {enumLabel(opt)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Stepper fn={fn} value={value} disabled={disabled} onChange={request} palette={p} on={on} />
          )}
        </View>
      )}

      {/* Protected: grey the whole tile out. */}
      {isProtected && <View pointerEvents="none" style={[styles.protectedOverlay, { backgroundColor: p.overlay }]} />}

      {/* Favourite star */}
      {onToggleFavourite ? (
        <Pressable onPress={onToggleFavourite} style={[styles.star, { backgroundColor: p.dark ? "#1e293b" : "#fff", borderColor: p.border }]} hitSlop={8}>
          <Star size={15} color={isFavourite ? "#f59e0b" : p.textDim} fill={isFavourite ? "#f59e0b" : "transparent"} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Stepper({
  fn,
  value,
  disabled,
  onChange,
  palette,
  on,
}: {
  fn: DeviceFunction;
  value: unknown;
  disabled: boolean;
  onChange: (v: number) => void;
  palette: ReturnType<typeof usePalette>;
  on: boolean;
}) {
  const min = fn.min ?? 0;
  const max = fn.max ?? 100;
  const step = fn.step ?? 1;
  const cur = typeof value === "number" ? value : min;
  const btn = { backgroundColor: on ? "rgba(255,255,255,0.22)" : palette.dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" };
  return (
    <View style={styles.stepper}>
      <Pressable disabled={disabled || cur <= min} onPress={() => onChange(Math.max(min, cur - step))} style={[styles.stepBtn, btn]}>
        <Minus size={18} color={on ? "#fff" : palette.text} />
      </Pressable>
      <Text style={{ color: on ? "#fff" : palette.text, fontWeight: "800", fontSize: 16, minWidth: 54, textAlign: "center" }}>
        {valueLabel(fn, cur)}
      </Text>
      <Pressable disabled={disabled || cur >= max} onPress={() => onChange(Math.min(max, cur + step))} style={[styles.stepBtn, btn]}>
        <Plus size={18} color={on ? "#fff" : palette.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  tile: { height: 128, borderRadius: 24, padding: 14, justifyContent: "space-between", borderWidth: 1 },
  tileWide: { borderRadius: 24, padding: 14, borderWidth: 1, gap: 12 },
  iconBox: { height: 44, width: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontSize: 15, fontWeight: "700" },
  segments: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segment: { flexGrow: 1, minWidth: 64, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepBtn: { height: 44, flex: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  protectedOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: 24 },
  star: { position: "absolute", right: -6, top: -6, height: 30, width: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
