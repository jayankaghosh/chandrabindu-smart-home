import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home } from "lucide-react-native";
import { useAuth } from "../auth";
import { usePalette } from "../theme";
import { SERVER_URL } from "../config";

export default function LoginScreen() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!username || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={[styles.wrap, { paddingTop: insets.top + 40 }]}>
        <View style={[styles.logo, { backgroundColor: p.brand }]}>
          <Home size={30} color={p.brandText} />
        </View>
        <Text style={[styles.title, { color: p.text }]}>Chandrabindu</Text>
        <Text style={{ color: p.textDim, marginBottom: 28 }}>Sign in to control your home</Text>

        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="Username"
          placeholderTextColor={p.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.field, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={p.textDim}
          secureTextEntry
          onSubmitEditing={submit}
          style={[styles.field, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
        />
        {error ? <Text style={{ color: p.danger, marginBottom: 8 }}>{error}</Text> : null}

        <Pressable onPress={submit} disabled={busy} style={[styles.btn, { backgroundColor: p.brand, opacity: busy ? 0.6 : 1 }]}>
          <Text style={{ color: p.brandText, fontWeight: "700", fontSize: 16 }}>{busy ? "Signing in…" : "Sign in"}</Text>
        </Pressable>
        <Text style={{ color: p.textDim, fontSize: 12, marginTop: 18 }}>{SERVER_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 26, alignItems: "stretch" },
  logo: { height: 64, width: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "800", textAlign: "center" },
  field: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12 },
  btn: { borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 4 },
});
