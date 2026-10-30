"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  FileText,
  LayoutDashboard,
  Users,
  BarChart3,
  Sun,
  Moon,
  LogOut,
  Sparkles,
  Shield,
  Layers,
  Database,
  ShieldCheck,
  Globe,
  FileDiff,
  KeyRound,
  Plus,
  Compass,
} from "lucide-react";
import { useThemeStore, useChatStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth";

const mainNav = [
  { href: "/chat", label: "Assistant IA & Dialogue", icon: MessageSquare },
  { href: "/documents", label: "Base documentaire", icon: FileText },
  { href: "/diff", label: "Comparateur de versions", icon: FileDiff },
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
];

const enterpriseNav = [
  { href: "/connectors", label: "Connecteurs SI", icon: Database },
  { href: "/audit", label: "Audit & PSSI", icon: ShieldCheck },
  { href: "/analytics", label: "Analytiques RAG", icon: BarChart3 },
  { href: "/api-keys", label: "Clés d'API & SI", icon: KeyRound },
  { href: "/users", label: "Gouvernance & Rôles", icon: Users },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const toggle = useThemeStore((s) => s.toggle);
  const theme = useThemeStore((s) => s.theme);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const resetChat = useChatStore((s) => s.reset);

  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "MANAGER" || isAdmin;

  const visibleEnterpriseNav = enterpriseNav.filter((n) => {
    if (n.href === "/users") return isAdmin;
    if (n.href === "/analytics" || n.href === "/audit" || n.href === "/api-keys") return isManager;
    return true;
  });

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "MC";

  function handleStartNewChat() {
    resetChat();
    if (path !== "/chat") {
      router.push("/chat");
    }
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground transition-colors select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-2 pt-2 pb-3">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20 transition-transform group-hover:scale-105">
            <Sparkles size={16} className="stroke-[2.2]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-serif text-[15px] font-semibold tracking-tight text-foreground leading-tight">
              Misaina Cognition
            </span>
            <span className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase">
              Style Claude · RAG
            </span>
          </div>
        </Link>
      </div>

      {/* Claude-style "Nouvelle discussion" Button */}
      <div className="px-1 my-2">
        <button
          onClick={handleStartNewChat}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-background/80 hover:bg-background px-3.5 py-2.5 text-xs font-medium text-foreground shadow-xs transition-all duration-150 hover:border-primary/40 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Plus size={13} className="stroke-[2.5]" />
            </div>
            <span className="font-medium">Nouvelle discussion</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/80 border border-border/60 rounded px-1.5 py-0.5">
            RAG
          </span>
        </button>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto space-y-5 px-1 py-1">
        {/* Main Section */}
        <div>
          <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            Espaces de travail
          </div>
          <nav className="space-y-0.5">
            {mainNav.map((n) => {
              const isActive = path === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150",
                    isActive
                      ? "bg-background text-foreground shadow-xs border border-border/70 font-semibold"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  )}
                >
                  <n.icon
                    size={16}
                    className={cn(
                      "shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span className="truncate">{n.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Enterprise Governance Section */}
        {visibleEnterpriseNav.length > 0 && (
          <div>
            <div className="px-2.5 mb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Gouvernance & Sécurité
            </div>
            <nav className="space-y-0.5">
              {visibleEnterpriseNav.map((n) => {
                const isActive = path === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-150",
                      isActive
                        ? "bg-background text-foreground shadow-xs border border-border/70 font-semibold"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    )}
                  >
                    <n.icon
                      size={16}
                      className={cn(
                        "shrink-0 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{n.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Public Showcase Link */}
      <div className="py-2 border-t border-border/60 px-1">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-background/60 hover:text-foreground transition-colors"
        >
          <Compass size={15} />
          <span>Portail institutionnel public</span>
        </Link>
      </div>

      {/* User Information & Quick Utilities */}
      <div className="mt-auto border-t border-border/70 pt-2.5 px-1 space-y-2">
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-background/80 border border-transparent hover:border-border/60",
            path === "/profile" && "bg-background border-border/70 shadow-xs"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary font-serif font-bold text-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{user?.fullName || "Collaborateur"}</p>
            <p className="text-[10px] text-muted-foreground truncate font-mono">
              {user?.department || "Misaina Org"} · {user?.clearanceLevel || "C2"}
            </p>
          </div>
          {isAdmin && (
            <span title="Administrateur habilité">
              <Shield size={13} className="text-primary shrink-0" />
            </span>
          )}
        </Link>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            onClick={toggle}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border/70 bg-background/70 py-1.5 px-2 text-xs font-medium text-foreground hover:bg-background transition-colors"
            title="Basculer le thème"
          >
            {theme === "dark" ? <Sun size={13} className="text-primary" /> : <Moon size={13} className="text-muted-foreground" />}
            <span className="text-[11px]">{theme === "dark" ? "Ambiance Claire" : "Ambiance Sombre"}</span>
          </button>

          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="flex items-center justify-center rounded-lg border border-border/70 bg-background/70 p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
            title="Déconnexion"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
