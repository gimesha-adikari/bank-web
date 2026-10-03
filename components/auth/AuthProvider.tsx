"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { invalidateCsrfToken, onAuthExpired } from "@/lib/api/http";
import type { LoginRequest, LoginResponse, Role, UserProfile } from "@/lib/api/contracts";
import { ApiError } from "@/lib/api/errors";

export type AuthStatus = "booting" | "anonymous" | "authenticated" | "boot-error";
type AuthContextValue = {
  status: AuthStatus;
  username: string | null;
  role: Role | null;
  profile: UserProfile | null;
  signIn: (credentials: LoginRequest) => Promise<LoginResponse>;
  signOut: () => Promise<void>;
  retryBootstrap: () => void;
  setProfile: (profile: UserProfile | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const router = useRouter();

  const clear = useCallback(() => {
    invalidateCsrfToken();
    setUsername(null);
    setRole(null);
    setProfile(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => onAuthExpired(clear), [clear]);

  useEffect(() => {
    let cancelled = false;
    void authApi.validateToken().then((identity) => {
      if (cancelled) return;
      setUsername(identity.username);
      setRole(identity.role);
      setStatus("authenticated");
    }).catch((failure) => {
      if (cancelled) return;
      if (failure instanceof ApiError && failure.status === 401) clear();
      else setStatus("boot-error");
    });
    return () => { cancelled = true; };
  }, [bootstrapAttempt, clear]);

  const signIn = useCallback(async (credentials: LoginRequest) => {
    const result = await authApi.login(credentials);
    invalidateCsrfToken();
    setUsername(result.username);
    setRole(result.role);
    setProfile(null);
    setStatus("authenticated");
    router.push(result.role === "ADMIN" ? "/admin" : result.role === "CUSTOMER" ? "/customer" : "/staff");
    return result;
  }, [router]);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
      clear();
      router.push("/login");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        clear();
        router.push("/login");
        return;
      }
      throw error;
    }
  }, [clear, router]);

  const retryBootstrap = useCallback(() => { setStatus("booting"); setBootstrapAttempt((value) => value + 1); }, []);
  const value = useMemo(() => ({ status, username, role, profile, signIn, signOut, retryBootstrap, setProfile }), [profile, retryBootstrap, role, signIn, signOut, status, username]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
