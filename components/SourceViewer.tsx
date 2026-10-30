"use client";
import { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Source } from "@/lib/types";

export function SourceViewer({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 border-t border-border/70 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
          <FileText size={13} className="text-primary" /> Sources citées ({sources.length})
        </span>
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {sources.map((s, i) => {
          const isSelected = expanded === i;
          return (
            <div
              key={i}
              className="rounded-lg border border-border bg-card/60 p-2.5 transition-colors hover:border-primary/40"
            >
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setExpanded(isSelected ? null : i)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {s.documentTitle}
                  </span>
                  {s.pageNumber !== undefined && (
                    <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
                      · p. {s.pageNumber}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground p-0.5">
                  {isSelected ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>

              {isSelected && s.excerpt && (
                <div className="mt-2 rounded-md bg-muted/70 p-2 text-xs text-foreground/90 font-mono leading-relaxed border-l-2 border-primary">
                  « {s.excerpt} »
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
