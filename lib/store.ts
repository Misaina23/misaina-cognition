import { create } from "zustand";

interface ChatStore {
  conversationId: string | null;
  setConversation: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  conversationId: null,
  setConversation: (conversationId) => set({ conversationId }),
}));

export const MISSION_THEATERS = [
  { id: "TOUS", label: "Toutes les Missions & Siège", badge: "Global" },
  { id: "Siège Global - Genève / Paris", label: "Siège Global - Genève / Paris", badge: "HQ" },
  { id: "Bureau Régional Sahel - Dakar", label: "Bureau Régional Sahel - Dakar", badge: "Afrique" },
  { id: "Hub Opérationnel d'Urgence - Goma", label: "Hub Opérationnel d'Urgence - Goma", badge: "Grands Lacs" },
  { id: "Mission Réponse Rapide - Kyiv", label: "Mission Réponse Rapide - Kyiv", badge: "Europe Est" },
  { id: "Bureau Moyen-Orient - Amman", label: "Bureau Moyen-Orient - Amman", badge: "Moyen-Orient" },
];

interface MissionStore {
  selectedTheater: string;
  setTheater: (theater: string) => void;
}

export const useMissionStore = create<MissionStore>((set) => ({
  selectedTheater: "TOUS",
  setTheater: (theater) => set({ selectedTheater: theater }),
}));

interface ThemeStore {
  theme: "light" | "dark";
  toggle: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("misaina_theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: typeof window !== "undefined" ? getInitialTheme() : "light",
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    if (typeof window !== "undefined") {
      localStorage.setItem("misaina_theme", next);
      if (next === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
    set({ theme: next });
  },
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("misaina_theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
    set({ theme });
  },
}));
