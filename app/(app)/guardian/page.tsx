"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  CheckCircle2,
  Database,
  FileCode2,
  FileSpreadsheet,
  FolderKanban,
  GitMerge,
  MoonStar,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Upload,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useSpaceStore } from "@/lib/store";
import { DashboardCard } from "@/components/DashboardCard";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Modal,
  Textarea,
} from "@/components/ui";
import type {
  AgentAction,
  Anomaly,
  AnomalySeverity,
  DataRun,
  DataSourceConfig,
  NormalizedRecord,
  UserSpace,
  ValidationItem,
} from "@/lib/guardian/types";

type ActiveTab = "operations" | "anomalies" | "rules";

interface SpacesResponse {
  tenantId: string;
  userId: string;
  spaces: UserSpace[];
}

interface ConnectorsResponse {
  tenantId: string;
  spaceId: string;
  sources: DataSourceConfig[];
}

interface RunsResponse {
  tenantId: string;
  spaceId: string;
  runs: DataRun[];
  anomalies: Anomaly[];
}

interface ValidationsResponse {
  tenantId: string;
  spaceId: string;
  validations: ValidationItem[];
}

interface ActionsResponse {
  tenantId: string;
  spaceId: string;
  actions: AgentAction[];
}

interface RecordsResponse {
  tenantId: string;
  spaceId: string;
  total: number;
  records: NormalizedRecord[];
}

interface RulesResponse {
  tenantId: string;
  spaceId: string;
  rawYaml: string;
}

const SAMPLE_KOBO_ITEMS = JSON.stringify(
  [
    {
      _id: "kobo-ui-101",
      nom_complet: "Kadiatou Traoré",
      telephone: "+221776001122",
      age: 31,
      _geolocation: [14.7167, -17.4677],
      zone: "Dakar",
    },
    {
      _id: "kobo-ui-102",
      nom_complet: "Kadiatou Traoré",
      telephone: "00221776001122",
      age: 31,
      _geolocation: [14.7167, -17.4677],
      zone: "Dakar",
    },
    {
      _id: "kobo-ui-103",
      nom_complet: "Binta Diouf",
      telephone: "+221778889900",
      age: 162,
      _geolocation: [0, 0],
      zone: "Kaolack",
    },
  ],
  null,
  2
);

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function severityBadgeVariant(severity: AnomalySeverity): "warning" | "default" | "outline" {
  if (severity === "bloquante") return "warning";
  if (severity === "a_verifier") return "outline";
  return "default";
}

function runStatusLabel(status: DataRun["status"]): string {
  switch (status) {
    case "completed":
      return "Terminé";
    case "awaiting_validation":
      return "En attente de validation";
    case "aborted_guardrail":
      return "Arrêté (garde-fou)";
    case "failed":
      return "Échec";
    default:
      return "En cours";
  }
}

