"use client";
import { FileText } from "lucide-react";
import type { Source } from "@/lib/types";

export function SourceViewer({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-3 border-t border-border/40 pt-2">
      <p className="mb-1 text-xs font-semibold">Sources :</p>
      <ul className="space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <FileText size={14} className="mt-0.5 text-primary" />
            <span>
              <span className="font-medium">{s.documentTitle}</span>
              {s.pageNumber && <> — Page {s.pageNumber}</>}
              {s.excerpt && <span className="block text-muted-foreground">« {s.excerpt} »</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
