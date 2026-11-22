"use client";

import { useEffect, useState } from "react";
import { Cpu, Database, Server } from "lucide-react";
import { guardianApi, type HealthStatus } from "@/lib/api";

export function SystemDiagnosticsCard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    guardianApi
      .getHealth()
      .then((res) => {
        if (active) setHealth(res);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (unavailable || !health) return null;

  const storageLabel =
    health.storage === "postgresql"
      ? "PostgreSQL persistant"
      : "Mémoire locale & disque atomique";

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <Server size={14} className="text-primary shrink-0" />
        <span>Infrastructure active</span>
      </div>
      <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Database size={12} className="text-primary" />
          Stockage : <strong className="text-foreground">{storageLabel}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cpu size={12} className="text-primary" />
          Modèle LLM :{" "}
          <strong className="text-foreground">
            {health.llmProvider}/{health.llmModel}
          </strong>
        </span>
        <span className="tabular-nums">
          Disponibilité :{" "}
          <strong className="text-foreground">{health.uptimeSec.toLocaleString("fr-FR")} s</strong>
        </span>
      </div>
    </section>
  );
}