export default function GuardianPage() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const { selectedSpaceId, setSpaceId } = useSpaceStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>("operations");
  const [severityFilter, setSeverityFilter] = useState<"all" | AnomalySeverity>("all");
  const [statusBanner, setStatusBanner] = useState<{
    kind: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [liveSseMessage, setLiveSseMessage] = useState<string | null>(null);

  // États modaux
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");

  const [isConnectorModalOpen, setIsConnectorModalOpen] = useState(false);
  const [connName, setConnName] = useState("");
  const [connType, setConnType] = useState<"commcare" | "generic">("generic");
  const [connFormat, setConnFormat] = useState<"json" | "kobo" | "odk">("kobo");
  const [connEndpoint, setConnEndpoint] = useState("");
  const [connTokenEnv, setConnTokenEnv] = useState("KOBO_API_TOKEN");

  const [isJsonIngestOpen, setIsJsonIngestOpen] = useState(false);
  const [jsonSourceId, setJsonSourceId] = useState("");
  const [jsonPayloadText, setJsonPayloadText] = useState(SAMPLE_KOBO_ITEMS);

  // Import CSV / Excel
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [columnMappingText, setColumnMappingText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Éditeur YAML
  const [yamlDraft, setYamlDraft] = useState("");

  // 1. Liste des espaces autorisés pour le tenant de l'utilisateur
  const spacesQuery = useQuery<SpacesResponse>({
    queryKey: ["guardian-spaces"],
    queryFn: () => api.get("/guardian/spaces").then((r) => r.data),
  });

  const activeSpaceId = useMemo(() => {
    const list = spacesQuery.data?.spaces || [];
    if (selectedSpaceId && list.some((s) => s.id === selectedSpaceId)) {
      return selectedSpaceId;
    }
    return list[0]?.id || "";
  }, [spacesQuery.data?.spaces, selectedSpaceId]);

  useEffect(() => {
    if (activeSpaceId && activeSpaceId !== selectedSpaceId) {
      setSpaceId(activeSpaceId);
    }
  }, [activeSpaceId, selectedSpaceId, setSpaceId]);

  // 2. Requêtes scopées par (tenantId, spaceId)
  const connectorsQuery = useQuery<ConnectorsResponse>({
    queryKey: ["guardian-connectors", activeSpaceId],
    enabled: Boolean(activeSpaceId),
    queryFn: () =>
      api.get("/guardian/connectors", { params: { spaceId: activeSpaceId } }).then((r) => r.data),
  });

  const runsQuery = useQuery<RunsResponse>({
    queryKey: ["guardian-runs", activeSpaceId],
    enabled: Boolean(activeSpaceId),
    queryFn: () =>
      api.get("/guardian/runs", { params: { spaceId: activeSpaceId } }).then((r) => r.data),
  });

  const validationsQuery = useQuery<ValidationsResponse>({
    queryKey: ["guardian-validations", activeSpaceId],
    enabled: Boolean(activeSpaceId),
    queryFn: () =>
      api.get("/guardian/validations", { params: { spaceId: activeSpaceId } }).then((r) => r.data),
  });

  const actionsQuery = useQuery<ActionsResponse>({
    queryKey: ["guardian-actions", activeSpaceId],
    enabled: Boolean(activeSpaceId),
    queryFn: () =>
      api.get("/guardian/actions", { params: { spaceId: activeSpaceId } }).then((r) => r.data),
  });

  const recordsQuery = useQuery<RecordsResponse>({
    queryKey: ["guardian-records", activeSpaceId],
    enabled: Boolean(activeSpaceId),
    queryFn: () =>
      api
        .get("/guardian/records", {
          params: { spaceId: activeSpaceId, includeArchived: "true" },
        })
        .then((r) => r.data),
  });

  const rulesQuery = useQuery<RulesResponse>({
    queryKey: ["guardian-rules", activeSpaceId],
    enabled: Boolean(activeSpaceId),
    queryFn: () =>
      api.get("/guardian/rules", { params: { spaceId: activeSpaceId } }).then((r) => r.data),
  });

  useEffect(() => {
    if (rulesQuery.data?.rawYaml !== undefined) {
      setYamlDraft(rulesQuery.data.rawYaml);
    }
  }, [rulesQuery.data?.rawYaml, activeSpaceId]);

  function invalidateGuardianSpace() {
    qc.invalidateQueries({ queryKey: ["guardian-connectors", activeSpaceId] });
    qc.invalidateQueries({ queryKey: ["guardian-runs", activeSpaceId] });
    qc.invalidateQueries({ queryKey: ["guardian-validations", activeSpaceId] });
    qc.invalidateQueries({ queryKey: ["guardian-actions", activeSpaceId] });
    qc.invalidateQueries({ queryKey: ["guardian-records", activeSpaceId] });
    qc.invalidateQueries({ queryKey: ["guardian-rules", activeSpaceId] });
  }

  // Écoute SSE des événements temps réel (résumé de fin de run, ingestions)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource("/api/notifications/stream");
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { type?: string; message?: string };
        if (parsed.type === "guardian_summary" || parsed.type === "guardian_ingest") {
          setLiveSseMessage(parsed.message || "Mise à jour du Gardien reçue.");
          qc.invalidateQueries({ queryKey: ["guardian-runs"] });
          qc.invalidateQueries({ queryKey: ["guardian-actions"] });
          qc.invalidateQueries({ queryKey: ["guardian-validations"] });
        }
      } catch {
        // Ignore ping ou format non JSON
      }
    };
    return () => {
      es.close();
    };
  }, [qc]);

  // Mutations
  const createSpaceMutation = useMutation({
    mutationFn: () =>
      api.post("/guardian/spaces", { name: newSpaceName.trim(), description: newSpaceDesc.trim() }),
    onSuccess: (res) => {
      const created = res.data?.space as UserSpace | undefined;
      qc.invalidateQueries({ queryKey: ["guardian-spaces"] });
      if (created?.id) setSpaceId(created.id);
      setIsSpaceModalOpen(false);
      setNewSpaceName("");
      setNewSpaceDesc("");
      setStatusBanner({
        kind: "success",
        text: `Espace « ${created?.name || ""} » créé avec isolation stricte.`,
      });
    },
    onError: () => {
      setStatusBanner({ kind: "error", text: "Impossible de créer cet espace." });
    },
  });

  const triggerRunMutation = useMutation({
    mutationFn: (mode: "agent" | "nightly") =>
      api.post("/guardian/runs", { spaceId: activeSpaceId, mode }),
    onSuccess: (res, mode) => {
      invalidateGuardianSpace();
      if (mode === "nightly") {
        setStatusBanner({
          kind: "success",
          text: `Tâche nocturne exécutée sur ${res.data?.spacesChecked ?? 1} espace(s).`,
        });
      } else {
        const run = res.data?.run as DataRun | undefined;
        setStatusBanner({
          kind: "success",
          text: `Run ${run?.id || ""} terminé (${run?.autoActionsCount ?? 0} actions auto, ${run?.pendingValidationsCount ?? 0} en validation).`,
        });
      }
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Échec lors du lancement du contrôle.";
      setStatusBanner({ kind: "error", text: message });
    },
  });

  const validationDecisionMutation = useMutation({
    mutationFn: ({
      validationId,
      decision,
    }: {
      validationId: string;
      decision: "approved" | "rejected";
    }) =>
      api.post("/guardian/validations", {
        spaceId: activeSpaceId,
        validationId,
        decision,
      }),
    onSuccess: (_, vars) => {
      invalidateGuardianSpace();
      setStatusBanner({
        kind: "success",
        text:
          vars.decision === "approved"
            ? "Action validée et appliquée de façon réversible."
            : "Proposition rejetée ; aucune donnée modifiée.",
      });
    },
    onError: () => {
      setStatusBanner({ kind: "error", text: "Impossible de traiter cette validation." });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (actionId: string) =>
      api.post("/guardian/actions", { spaceId: activeSpaceId, actionId }),
    onSuccess: () => {
      invalidateGuardianSpace();
      setStatusBanner({
        kind: "success",
        text: "Action annulée : l'état antérieur des enregistrements a été restauré.",
      });
    },
    onError: () => {
      setStatusBanner({ kind: "error", text: "Impossible d'annuler cette action." });
    },
  });

  const registerConnectorMutation = useMutation({
    mutationFn: () =>
      api.post("/guardian/connectors", {
        action: "register",
        spaceId: activeSpaceId,
        name: connName.trim(),
        type: connType,
        format: connType === "generic" ? connFormat : undefined,
        endpointUrl: connEndpoint.trim() || undefined,
        authTokenEnvName: connTokenEnv.trim() || undefined,
      }),
    onSuccess: () => {
      invalidateGuardianSpace();
      setIsConnectorModalOpen(false);
      setConnName("");
      setConnEndpoint("");
      setStatusBanner({
        kind: "success",
        text: "Connecteur enregistré dans l'espace courant.",
      });
    },
    onError: () => {
      setStatusBanner({ kind: "error", text: "Paramètres du connecteur invalides." });
    },
  });

  const jsonIngestMutation = useMutation({
    mutationFn: () => {
      const items = JSON.parse(jsonPayloadText);
      if (!Array.isArray(items)) {
        throw new Error("Le JSON doit être un tableau d'objets.");
      }
      return api.post("/guardian/connectors", {
        action: "ingest",
        spaceId: activeSpaceId,
        sourceId: jsonSourceId,
        rawItems: items,
      });
    },
    onSuccess: (res) => {
      invalidateGuardianSpace();
      setIsJsonIngestOpen(false);
      const r = res.data?.result;
      setStatusBanner({
        kind: "success",
        text: `Ingestion terminée : ${r?.insertedCount ?? 0} insérés, ${r?.skippedIdempotentCount ?? 0} ignorés (idempotence), ${r?.anomaliesCount ?? 0} anomalies.`,
      });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
          ?.message ||
        (err as Error)?.message ||
        "Échec de l'ingestion JSON.";
      setStatusBanner({ kind: "error", text: msg });
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: () => api.put("/guardian/rules", { spaceId: activeSpaceId, yaml: yamlDraft }),
    onSuccess: () => {
      invalidateGuardianSpace();
      setStatusBanner({
        kind: "success",
        text: "Règles YAML validées et enregistrées pour cet espace.",
      });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "YAML invalide : vérifiez la syntaxe et les seuils.";
      setStatusBanner({ kind: "error", text: msg });
    },
  });

  async function handleFileUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !activeSpaceId) return;
    setUploading(true);
    setStatusBanner(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("spaceId", activeSpaceId);
      if (columnMappingText.trim()) {
        formData.append("columnMapping", columnMappingText.trim());
      }

      const response = await fetch("/api/guardian/ingest/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Erreur lors de l'import du fichier");
      }

      invalidateGuardianSpace();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatusBanner({
        kind: "success",
        text: `Fichier « ${payload.fileName} » (${payload.detectedEncoding || "binaire"}) : ${payload.insertedCount} lignes insérées, ${payload.skippedIdempotentCount} doublons idempotents ignorés, ${payload.anomaliesCount} anomalies.`,
      });
    } catch (err) {
      setStatusBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Erreur lors de l'import",
      });
    } finally {
      setUploading(false);
    }
  }

  // Agrégations pour le tableau de bord
  const spaces = spacesQuery.data?.spaces || [];
  const sources = connectorsQuery.data?.sources || [];
  const runs = runsQuery.data?.runs || [];
  const anomalies = useMemo(() => runsQuery.data?.anomalies ?? [], [runsQuery.data?.anomalies]);
  const validations = validationsQuery.data?.validations || [];
  const actions = actionsQuery.data?.actions || [];
  const records = recordsQuery.data?.records || [];

  const latestRun = runs[0];
  const pendingValidations = validations.filter((v) => v.status === "pending");
  const recoveredRecordsCount = records.filter(
    (r) => r.status === "merged" || r.status === "archived"
  ).length;
  const activeRecordsCount = records.filter((r) => r.status === "active").length;

  const openAnomaliesBySeverity = useMemo(() => {
    const counts: Record<AnomalySeverity, number> = {
      bloquante: 0,
      a_verifier: 0,
      mineure: 0,
    };
    for (const a of anomalies) {
      if (a.status === "open" || a.status === "pending_validation") {
        counts[a.severity] = (counts[a.severity] || 0) + 1;
      }
    }
    return counts;
  }, [anomalies]);

  const totalDuplicatesFound = useMemo(() => {
    if (latestRun) return latestRun.duplicatesFound;
    return anomalies.filter(
      (a) => a.category === "exact_duplicate" || a.category === "near_duplicate"
    ).length;
  }, [latestRun, anomalies]);

  const filteredAnomalies = useMemo(() => {
    if (severityFilter === "all") return anomalies;
    return anomalies.filter((a) => a.severity === severityFilter);
  }, [anomalies, severityFilter]);

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* En-tête + Sélecteur d'espace */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldAlert size={20} />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Gardien de données autonome
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Surveillance continue, détection déterministe par règles YAML, arbitrages IA pseudonymisés et actions 100 % annulables.
          </p>
          {spacesQuery.data?.tenantId && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="font-mono text-[11px]">
                Tenant: {spacesQuery.data.tenantId}
              </Badge>
              {activeSpaceId && (
                <>
                  <Badge variant="success" className="font-mono text-[11px]">
                    Espace: {activeSpaceId}
                  </Badge>
                  <Link
                    href={`/dashboard/${encodeURIComponent(activeSpaceId)}`}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Vue espace
                  </Link>
                  <Link
                    href={`/dashboard/${encodeURIComponent(activeSpaceId)}/validations`}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Validations
                  </Link>
                  <Link
                    href={`/dashboard/${encodeURIComponent(activeSpaceId)}/historique`}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Historique
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
            <FolderKanban size={15} className="text-muted-foreground" />
            <select
              aria-label="Sélectionner un espace"
              value={activeSpaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              className="bg-transparent text-xs font-medium text-foreground outline-none"
            >
              {spaces.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </select>
          </div>

          <Button variant="outline" size="sm" onClick={() => setIsSpaceModalOpen(true)}>
            <Plus size={14} /> Nouvel espace
          </Button>

          <Button
            size="sm"
            onClick={() => triggerRunMutation.mutate("agent")}
            disabled={!activeSpaceId || triggerRunMutation.isPending}
          >
            <Play size={14} />
            {triggerRunMutation.isPending ? "Contrôle en cours…" : "Lancer le contrôle"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerRunMutation.mutate("nightly")}
            disabled={!activeSpaceId || triggerRunMutation.isPending}
            title="Simule la tâche planifiée nocturne sur vos espaces"
          >
            <MoonStar size={14} /> Tâche nocturne
          </Button>

          <Button variant="outline" size="sm" onClick={invalidateGuardianSpace}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Bannière d'état */}
      {statusBanner && (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
            statusBanner.kind === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              : statusBanner.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border bg-muted/50 text-foreground"
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Fermer la notification"
          >
            <XCircle size={15} />
          </button>
        </div>
      )}

      {/* Aperçu Notification de fin de run (Fallback UI + SSE + Canaux) */}
      {(latestRun?.summaryText || liveSseMessage) && (
        <Card className="border-primary/25 bg-primary/[0.03]">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary mt-0.5">
                <Bell size={18} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">
                    Résumé du dernier run {latestRun ? `(${latestRun.id})` : ""}
                  </span>
                  {latestRun && (
                    <Badge variant="outline" className="text-[10px]">
                      {runStatusLabel(latestRun.status)}
                    </Badge>
                  )}
                  {latestRun?.notificationChannels?.map((ch) => (
                    <Badge key={ch} variant="success" className="text-[10px] font-mono">
                      {ch}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {latestRun?.summaryText || liveSseMessage}
                </p>
                {liveSseMessage && latestRun?.summaryText && (
                  <p className="text-[11px] font-mono text-primary">
                    Flux temps réel : {liveSseMessage}
                  </p>
                )}
              </div>
            </div>
            {latestRun && (
              <div className="text-right shrink-0 text-[11px] font-mono text-muted-foreground space-y-0.5">
                <div>Déclencheur : {latestRun.trigger}</div>
                <div>Fin : {formatDateTime(latestRun.finishedAt || latestRun.startedAt)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs principaux */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Enregistrements traités"
          value={latestRun ? latestRun.recordsProcessed : records.length}
          trend={`${activeRecordsCount} actifs`}
          hint={`${records.length} total (brut conservé)`}
          icon={Database}
        />
        <DashboardCard
          title="Doublons trouvés"
          value={totalDuplicatesFound}
          trend={latestRun ? `${latestRun.autoActionsCount} action(s) auto` : "Exacts + quasi"}
          hint="Hash & similarité vecteurs"
          icon={GitMerge}
        />
        <DashboardCard
          title="Anomalies ouvertes"
          value={
            openAnomaliesBySeverity.bloquante +
            openAnomaliesBySeverity.a_verifier +
            openAnomaliesBySeverity.mineure
          }
          trend={`${openAnomaliesBySeverity.bloquante} bloquantes`}
          hint={`${openAnomaliesBySeverity.a_verifier} à vérifier · ${openAnomaliesBySeverity.mineure} mineures`}
          icon={AlertTriangle}
        />
        <DashboardCard
          title="Lignes récupérées / nettoyées"
          value={recoveredRecordsCount}
          trend={`${pendingValidations.length} en validation`}
          hint="Archivage 100 % restaurable"
          icon={Archive}
        />
      </div>

      {/* Navigation par onglets */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          size="sm"
          variant={activeTab === "operations" ? "default" : "ghost"}
          onClick={() => setActiveTab("operations")}
        >
          <Activity size={14} /> Sources, Validation & Actions
          {pendingValidations.length > 0 && (
            <Badge variant="warning" className="ml-1">
              {pendingValidations.length}
            </Badge>
          )}
        </Button>
        <Button
          size="sm"
          variant={activeTab === "anomalies" ? "default" : "ghost"}
          onClick={() => setActiveTab("anomalies")}
        >
          <ShieldCheck size={14} /> Anomalies & Données ({anomalies.length})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "rules" ? "default" : "ghost"}
          onClick={() => setActiveTab("rules")}
        >
          <FileCode2 size={14} /> Règles YAML du projet
        </Button>
      </div>

      {activeTab === "operations" && (
        <div className="space-y-6">
          {/* Ligne 1 : Sources connectées + Import CSV/Excel */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Sources connectées (2 colonnes) */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Sources connectées & Dernier run</CardTitle>
                  <CardDescription>
                    Connecteurs CSV/Excel, CommCare (curseur incrémental) et Kobo/ODK/JSON.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setIsConnectorModalOpen(true)}>
                  <Plus size={14} /> Connecteur
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {sources.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">
                    Aucune source configurée dans cet espace.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sources.map((src) => (
                      <div
                        key={src.id}
                        className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">{src.name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">
                              {src.type.toUpperCase()}
                              {src.format ? ` (${src.format})` : ""} · {src.recordsCount} lignes
                            </p>
                          </div>
                          <Badge variant={src.status === "ACTIVE" ? "success" : "default"}>
                            {src.status}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5 font-mono">
                          <div>Dernière synchro : {formatDateTime(src.lastSyncAt)}</div>
                          {src.lastCursorId && <div>Curseur ID : {src.lastCursorId}</div>}
                        </div>
                        {(src.type === "commcare" || src.type === "generic") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-7 text-[11px]"
                            onClick={() => {
                              setJsonSourceId(src.id);
                              setIsJsonIngestOpen(true);
                            }}
                          >
                            <Upload size={12} /> Ingérer soumissions JSON
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {latestRun && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      <span>
                        Dernier run <span className="font-mono font-semibold">{latestRun.id}</span>{" "}
                        ({latestRun.trigger})
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      Ingérés: {latestRun.recordsIngested} · Idempotents ignorés:{" "}
                      {latestRun.recordsSkippedIdempotent} · Tokens: {latestRun.tokensUsed}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Import CSV / Excel (1 colonne) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet size={17} className="text-primary" />
                  Déposer CSV / Excel
                </CardTitle>
                <CardDescription>
                  Détection auto encodage & séparateur, brut immuable et contrôle automatique.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFileUpload} className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.txt"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/80"
                  />
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Mapping colonnes JSON (optionnel)
                    </label>
                    <Input
                      placeholder='{"nom_benef":"fullName","tel":"phone"}'
                      value={columnMappingText}
                      onChange={(e) => setColumnMappingText(e.target.value)}
                      className="text-xs font-mono"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!selectedFile || !activeSpaceId || uploading}
                  >
                    <Upload size={14} />
                    {uploading ? "Ingestion & analyse…" : "Importer et lancer le Gardien"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Ligne 2 : File de validation humaine */}
          <Card>
            <CardHeader>
              <CardTitle>File d&apos;actions en attente de validation humaine</CardTitle>
              <CardDescription>
                Cas ambigus (similarité intermédiaire, GPS hors zone ou garde-fou déclenché) nécessitant votre confirmation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {validations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  Aucune action en attente de validation dans cet espace.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {validations.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-border p-3.5 bg-card"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              item.status === "pending"
                                ? "warning"
                                : item.status === "approved"
                                  ? "success"
                                  : "default"
                            }
                          >
                            {item.status === "pending"
                              ? "En attente"
                              : item.status === "approved"
                                ? "Validée"
                                : "Rejetée"}
                          </Badge>
                          <span className="text-xs font-semibold text-foreground">
                            {item.title}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Confiance {(item.confidence * 100).toFixed(0)} % · {item.actionType}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">
                          Run: {item.runId} · Enr. principal: {item.primaryRecordId}
                          {item.secondaryRecordId ? ` ↔ ${item.secondaryRecordId}` : ""}
                        </p>
                      </div>

                      {item.status === "pending" && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            onClick={() =>
                              validationDecisionMutation.mutate({
                                validationId: item.id,
                                decision: "approved",
                              })
                            }
                            disabled={validationDecisionMutation.isPending}
                          >
                            <CheckCircle2 size={14} /> Valider
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              validationDecisionMutation.mutate({
                                validationId: item.id,
                                decision: "rejected",
                              })
                            }
                            disabled={validationDecisionMutation.isPending}
                          >
                            <XCircle size={14} /> Rejeter
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ligne 3 : Historique agent_actions avec bouton Annuler */}
          <Card>
            <CardHeader>
              <CardTitle>Journal des actions (`agent_actions`)</CardTitle>
              <CardDescription>
                Traçabilité complète des outils appelés, décisions, confiance et annulation (rollback) en un clic.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  Aucune action journalisée pour cet espace.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Horodatage</th>
                        <th className="py-2 pr-3">Run</th>
                        <th className="py-2 pr-3">Outil</th>
                        <th className="py-2 pr-3">Décision</th>
                        <th className="py-2 pr-3">Confiance</th>
                        <th className="py-2 pr-3">Auteur</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {actions.map((act) => (
                        <tr key={act.id} className="align-top">
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatDateTime(act.timestamp)}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {act.runId}
                          </td>
                          <td className="py-2.5 pr-3 font-mono font-medium text-foreground whitespace-nowrap">
                            {act.toolName}
                          </td>
                          <td className="py-2.5 pr-3 text-foreground max-w-md">
                            <div>{act.decision}</div>
                            {act.reverted && (
                              <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">
                                Annulée le {formatDateTime(act.revertedAt)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 font-mono whitespace-nowrap">
                            {(act.confidence * 100).toFixed(0)} %
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <Badge variant={act.author === "agent" ? "outline" : "default"}>
                              {act.author === "agent" ? "Agent" : "Humain"}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {act.reversible && !act.reverted ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => rollbackMutation.mutate(act.id)}
                                disabled={rollbackMutation.isPending}
                              >
                                <Undo2 size={12} /> Annuler
                              </Button>
                            ) : act.reverted ? (
                              <Badge variant="default">Annulée</Badge>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Lecture/Log</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "anomalies" && (
        <div className="space-y-6">
          {/* Anomalies détectées */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>Anomalies détectées par sévérité</CardTitle>
                <CardDescription>
                  Contrôles déterministes pilotés par votre configuration YAML.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(["all", "bloquante", "a_verifier", "mineure"] as const).map((sev) => (
                  <Button
                    key={sev}
                    size="sm"
                    variant={severityFilter === sev ? "default" : "outline"}
                    onClick={() => setSeverityFilter(sev)}
                    className="text-xs h-7"
                  >
                    {sev === "all" ? "Toutes" : sev}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {filteredAnomalies.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  Aucune anomalie pour ce filtre.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredAnomalies.map((an) => (
                    <div
                      key={an.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border p-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={severityBadgeVariant(an.severity)}>{an.severity}</Badge>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {an.category} · règle {an.ruleId}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {an.status}
                          </Badge>
                        </div>
                        <p className="text-foreground">{an.message}</p>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground shrink-0">
                        {an.recordId}
                        {an.similarityScore !== undefined
                          ? ` · sim ${(an.similarityScore * 100).toFixed(0)}%`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enregistrements normalisés (actifs, fusionnés, archivés) */}
          <Card>
            <CardHeader>
              <CardTitle>Enregistrements normalisés (aucune suppression physique)</CardTitle>
              <CardDescription>
                Toutes les lignes restent consultables et restaurables (statut active, merged ou archived).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {records.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4">
                  Aucun enregistrement dans cet espace. Déposez un CSV/Excel ou lancez une ingestion.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">ID externe</th>
                        <th className="py-2 pr-3">Nom complet</th>
                        <th className="py-2 pr-3">Téléphone</th>
                        <th className="py-2 pr-3">Âge</th>
                        <th className="py-2 pr-3">GPS / Zone</th>
                        <th className="py-2 pr-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {records.slice(0, 60).map((rec) => (
                        <tr key={rec.id}>
                          <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                            {rec.externalId}
                          </td>
                          <td className="py-2 pr-3 font-medium text-foreground">
                            {rec.fullName || <span className="text-red-500">Manquant</span>}
                          </td>
                          <td className="py-2 pr-3 font-mono text-[11px]">{rec.phone || "—"}</td>
                          <td className="py-2 pr-3 font-mono">{rec.age ?? "—"}</td>
                          <td className="py-2 pr-3 text-[11px] text-muted-foreground">
                            {rec.zone || "—"}
                            {rec.latitude !== null && rec.longitude !== null
                              ? ` (${rec.latitude.toFixed(2)}, ${rec.longitude.toFixed(2)})`
                              : ""}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge
                              variant={
                                rec.status === "active"
                                  ? "success"
                                  : rec.status === "merged"
                                    ? "outline"
                                    : "warning"
                              }
                            >
                              {rec.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "rules" && (
        <Card>
          <CardHeader>
            <CardTitle>Règles métier YAML de l&apos;espace</CardTitle>
            <CardDescription>
              Champs obligatoires, bornes (âge, montants, dates), zone GPS autorisée, seuils de similarité et garde-fous de l&apos;agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={yamlDraft}
              onChange={(e) => setYamlDraft(e.target.value)}
              className="min-h-[380px] font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setYamlDraft(rulesQuery.data?.rawYaml || "")}
              >
                Réinitialiser
              </Button>
              <Button
                size="sm"
                onClick={() => saveRulesMutation.mutate()}
                disabled={saveRulesMutation.isPending || !yamlDraft.trim()}
              >
                {saveRulesMutation.isPending ? "Validation…" : "Enregistrer les règles YAML"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal création d'espace */}
      <Modal
        isOpen={isSpaceModalOpen}
        onClose={() => setIsSpaceModalOpen(false)}
        title="Créer un espace isolé"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createSpaceMutation.mutate();
          }}
          className="space-y-4 text-xs"
        >
          <div className="space-y-1">
            <label className="font-semibold text-foreground">Nom du projet / espace</label>
            <Input
              required
              placeholder="Ex: Enquête Nutrition Sahel T4"
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-foreground">Description</label>
            <Input
              placeholder="Périmètre et jeux de données surveillés"
              value={newSpaceDesc}
              onChange={(e) => setNewSpaceDesc(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsSpaceModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={createSpaceMutation.isPending}>
              Créer l&apos;espace
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal enregistrement connecteur CommCare / Générique */}
      <Modal
        isOpen={isConnectorModalOpen}
        onClose={() => setIsConnectorModalOpen(false)}
        title="Connecter CommCare / KoboToolbox / ODK"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            registerConnectorMutation.mutate();
          }}
          className="space-y-3 text-xs"
        >
          <div className="space-y-1">
            <label className="font-semibold text-foreground">Nom de la source</label>
            <Input
              required
              placeholder="Ex: KoboCollect Cliniques Rurales"
              value={connName}
              onChange={(e) => setConnName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Type</label>
              <select
                value={connType}
                onChange={(e) => setConnType(e.target.value as "commcare" | "generic")}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
              >
                <option value="generic">Générique (Kobo / ODK / JSON)</option>
                <option value="commcare">CommCare API</option>
              </select>
            </div>
            {connType === "generic" && (
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Format</label>
                <select
                  value={connFormat}
                  onChange={(e) => setConnFormat(e.target.value as "json" | "kobo" | "odk")}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs"
                >
                  <option value="kobo">KoboToolbox</option>
                  <option value="odk">ODK Central</option>
                  <option value="json">JSON personnalisé</option>
                </select>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-foreground">URL d&apos;endpoint (optionnel)</label>
            <Input
              placeholder="https://kf.kobotoolbox.org/api/v2/assets/.../data.json"
              value={connEndpoint}
              onChange={(e) => setConnEndpoint(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="font-semibold text-foreground">
              Variable d&apos;environnement du jeton API
            </label>
            <Input
              placeholder="KOBO_API_TOKEN"
              value={connTokenEnv}
              onChange={(e) => setConnTokenEnv(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConnectorModalOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={registerConnectorMutation.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal ingestion soumissions JSON (CommCare / Kobo / ODK) */}
      <Modal
        isOpen={isJsonIngestOpen}
        onClose={() => setIsJsonIngestOpen(false)}
        title="Ingérer des soumissions JSON"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            jsonIngestMutation.mutate();
          }}
          className="space-y-3 text-xs"
        >
          <p className="text-muted-foreground">
            Collez un tableau JSON de soumissions brutes (KoboToolbox, ODK ou CommCare). Le brut est conservé tel quel et déclenche immédiatement le Gardien.
          </p>
          <Textarea
            value={jsonPayloadText}
            onChange={(e) => setJsonPayloadText(e.target.value)}
            className="min-h-[220px] font-mono text-[11px]"
            spellCheck={false}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsJsonIngestOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={jsonIngestMutation.isPending}>
              {jsonIngestMutation.isPending ? "Ingestion…" : "Ingérer & contrôler"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
