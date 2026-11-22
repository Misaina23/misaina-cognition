"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Database,
  GitMerge,
  History,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import type { Anomaly, DataRun, DataSourceConfig, NormalizedRecord } from "@/lib/guardian/types";

export default function SpaceDashboardPage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const qc = useQueryClient();

  const runsQuery = useQuery<{ runs: DataRun[]; anomalies: Anomaly[] }>({
    queryKey: ["space-runs", spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => api.get("/guardian/runs", { params: { spaceId } }).then((r) => r.data),
  });

  const connectorsQuery = useQuery<{ sources: DataSourceConfig[] }>({
    queryKey: ["space-connectors", spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => api.get("/guardian/connectors", { params: { spaceId } }).then((r) => r.data),
  });

  const recordsQuery = useQuery<{ records: NormalizedRecord[] }>({
    queryKey: ["space-records", spaceId],
    enabled: Boolean(spaceId),
    queryFn: () =>
      api
        .get("/guardian/records", { params: { spaceId, includeArchived: "true" } })
        .then((r) => r.data),
  });

  const runMutation = useMutation({
    mutationFn: () => api.post("/guardian/runs", { spaceId, mode: "agent" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-runs", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-records", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-connectors", spaceId] });
    },
  });

  const runs = runsQuery.data?.runs ?? [];
  const anomalies = runsQuery.data?.anomalies ?? [];
  const sources = connectorsQuery.data?.sources ?? [];
  const records = recordsQuery.data?.records ?? [];
  const latestRun = runs[0];
  const recovered = records.filter((r) => r.status === "merged" || r.status === "archived").length;

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/guardian" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft size={13} /> Gardien de données
            </Link>
            <span>/</span>
            <span className="font-mono text-foreground">{spaceId}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Espace {spaceId} — Runs, Doublons & Anomalies
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/${encodeURIComponent(spaceId)}/validations`}>
            <Button variant="outline" size="sm">
              <ShieldCheck size={14} /> Validations
            </Button>
          </Link>
          <Link href={`/dashboard/${encodeURIComponent(spaceId)}/historique`}>
            <Button variant="outline" size="sm">
              <History size={14} /> Historique
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            <Play size={14} /> {runMutation.isPending ? "Analyse…" : "Lancer un run"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              runsQuery.refetch();
              recordsQuery.refetch();
            }}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {runsQuery.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          Accès refusé ou espace introuvable pour ce tenant.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Sources connectées"
          value={sources.length}
          hint="CSV, Excel, CommCare, Kobo/ODK"
          icon={Database}
        />
        <DashboardCard
          title="Enregistrements"
          value={records.length}
          trend={latestRun ? `${latestRun.recordsProcessed} traités` : undefined}
          hint="Brut conservé intact"
          icon={Activity}
        />
        <DashboardCard
          title="Doublons détectés"
          value={latestRun?.duplicatesFound ?? 0}
          hint="Exacts + quasi-doublons"
          icon={GitMerge}
        />
        <DashboardCard
          title="Lignes nettoyées"
          value={recovered}
          hint="Fusionnées ou archivées"
          icon={Archive}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Historique des runs</CardTitle>
            <CardDescription>Exécutions déclenchées par dépôt, API ou tâche nocturne.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun run enregistré sur cet espace.</p>
            ) : (
              runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl border border-border p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-foreground">{run.id}</span>
                    <Badge variant={run.status === "completed" ? "success" : "warning"}>
                      {run.status}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground font-mono text-[11px]">
                    Déclencheur : {run.trigger} · Traités : {run.recordsProcessed} · Auto :{" "}
                    {run.autoActionsCount} · Validation : {run.pendingValidationsCount}
                  </div>
                  {run.summaryText && <p className="text-foreground">{run.summaryText}</p>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              Anomalies détectées ({anomalies.length})
            </CardTitle>
            <CardDescription>
              Règles YAML, doublons et comparaison coordonnées vs zone d&apos;intervention.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
            {anomalies.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 size={15} /> Aucune anomalie ouverte sur cet espace.
              </div>
            ) : (
              anomalies.map((an) => (
                <div key={an.id} className="rounded-xl border border-border p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={an.severity === "bloquante" ? "warning" : "outline"}>
                      {an.severity}
                    </Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {an.ruleId} · {an.status}
                    </span>
                  </div>
                  <p className="text-foreground">{an.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
