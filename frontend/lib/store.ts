import { create } from "zustand";

interface ThemeState {
  theme: "dark" | "light";
  toggle: () => void;
  set: (t: "dark" | "light") => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "dark",
  toggle: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  set: (t) => set({ theme: t }),
}));

interface ChatState {
  conversationId: string | null;
  setConversation: (id: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversationId: null,
  setConversation: (id) => set({ conversationId: id }),
}));
