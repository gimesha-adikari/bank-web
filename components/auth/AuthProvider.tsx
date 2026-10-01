"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { configureGetRefresh } from "@/lib/api/http";
import type { LoginRequest, LoginResponse, Role, UserProfile } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";

const TOKEN_KEY = "bank-web.jwt";

export type AuthStatus = "booting" | "anonymous" | "authenticated";
type AuthContextValue = {
  status: AuthStatus;
  token: string | null;
  username: string | null;
  role: Role | null;
  profile: UserProfile | null;
  signIn: (credentials: LoginRequest) => Promise<LoginResponse>;
  signOut: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
  setProfile: (profile: UserProfile | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function saveToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const router = useRouter();

  const clear = useCallback(() => {
    saveToken(null);
    setToken(null);
    setUsername(null);
    setRole(null);
    setProfile(null);
    setStatus("anonymous");
  }, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!token || !username) return null;
    try {
      const result = await authApi.refresh(token, username);
      saveToken(result.token);
      setToken(result.token);
      return result.token;
    } catch {
      clear();
      return null;
    }
  }, [clear, token, username]);

  useEffect(() => {
    configureGetRefresh(() => refreshToken());
    return () => configureGetRefresh(undefined);
  }, [refreshToken]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const saved = window.localStorage.getItem(TOKEN_KEY);
      if (!saved) {
        if (!cancelled) setStatus("anonymous");
        return;
      }
      try {
        const identity = await authApi.validateToken(saved);
        if (cancelled) return;
        setToken(saved);
        setUsername(identity.username);
        setRole(identity.role);
        setStatus("authenticated");
      } catch {
        if (!cancelled) clear();
      }
    };
    void bootstrap();
    return () => { cancelled = true; };
  }, [clear]);

  const signIn = useCallback(async (credentials: LoginRequest) => {
    const result = await authApi.login(credentials);
    saveToken(result.token);
    setToken(result.token);
    setUsername(result.username);
    setRole(result.role);
    setStatus("authenticated");
    router.push(result.role === "ADMIN" ? "/admin" : result.role === "CUSTOMER" ? "/customer" : "/staff");
    return result;
  }, [router]);

  const signOut = useCallback(async () => {
    if (token) {
      try { await authApi.logout(token); } catch (error) { if (!(error instanceof ApiError) || error.status !== 401) console.warn("logout request failed"); }
    }
    clear();
    router.push("/login");
  }, [clear, router, token]);

  const value = useMemo(() => ({ status, token, username, role, profile, signIn, signOut, refreshToken, setProfile }), [profile, refreshToken, role, signIn, signOut, status, token, username]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
