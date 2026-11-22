import { create } from "zustand";
import type { User } from "./types";

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  setAuth: (user: User, token: string, refreshToken?: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

const defaultUser: User = {
  id: "u-1",
  email: "admin@misaina.internal",
  fullName: "Administrateur Misaina",
  role: "ADMIN",
  department: "Direction Générale",
};

const defaultToken = "mock-token-u-1";

function getStoredAuth(): { user: User | null; token: string | null; refreshToken: string | null } {
  if (typeof window === "undefined") {
    return { user: defaultUser, token: defaultToken, refreshToken: "mock-refresh-u-1" };
  }
  try {
    const rawUser = localStorage.getItem("misaina_auth_user");
    const rawToken = localStorage.getItem("misaina_auth_token");
    const rawRefresh = localStorage.getItem("misaina_auth_refresh");
    if (rawUser && rawToken) {
      return {
        user: JSON.parse(rawUser),
        token: rawToken,
        refreshToken: rawRefresh || `mock-refresh-${rawToken}`,
      };
    }
  } catch {
    // fallback
  }
  return { user: defaultUser, token: defaultToken, refreshToken: "mock-refresh-u-1" };
}

const initial = getStoredAuth();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  token: initial.token,
  refreshToken: initial.refreshToken,
  setAuth: (user, token, refreshToken) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("misaina_auth_user", JSON.stringify(user));
      localStorage.setItem("misaina_auth_token", token);
      if (refreshToken) {
        localStorage.setItem("misaina_auth_refresh", refreshToken);
      }
    }
    set({ user, token, refreshToken: refreshToken || null });
  },
  setUser: (user) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("misaina_auth_user", JSON.stringify(user));
    }
    set({ user });
  },
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("misaina_auth_user");
      localStorage.removeItem("misaina_auth_token");
      localStorage.removeItem("misaina_auth_refresh");
    }
    set({ user: null, token: null, refreshToken: null });
  },
}));
