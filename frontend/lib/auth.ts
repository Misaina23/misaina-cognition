import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authApi } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  setAuth: (user: CurrentUser, token: string, refreshToken: string) => void;
  logout: () => void;
  fetchMe: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      setAuth: (user, token, refreshToken) => set({ user, token, refreshToken }),
      logout: () => {
        try { authApi.logout().catch(() => {}); } finally { set({ user: null, token: null, refreshToken: null }); }
      },
      fetchMe: async () => {
        if (!get().token) return false;
        try {
          const { data } = await authApi.me();
          set({ user: { id: data.id, email: data.email, fullName: data.fullName, role: data.role, department: data.department } });
          return true;
        } catch {
          set({ user: null, token: null, refreshToken: null });
          return false;
        }
      },
    }),
    { name: "cognition-auth" }
  )
);

