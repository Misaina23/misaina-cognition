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
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/chat", label: "Assistant IA", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/analytics", label: "Analytiques", icon: BarChart3 },
  { href: "/users", label: "Collaborateurs", icon: Users },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const toggle = useThemeStore((s) => s.toggle);
  const theme = useThemeStore((s) => s.theme);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "MANAGER" || isAdmin;

  const visibleNav = nav.filter((n) =>
    n.href === "/users" ? isAdmin : n.href === "/analytics" ? isManager : true
  );

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "MC";

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card/80 backdrop-blur-md p-4 transition-colors">
      {/* Brand Zone */}
      <div className="mb-6 flex items-center gap-3 px-2 pt-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
          <Layers size={20} className="stroke-[2.2]" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-base tracking-tight text-foreground truncate">
            Misaina
          </span>
          <span className="text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
            Cognition RAG
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="mb-2 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Navigation
      </div>
      <nav className="flex-1 space-y-1">
        {visibleNav.map((n) => {
          const isActive = path === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 select-none",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <n.icon
                size={18}
                className={cn(
                  "shrink-0 transition-transform group-hover:scale-105",
                  isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className="truncate">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Information & Quick Utilities */}
      <div className="mt-auto border-t border-border pt-4 space-y-2">
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted",
            path === "/profile" && "bg-muted"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{user?.fullName || "Utilisateur"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{user?.department || "Misaina Entreprise"}</p>
          </div>
          {isAdmin && (
            <span title="Administrateur">
              <Shield size={14} className="text-primary shrink-0" />
            </span>
          )}
        </Link>

        <div className="flex items-center gap-1.5 pt-1">
          <button
            onClick={toggle}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background py-1.5 px-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            title="Basculer le thème"
          >
            {theme === "dark" ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-400" />}
            <span className="text-[11px]">{theme === "dark" ? "Clair" : "Sombre"}</span>
          </button>

          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="flex items-center justify-center rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-colors"
            title="Se déconnecter"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
