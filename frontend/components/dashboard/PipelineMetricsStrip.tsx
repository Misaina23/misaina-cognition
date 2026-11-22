"use client";

import { Clock, Cpu, Database, Mail, ShieldCheck } from "lucide-react";

interface PipelineMetricsStripProps {
  runsCount: number;
  nightlyCron?: string;
  recordsCount: number;
  totalLlmCalls: number;
  totalTokens: number;
  anomaliesCount: number;
  severityCounts: Record<"bloquante" | "a_verifier" | "mineure", number>;
  emailSummariesCount: number;
  actionsCount: number;
}

export function PipelineMetricsStrip({
  runsCount,
  nightlyCron,
  recordsCount,
  totalLlmCalls,
  totalTokens,
  anomaliesCount,
  severityCounts,
  emailSummariesCount,
  actionsCount,
}: PipelineMetricsStripProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-primary">
          <span>Orchestration</span>
          <Clock size={14} />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums">
          {runsCount} exécution(s)
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          Cron {nightlyCron || "0 2 * * *"} · Webhook actif
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-primary">
          <span>Base Terrain</span>
          <Database size={14} />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums">
          {recordsCount} fiche(s)
        </div>
        <p className="text-[11px] text-muted-foreground">
          CommCare / Kobo / CSV (bruts immuables)
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-primary">
          <span>Moteur Agent IA</span>
          <Cpu size={14} />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums">
          {totalLlmCalls} appel(s) LLM
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          Règles YAML &amp; Tool Use · {totalTokens.toLocaleString("fr-FR")} tok
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-primary">
          <span>Contrôle Qualité</span>
          <Mail size={14} />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums">
          {anomaliesCount} anomalie(s)
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">
          {severityCounts.bloquante} bloq · {severityCounts.a_verifier} vérif ·{" "}
          {emailSummariesCount} alerte(s)
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-primary">
          <span>Journal d&apos;Audit</span>
          <ShieldCheck size={14} />
        </div>
        <div className="text-xl font-bold font-mono tabular-nums">
          {actionsCount} action(s)
        </div>
        <p className="text-[11px] text-muted-foreground">
          Registre immuable &amp; rollback réversible
        </p>
      </div>
    </section>
  );
}
