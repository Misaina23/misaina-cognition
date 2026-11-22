"use client";

import Link from "next/link";
import { ArrowLeft, History, LayoutDashboard, ShieldCheck } from "lucide-react";

interface SpaceHeaderProps {
  spaceId: string;
  activeSection: "overview" | "validations" | "historique";
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

export function SpaceHeader({
  spaceId,
  activeSection,
  title,
  subtitle,
  actions,
}: SpaceHeaderProps) {
  const encoded = encodeURIComponent(spaceId);

  const navItems = [
    {
      key: "overview" as const,
      href: `/dashboard/${encoded}`,
      label: "Vue espace",
      icon: LayoutDashboard,
    },
    {
      key: "validations" as const,
      href: `/dashboard/${encoded}/validations`,
      label: "Validations",
      icon: ShieldCheck,
    },
    {
      key: "historique" as const,
      href: `/dashboard/${encoded}/historique`,
      label: "Historique",
      icon: History,
    },
  ];

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link
                href="/"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ArrowLeft size={13} /> Tous les espaces
              </Link>
              <span>/</span>
              <span className="font-mono text-foreground">{spaceId}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>

          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={14} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
