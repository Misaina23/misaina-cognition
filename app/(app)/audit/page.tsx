"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import { Button, Modal } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import {
  ShieldCheck,
  ShieldAlert,
  Download,
  Filter,
  FileSpreadsheet,
  FileCode,
  Clock,
  KeyRound,
  Eye,
  RefreshCw,
} from "lucide-react";

interface AuditItem {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  department: string;
  action: string;
  queryOrTarget: string;
  dlpStatus: "CONFORME" | "PII_MASQUE" | "RESTREINT";
  dlpDetails?: string;
  sourcesCount: number;
  latencyMs: number;
  hashSignature: string;
}

interface AuditResponse {
  total: number;
  conformeCount: number;
  piiCount: number;
  logs: AuditItem[];
}

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [dlpFilter, setDlpFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [selectedAudit, setSelectedAudit] = useState<AuditItem | null>(null);

  const { data, refetch, isFetching } = useQuery<AuditResponse>({
    queryKey: ["audit", dlpFilter, actionFilter, q],
    queryFn: () =>
      api
        .get("/audit", {
          params: { dlp: dlpFilter, action: actionFilter, q },
        })
        .then((r) => r.data),
  });

  const logs = data?.logs || [];

  function exportCSV() {
    if (!logs.length) return;
    const headers = [
      "ID",
      "Timestamp",
      "Utilisateur",
      "Departement",
      "Action",
      "Requete_ou_Cible",
      "Statut_DLP",
      "Latence_ms",
      "Signature_SHA256",
    ];
    const rows = logs.map((l) => [
      l.id,
      l.timestamp,
      `"${l.userName}"`,
      `"${l.department}"`,
      l.action,
      `"${l.queryOrTarget.replace(/"/g, '""')}"`,
      l.dlpStatus,
      l.latencyMs,
      l.hashSignature,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `misaina_audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function getActionLabel(action: string) {
    switch (action) {
      case "SEARCH_QUERY":
        return "Requête RAG";
      case "DOC_UPLOAD":
        return "Import Document";
      case "SYNTHESIS_EXPORT":
        return "Synthèse .docx";
      case "CONNECTOR_SYNC":
        return "Synchronisation SI";
      default:
        return action;
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Journal d&apos;Audit & Traçabilité Cryptographique
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gouvernance des requêtes, conformité PSSI, détection DLP des données sensibles et empreintes SHA-256.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="text-xs"
          >
            <Download size={14} /> Exporter le rapport CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Événements tracés"
          value={data?.total ?? logs.length}
          trend="Conservation 365 jours"
          hint="Journal infalsifiable"
          icon={Clock}
        />
        <DashboardCard
          title="Contrôles DLP conformes"
          value={data?.conformeCount ?? logs.filter((l) => l.dlpStatus === "CONFORME").length}
          trend="Zéro fuite détectée"
          hint="Données protégées"
          icon={ShieldCheck}
        />
        <DashboardCard
          title="Événements PII masqués"
          value={data?.piiCount ?? logs.filter((l) => l.dlpStatus === "PII_MASQUE").length}
          trend="Sanitisation active"
          hint="Protection de la vie privée"
          icon={ShieldAlert}
        />
        <DashboardCard
          title="Chiffrement des requêtes"
          value="TLS 1.3"
          trend="SHA-256 attesté"
          hint="Souveraineté des flux"
          icon={KeyRound}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <SearchBar
            onSearch={setQ}
            placeholder="Rechercher par utilisateur, département, requête ou empreinte…"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 border border-border p-1 rounded-lg bg-card text-xs">
            <span className="px-2 text-muted-foreground font-medium">DLP :</span>
            {[
              { id: "ALL", label: "Tous" },
              { id: "CONFORME", label: "Conforme" },
              { id: "PII_MASQUE", label: "PII Masqué" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setDlpFilter(f.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  dlpFilter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border border-border p-1 rounded-lg bg-card text-xs">
            <span className="px-2 text-muted-foreground font-medium">Type :</span>
            {[
              { id: "ALL", label: "Tous" },
              { id: "SEARCH_QUERY", label: "Requêtes" },
              { id: "SYNTHESIS_EXPORT", label: "Fiches" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActionFilter(f.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  actionFilter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Horodatage</th>
                <th className="py-3 px-4">Collaborateur</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Requête / Cible</th>
                <th className="py-3 px-4">Contrôle DLP</th>
                <th className="py-3 px-4 text-right">Latence</th>
                <th className="py-3 px-4 text-right">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    Aucun événement d&apos;audit ne correspond aux critères sélectionnés.
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-semibold text-foreground">{item.userName}</p>
                      <p className="text-[11px] text-muted-foreground">{item.department}</p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-foreground">
                        {getActionLabel(item.action)}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate text-foreground font-medium" title={item.queryOrTarget}>
                      {item.queryOrTarget}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.dlpStatus === "CONFORME" ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck size={13} /> Conforme PSSI
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400" title={item.dlpDetails}>
                          <ShieldAlert size={13} /> PII Sanitisé
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {item.latencyMs} ms
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedAudit(item)}
                        className="text-xs h-7 px-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <Eye size={12} className="mr-1" /> Inspecter
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Detail Modal */}
      {selectedAudit && (
        <Modal
          isOpen={!!selectedAudit}
          onClose={() => setSelectedAudit(null)}
          title="Preuve Cryptographique d'Audit"
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-xl bg-muted/50 p-3 space-y-2 border border-border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identifiant d&apos;audit</span>
                <span className="font-mono font-semibold text-foreground">{selectedAudit.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date et heure</span>
                <span className="font-mono text-foreground">{new Date(selectedAudit.timestamp).toLocaleString("fr-FR")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collaborateur</span>
                <span className="font-medium text-foreground">{selectedAudit.userName} ({selectedAudit.userEmail})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Département autorisé</span>
                <span className="font-medium text-foreground">{selectedAudit.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Action d&apos;inférence</span>
                <span className="font-medium text-foreground">{selectedAudit.action}</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Requête soumise</span>
              <div className="rounded-xl border border-border bg-card p-3 font-mono leading-relaxed text-foreground">
                {selectedAudit.queryOrTarget}
              </div>
            </div>

            {selectedAudit.dlpDetails && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-600 dark:text-amber-400">
                <p className="font-semibold mb-0.5">Détail du contrôle DLP</p>
                <p>{selectedAudit.dlpDetails}</p>
              </div>
            )}

            <div className="space-y-1">
              <span className="text-muted-foreground font-semibold">Empreinte d&apos;intégrité SHA-256</span>
              <div className="rounded-xl border border-border bg-muted/60 p-2.5 font-mono text-[11px] break-all select-all text-primary">
                {selectedAudit.hashSignature}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedAudit(null)} variant="default">
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
