"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import { Button, Modal, Input } from "@/components/ui";
import {
  Database,
  RefreshCw,
  Plus,
  CheckCircle2,
  Clock,
  Shield,
  Layers,
  ArrowUpRight,
  HardDrive,
  Activity,
  Server,
  Cloud,
} from "lucide-react";

interface Connector {
  id: string;
  name: string;
  type: string;
  status: "ACTIVE" | "SYNCING" | "IDLE" | "ERROR";
  documentsIndexed: number;
  frequency: string;
  lastSync: string;
  health: number;
  departmentAccess: string[];
}

export default function ConnectorsPage() {
  const qc = useQueryClient();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newConnName, setNewConnName] = useState("");
  const [newConnType, setNewConnType] = useState("sharepoint");
  const [newConnTenant, setNewConnTenant] = useState("");

  const { data: connectors = [], isLoading, refetch } = useQuery<Connector[]>({
    queryKey: ["connectors"],
    queryFn: () => api.get("/connectors").then((r) => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.post("/connectors", { id, action: "sync" }),
    onMutate: (id) => {
      setSyncingId(id);
    },
    onSuccess: () => {
      setTimeout(() => {
        setSyncingId(null);
        qc.invalidateQueries({ queryKey: ["connectors"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
        qc.invalidateQueries({ queryKey: ["audit"] });
      }, 1200);
    },
    onError: () => {
      setSyncingId(null);
    },
  });

  const totalDocs = connectors.reduce((acc, c) => acc + c.documentsIndexed, 0);

  function getConnectorTypeIcon(type: string) {
    switch (type) {
      case "sharepoint":
        return <HardDrive className="text-blue-500" size={22} />;
      case "google_drive":
        return <Cloud className="text-emerald-500" size={22} />;
      case "confluence":
        return <Layers className="text-indigo-500" size={22} />;
      case "sap":
        return <Server className="text-amber-500" size={22} />;
      case "servicenow":
        return <Activity className="text-teal-500" size={22} />;
      default:
        return <Database className="text-primary" size={22} />;
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Connecteurs SI & Sources de Données Entreprise
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Passerelles de synchronisation certifiées, ingestion continue et indexation vectorielle des silos documentaires.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setIsAddOpen(true)} className="shadow-sm">
            <Plus size={16} /> Ajouter une source
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="text-xs"
          >
            <RefreshCw size={13} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Connecteurs opérationnels"
          value={connectors.length}
          trend="100% connectés"
          hint="Passerelles actives"
          icon={Database}
        />
        <DashboardCard
          title="Documents synchronisés"
          value={totalDocs.toLocaleString("fr-FR")}
          trend="+14% ce mois"
          hint="Mise à jour incrémentale"
          icon={HardDrive}
        />
        <DashboardCard
          title="Disponibilité passerelle"
          value="99.85%"
          trend="SLA Entreprise"
          hint="Haute disponibilité"
          icon={Activity}
        />
        <DashboardCard
          title="Sécurité des échanges"
          value="mTLS 1.3"
          trend="Zero-Trust"
          hint="Chiffrement de bout en bout"
          icon={Shield}
        />
      </div>

      {/* Connectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {connectors.map((c) => {
          const isSyncing = syncingId === c.id || c.status === "SYNCING";
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4 hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                      {getConnectorTypeIcon(c.type)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-foreground leading-tight">
                        {c.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-mono">{c.frequency}</span>
                        <span aria-hidden="true">·</span>
                        <span>Santé {c.health}%</span>
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={12} /> Actif
                  </span>
                </div>

                <div className="rounded-xl bg-muted/40 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Volume indexé</span>
                    <span className="font-mono font-semibold text-foreground">
                      {c.documentsIndexed} documents
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dernière synchro</span>
                    <span className="font-mono text-muted-foreground">
                      {new Date(c.lastSync).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium block">
                    Périmètres habilités
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {c.departmentAccess.map((dept, idx) => (
                      <span
                        key={idx}
                        className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground"
                      >
                        {dept}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-mono">
                  ID: {c.id}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate(c.id)}
                  disabled={isSyncing}
                  className="text-xs h-8"
                >
                  <RefreshCw
                    size={12}
                    className={isSyncing ? "animate-spin text-primary" : ""}
                  />
                  {isSyncing ? "Synchronisation…" : "Synchroniser"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Connector Modal */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Ajouter un Connecteur d'Entreprise"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setIsAddOpen(false);
              setNewConnName("");
              setNewConnTenant("");
            }}
            className="space-y-4 text-xs"
          >
            <p className="text-muted-foreground">
              Configurez une passerelle sécurisée pour ingérer automatiquement les bases documentaires de votre organisation.
            </p>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Type de source</label>
              <select
                value={newConnType}
                onChange={(e) => setNewConnType(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="sharepoint">Microsoft 365 / SharePoint</option>
                <option value="google_drive">Google Workspace Enterprise</option>
                <option value="confluence">Atlassian Confluence</option>
                <option value="sap">SAP S/4HANA Knowledge</option>
                <option value="servicenow">ServiceNow ITIL</option>
                <option value="snowflake">Snowflake / Data Lakehouse</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Nom d&apos;affichage</label>
              <Input
                placeholder="Ex: SharePoint Direction Juridique"
                value={newConnName}
                onChange={(e) => setNewConnName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Tenant ID / Identifiant d&apos;organisation</label>
              <Input
                placeholder="Ex: 8f4e2b10-6c9a-4123-bc94-0192837465aa"
                value={newConnTenant}
                onChange={(e) => setNewConnTenant(e.target.value)}
                required
              />
            </div>

            <div className="rounded-xl bg-muted/60 p-3 text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground block mb-0.5">Sécurité des flux</span>
              L&apos;agent de synchronisation utilise un tunnel TLS 1.3 avec jeton OAuth2 restreint en lecture seule. Aucune écriture n&apos;est autorisée sur vos environnements sources.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit">
                Établir la liaison sécurisée
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
