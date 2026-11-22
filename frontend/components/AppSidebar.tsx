"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpenCheck,
  Bot,
  ExternalLink,
  History,
  Layers,
  Lock,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  UserCog,
  X,
} from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { guardianApi } from "@/lib/api";

interface AppSidebarProps {
  spaceId: string;
}

function getInitials(name?: string): string {
  if (!name) return "MC";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function AppSidebar({ spaceId }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const encoded = encodeURIComponent(spaceId);
  const { user, spaces, isDark, toggleTheme, clearSession, hasPermission } = useSession();

  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try {
      await guardianApi.logout();
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  const base = `/dashboard/${encoded}`;
  const navItems = [
    {
      href: base,
      label: "Agent IA & Contrôle",
      description: "Qualité terrain, règles & alertes",
      icon: Bot,
      active: pathname === base || pathname === `${base}/`,
    },
    {
      href: `${base}/validations`,
      label: "Validations Humaines",
      description: "Arbitrage cas ambigus",
      icon: ShieldCheck,
      active: pathname.startsWith(`${base}/validations`),
    },
    {
      href: `${base}/historique`,
      label: "Journal d'Actions",
      description: "Audit & restauration réversible",
      icon: History,
      active: pathname.startsWith(`${base}/historique`),
    },
    {
      href: `${base}/knowledge`,
      label: "Base RAG Souveraine",
      description: "BM25, vecteurs & preuves SHA-256",
      icon: BookOpenCheck,
      active: pathname.startsWith(`${base}/knowledge`),
    },
  ];

  if (hasPermission("users:manage")) {
    navItems.push({
      href: `${base}/users`,
      label: "Utilisateurs & Droits",
      description: "Validation comptes & RBAC",
      icon: UserCog,
      active: pathname.startsWith(`${base}/users`),
    });
  }

  const currentSpace = spaces.find((s) => s.id === spaceId);

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto bg-card border-r border-border">
      <div className="space-y-5 p-4">
        {/* Brand */}
        <div className="flex items-center justify-between gap-2 px-1">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck size={17} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-foreground">
                Misaina Cognition
              </p>
              <p className="truncate text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Console Souveraine
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Fermer le menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* Active Space & Switcher */}
        <div className="rounded-xl border border-border bg-background/70 p-3 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-primary font-semibold whitespace-nowrap shrink-0">
              <Lock size={11} /> Espace isolé
            </span>
            <span className="truncate max-w-[110px]" title={spaceId}>
              {spaceId}
            </span>
          </div>
          <p className="truncate text-xs font-semibold text-foreground">
            {currentSpace?.name || `Espace ${spaceId}`}
          </p>
          {spaces.length > 1 && (
            <select
              aria-label="Changer d'espace isolé"
              value={spaceId}
              onChange={(e) => {
                const nextId = encodeURIComponent(e.target.value);
                setMobileOpen(false);
                router.push(`/dashboard/${nextId}`);
              }}
              className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-medium text-foreground outline-none focus:border-primary"
            >
              {spaces.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name} ({sp.id})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Primary Module Navigation */}
        <nav className="space-y-1">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Modules de Gouvernance
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors border ${
                  item.active
                    ? "border-primary/25 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                <Icon
                  size={16}
                  className={`mt-0.5 shrink-0 ${
                    item.active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`truncate text-xs ${
                      item.active ? "font-semibold text-foreground" : "font-medium"
                    }`}
                  >
                    {item.label}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer: Platform Navigation, User, Theme, Logout */}
      <div className="border-t border-border p-4 space-y-3">
        <div className="space-y-1">
          <Link
            href="/workspace"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors whitespace-nowrap shrink-0"
          >
            <Layers size={14} /> Tous les espaces
          </Link>
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink size={14} /> Site vitrine public
          </Link>
        </div>

        {user && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5 text-[11px]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-bold text-primary">
              {getInitials(user.fullName)}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate font-semibold text-foreground">{user.fullName}</p>
                <span className="shrink-0 font-mono text-[9px] font-semibold uppercase text-primary">
                  {user.role}
                </span>
              </div>
              <p className="truncate font-mono text-[10px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            title="Basculer le thème clair/sombre"
          >
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
            <span>{isDark ? "Clair" : "Sombre"}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            title="Fermer la session"
          >
            <LogOut size={13} />
            <span>Quitter</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar Trigger */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-border bg-background p-1.5 text-foreground"
            aria-label="Ouvrir la barre latérale"
          >
            <Menu size={16} />
          </button>
          <span className="text-sm font-bold tracking-tight text-foreground">
            Misaina Cognition
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{spaceId}</span>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 h-full w-72 max-w-[85vw]">{sidebarContent}</aside>
        </div>
      )}

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-64">
        {sidebarContent}
      </aside>
    </>
  );
}
