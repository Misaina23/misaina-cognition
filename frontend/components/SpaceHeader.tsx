"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useSession } from "@/components/SessionProvider";

interface SpaceHeaderProps {
  spaceId: string;
  spaceName?: string;
  activeSection: "overview" | "knowledge" | "validations" | "historique" | "users";
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}

const SECTION_LABELS: Record<SpaceHeaderProps["activeSection"], string> = {
  overview: "Agent IA & Contrôle",
  knowledge: "Base RAG Souveraine",
  validations: "Validations Humaines",
  historique: "Journal d'Actions",
  users: "Utilisateurs & Droits",
};

export function SpaceHeader({
  spaceId,
  spaceName,
  activeSection,
  title,
  subtitle,
  actions,
}: SpaceHeaderProps) {
  const { spaces } = useSession();
  const resolvedSpaceName =
    spaceName || spaces.find((s) => s.id === spaceId)?.name || spaceId;

  return (
    <header className="border-b border-border bg-card/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <nav
            aria-label="Fil d'Ariane"
            className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
          >
            <Link href="/workspace" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
              Espaces
            </Link>
            <ChevronRight size={12} className="shrink-0 opacity-60" />
            <span className="truncate max-w-[240px] text-foreground">{resolvedSpaceName}</span>
            <ChevronRight size={12} className="shrink-0 opacity-60" />
            <span className="text-primary font-semibold whitespace-nowrap shrink-0">
              {SECTION_LABELS[activeSection]}
            </span>
          </nav>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground max-w-3xl">{subtitle}</p>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
