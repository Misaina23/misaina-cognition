"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MessageSquare, FileText, LayoutDashboard, Users, BarChart3, Sun, Moon, User, LogOut } from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Mon espace", icon: LayoutDashboard },
  { href: "/chat", label: "Assistant IA", icon: MessageSquare },
  { href: "/documents", label: "Mes documents", icon: FileText },
  { href: "/analytics", label: "Analytiques", icon: BarChart3 },
  { href: "/users", label: "Utilisateurs", icon: Users },
  { href: "/profile", label: "Profil", icon: User },
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
    n.href === "/users" ? isAdmin :
    n.href === "/analytics" ? isManager : true);

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-card p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="h-8 w-8 rounded-lg bg-primary" />
        <span className="font-bold">Misaina</span>
      </div>
      <nav className="flex-1 space-y-1">
        {visibleNav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted",
              path === n.href && "bg-primary/10 text-primary"
            )}
          >
            <n.icon size={18} /> {n.label}
          </Link>
        ))}
      </nav>
      <div className="mb-2 px-3 text-xs text-muted-foreground">{user?.fullName}</div>
      <button onClick={toggle} className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        {theme === "dark" ? "Mode clair" : "Mode sombre"}
      </button>
      <button onClick={() => { logout(); router.push("/login"); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-muted">
        <LogOut size={18} /> Déconnexion
      </button>
    </aside>
  );
}
