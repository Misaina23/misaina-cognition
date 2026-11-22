"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AuthUser,
  type Permission,
  type UserSpace,
} from "@/lib/api";

interface SessionContextValue {
  user: AuthUser | null;
  spaces: UserSpace[];
  loading: boolean;
  error: string | null;
  isDark: boolean;
  toggleTheme: () => void;
  refreshSession: () => Promise<{ user: AuthUser; spaces: UserSpace[] } | null>;
  clearSession: () => void;
  hasPermission: (perm: Permission) => boolean;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = "misaina-theme";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark") {
        document.documentElement.classList.add("dark");
        setIsDark(true);
      } else if (saved === "light") {
        document.documentElement.classList.remove("dark");
        setIsDark(false);
      } else {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    } catch {
      setIsDark(document.documentElement.classList.contains("dark"));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await guardianApi.me();
      setUser(res.user);
      setSpaces(res.spaces || []);
      return res;
    } catch (err) {
      if (isUnauthorizedError(err)) {
        setUser(null);
        setSpaces([]);
      } else {
        setError(describeApiError(err));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setSpaces([]);
    setError(null);
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const hasPermission = useCallback(
    (perm: Permission) => {
      if (!user) return false;
      if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;
      return Array.isArray(user.permissions) && user.permissions.includes(perm);
    },
    [user]
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      spaces,
      loading,
      error,
      isDark,
      toggleTheme,
      refreshSession,
      clearSession,
      hasPermission,
    }),
    [clearSession, error, hasPermission, isDark, loading, refreshSession, spaces, toggleTheme, user]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return ctx;
}
