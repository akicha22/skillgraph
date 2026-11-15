import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../services/api";
import type { AuthUser, Role } from "../types/auth";

type RegisterInput = { name: string; email: string; password: string; role: Role };

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load, ask the server whether the cookie session is still valid.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((r) => {
        if (!cancelled) setUser(r.user);
      })
      .catch((err) => {
        // 401 just means "not signed in", which is normal
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: AuthUser }>("/auth/login", { email, password });
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const r = await api.post<{ user: AuthUser }>("/auth/register", input);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}