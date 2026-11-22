"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import { Button } from "@/components/ui";
import type { DocumentDiffItem } from "@/lib/types";
import {
  FileDiff,
  FileText,
  Calendar,
  Building,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  History,
  Sparkles,
} from "lucide-react";

export default function DiffPage() {
  const { data: diffs = [], isLoading } = useQuery<DocumentDiffItem[]>({
    queryKey: ["diffs"],
    queryFn: () => api.get("/diff").then((r) => r.data),
  });

  const [selectedId, setSelectedId] = useState<string>("diff-1");

  const currentDiff = diffs.find((d) => d.id === selectedId) || diffs[0];

  function getImpactBadge(impact: string) {
    switch (impact) {
      case "MAJEUR":
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle size={12} /> Impact Majeur
          </span>
        );
      case "CONFORMITE":
        return (
          <span className="inline-flex items-center gap-1 font-semibold text-[11px] text-primary">
            <CheckCircle2 size={12} /> Conformité PSSI
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 font-medium text-[11px] text-muted-foreground">
            Ajustement Mineur
          </span>
        );
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Comparateur de Versions & Diff Sémantique
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyse d&apos;impact des révisions documentaires, identification des durcissements de règles et traçabilité des politiques internes.
          </p>
        </div>

        <Link href="/chat">
          <Button size="sm" className="shadow-sm">
            <Sparkles size={14} /> Interroger les écarts dans le Chat
          </Button>
        </Link>
      </div>

      {/* Revisions Selector */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {diffs.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelectedId(d.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              selectedId === d.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <FileDiff size={15} />
            <span>{d.documentTitle}</span>
            <span className="font-mono text-[10px] opacity-80">
              ({d.previousVersion} → {d.currentVersion})
            </span>
          </button>
        ))}
      </div>

      {currentDiff && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building size={14} />
                <span className="font-semibold text-foreground">{currentDiff.department}</span>
                <span aria-hidden="true">·</span>
                <Calendar size={14} />
                <span>Publié le {new Date(currentDiff.date).toLocaleDateString("fr-FR")}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{currentDiff.previousVersion} vers {currentDiff.currentVersion}</span>
              </div>

              <span className="text-xs font-mono text-primary font-semibold">
                {currentDiff.diffItems.length} articles modifiés
              </span>
            </div>

            <p className="text-sm text-foreground leading-relaxed">
              {currentDiff.changesSummary}
            </p>
          </div>

          {/* Diff Items List */}
          <div className="space-y-4">
            <h3 className="font-bold text-base text-foreground">
              Détail des modifications article par article
            </h3>

            {currentDiff.diffItems.map((item, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
                  <span className="font-semibold text-xs text-foreground">
                    {item.section}
                  </span>
                  <div>{getImpactBadge(item.impact)}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
                  {/* Previous version */}
                  <div className="p-5 space-y-1.5 bg-red-500/[0.02]">
                    <span className="text-[11px] font-mono font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider block">
                      Version antérieure ({currentDiff.previousVersion})
                    </span>
                    <p className="text-xs text-muted-foreground line-through decoration-red-400 leading-relaxed font-mono">
                      {item.previousText || "Article inexistant dans la version antérieure."}
                    </p>
                  </div>

                  {/* Current version */}
                  <div className="p-5 space-y-1.5 bg-emerald-500/[0.02]">
                    <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                      Version en vigueur ({currentDiff.currentVersion})
                    </span>
                    <p className="text-xs text-foreground leading-relaxed font-mono font-medium">
                      {item.currentText}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
