import React, { createContext, useContext, useEffect, useState } from "react";
import { apiPost } from "./api";
import { clearToken, loadToken, saveToken } from "./tokenStore";
import type { Session } from "./types";

interface AuthState {
  session: Session | null;
  loading: boolean; // still restoring a persisted token
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

type LoginResponse = { ok: boolean; username: string; role: "admin" | "user"; token: string };

// Decode a JWT payload (base64url) without verifying — just to recover the
// username (`sub`) and `role` from a persisted token. The server still enforces
// the signature on every request.
function decodeToken(token: string): { username: string; role: "admin" | "user" } | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    if (typeof atob !== "function") return null; // Hermes/modern RN provides atob
    const claims = JSON.parse(atob(b64));
    if (!claims?.sub) return null;
    return { username: String(claims.sub), role: claims.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // On launch, restore a persisted token and trust its claims until a request 401s.
  useEffect(() => {
    (async () => {
      const token = await loadToken();
      const claims = token ? decodeToken(token) : null;
      if (token && claims) {
        setSession({ username: claims.username, role: claims.role, token });
      } else if (token) {
        await clearToken();
      }
      setLoading(false);
    })();
  }, []);

  async function login(username: string, password: string) {
    const res = await apiPost<LoginResponse>("/api/auth/login", { username, password });
    await saveToken(res.token);
    setSession({ username: res.username, role: res.role, token: res.token });
  }

  async function logout() {
    await clearToken();
    setSession(null);
  }

  return <AuthContext.Provider value={{ session, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
