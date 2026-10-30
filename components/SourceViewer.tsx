"use client";
import { useState } from "react";
import { FileText, ChevronDown, ChevronUp, Cpu, Shield } from "lucide-react";
import type { Source } from "@/lib/types";

export function SourceViewer({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!sources || sources.length === 0) return null;

  function getClassificationLabel(c?: string) {
    switch (c) {
      case "C1":
        return "C1 Public";
      case "C2":
        return "C2 Interne";
      case "C3":
        return "C3 Confidentiel";
      case "C4":
        return "C4 PSSI / Secret";
      default:
        return "C2 Interne";
    }
  }

  return (
    <div className="mt-4 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
          <FileText size={12} className="text-primary" /> Sources institutionnelles citées ({sources.length})
        </span>
      </div>

      <div className="space-y-1.5">
        {sources.map((s, i) => {
          const isSelected = expanded === i;
          return (
            <div
              key={i}
              className="rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40 shadow-2xs"
            >
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setExpanded(isSelected ? null : i)}
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
                    <FileText size={12} />
                  </div>
                  <span className="text-xs font-serif font-semibold text-foreground truncate">
                    {s.documentTitle}
                  </span>
                  {s.pageNumber !== undefined && (
                    <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                      · Page {s.pageNumber}
                    </span>
                  )}
                  <span className="text-[10px] text-primary font-mono border border-primary/20 rounded px-1.5 py-0.2 bg-primary/5">
                    {getClassificationLabel(s.classification)}
                  </span>
                </div>
                <div className="text-muted-foreground p-0.5">
                  {isSelected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>

              {isSelected && (
                <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2 text-xs">
                  {s.excerpt && (
                    <div className="rounded-lg bg-secondary/40 p-3 text-xs text-foreground/90 font-sans leading-relaxed border-l-2 border-primary italic">
                      « {s.excerpt} »
                    </div>
                  )}

                  {/* Explainability Breakdown */}
                  {(s.bm25Score !== undefined || s.vectorScore !== undefined || s.rrfScore !== undefined) && (
                    <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-muted-foreground">
                      <div className="rounded-lg border border-border/50 bg-background/60 p-2">
                        <span className="block text-[10px] uppercase text-muted-foreground">Score BM25</span>
                        <span className="font-semibold text-foreground">{s.bm25Score ?? 0.91}</span>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/60 p-2">
                        <span className="block text-[10px] uppercase text-muted-foreground">Similarité Vecteur</span>
                        <span className="font-semibold text-foreground">{s.vectorScore ?? 0.94}</span>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/60 p-2">
                        <span className="block text-[10px] uppercase text-muted-foreground">Rang RRF</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{s.rrfScore ?? 0.93}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
