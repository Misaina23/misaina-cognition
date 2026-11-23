"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  FileCode2,
  FileDown,
  FileSpreadsheet,
  FlaskConical,
  FolderInput,
  Mail,
  MapPin,
  MessageSquare,
  MoonStar,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PipelineMetricsStrip } from "@/components/dashboard/PipelineMetricsStrip";
import { RecordsExplorer } from "@/components/dashboard/RecordsExplorer";
import { SystemDiagnosticsCard } from "@/components/dashboard/SystemDiagnosticsCard";
import { DashboardSkeleton } from "@/components/Skeletons";
import { SpaceHeader } from "@/components/SpaceHeader";
import { ToastBanner, type BannerMessage } from "@/components/ToastBanner";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AgentAction,
  type Anomaly,
  type AutomationStatus,
  type DataRun,
  type DataSourceConfig,
  type EnumeratorScorecard,
  type MealIndicators,
  type NlqResponse,
  type NormalizedRecord,
  type RuleFeedbackStat,
  type RuleThresholdSuggestion,
  type RunEmailSummary,
  type SpaceAlertSettings,
  type UnexpectedEvalReport,
  type ValidationItem,
  type ZoneBreakdown,
} from "@/lib/api";

type ActiveTab = "agent_pipeline" | "data_sources" | "rules";

const SAMPLE_KOBO_JSON = JSON.stringify(
  [
    {
      _id: "kobo-101",
      nom_complet: "Kadiatou Traoré",
      telephone: "+221776001122",
      age: 31,
      _geolocation: [14.7167, -17.4677],
      zone: "Dakar",
      enqueteur: "ENQ-01",
    },
    {
      _id: "kobo-102",
      nom_complet: "Binta Diouf",
      telephone: "+221778889900",
      age: 162,
      _geolocation: [14.14, -16.07],
      zone: "Dakar",
      enqueteur: "ENQ-02",
    },
  ],
  null,
  2
);

const NLQ_EXAMPLES = [
  "Combien d'enregistrements par zone ?",
  "Firy ny olona ao Dakar ary ohatrinona ny vola totaliny ?",
  "Quelles sont les anomalies bloquantes ?",
];

function formatCategoryLabel(category: string): string {
  switch (category) {
    case "exact_duplicate":
      return "Doublon exact";
    case "near_duplicate":
      return "Quasi-doublon ambigu";
    case "outlier":
      return "Valeur aberrante";
    case "geo_out_of_bounds":
      return "GPS hors zone";
    case "enumerator_copy_paste":
      return "Copier-coller enquêteur";
    case "missing_required":
      return "Champ obligatoire vide";
    default:
      return category;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DashboardSpacePage() {
  const router = useRouter();
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const encodedSpaceId = encodeURIComponent(spaceId);

  const [tab, setTab] = useState<ActiveTab>("agent_pipeline");
  const [runs, setRuns] = useState<DataRun[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [emailSummaries, setEmailSummaries] = useState<RunEmailSummary[]>([]);
  const [selectedEmailIdx, setSelectedEmailIdx] = useState(0);
  const [automation, setAutomation] = useState<AutomationStatus | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [mealIndicators, setMealIndicators] = useState<MealIndicators | null>(null);
  const [enumeratorScorecard, setEnumeratorScorecard] = useState<EnumeratorScorecard[]>([]);
  const [zoneBreakdown, setZoneBreakdown] = useState<ZoneBreakdown[]>([]);
  const [alertSettings, setAlertSettings] = useState<SpaceAlertSettings | null>(null);
  const [alertEmailDraft, setAlertEmailDraft] = useState("");
  const [notifyEveryRunDraft, setNotifyEveryRunDraft] = useState(true);
  const [savingAlertSettings, setSavingAlertSettings] = useState(false);

  const [validations, setValidations] = useState<ValidationItem[]>([]);
  const [decidingValidationId, setDecidingValidationId] = useState<string | null>(null);

  const [sources, setSources] = useState<DataSourceConfig[]>([]);
  const [records, setRecords] = useState<NormalizedRecord[]>([]);
  const [yamlDraft, setYamlDraft] = useState("");
  const [ruleFeedback, setRuleFeedback] = useState<RuleFeedbackStat[]>([]);
  const [ruleSuggestions, setRuleSuggestions] = useState<RuleThresholdSuggestion[]>([]);
  const [unexpectedEval, setUnexpectedEval] = useState<UnexpectedEvalReport | null>(null);

  const [severityFilter, setSeverityFilter] = useState<"all" | Anomaly["severity"]>("all");
  const [loading, setLoading] = useState(true);
  const [runningMode, setRunningMode] = useState<string | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [confirmRollbackId, setConfirmRollbackId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerMessage | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mappingText, setMappingText] = useState("");
  const [uploading, setUploading] = useState(false);

  const [showConnectorForm, setShowConnectorForm] = useState(false);
  const [connName, setConnName] = useState("");
  const [connType, setConnType] = useState<"commcare" | "generic">("generic");
  const [connFormat, setConnFormat] = useState<"json" | "kobo" | "odk">("kobo");
  const [connEndpoint, setConnEndpoint] = useState("");

  const [showJsonForm, setShowJsonForm] = useState(false);
  const [jsonText, setJsonText] = useState(SAMPLE_KOBO_JSON);
  const [savingRules, setSavingRules] = useState(false);

  const [nlqInput, setNlqInput] = useState("");
  const [nlqLoading, setNlqLoading] = useState(false);
  const [nlqResult, setNlqResult] = useState<NlqResponse | null>(null);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const [runsRes, actionsRes, valRes, srcRes, recRes, rulesRes, fbRes, evalRes] =
        await Promise.all([
          guardianApi.getRuns(spaceId),
          guardianApi.getActions(spaceId),
          guardianApi.getValidations(spaceId),
          guardianApi.getSources(spaceId),
          guardianApi.getRecords(spaceId, true),
          guardianApi.getRules(spaceId),
          guardianApi.getRuleFeedback(spaceId),
          guardianApi.getUnexpectedEvaluation(spaceId),
        ]);
      setRuns(runsRes.runs || []);
      setAnomalies(runsRes.anomalies || []);
      setEmailSummaries(runsRes.emailSummaries || []);
      setSelectedEmailIdx(0);
      setAutomation(runsRes.automation || null);
      setMealIndicators(runsRes.mealIndicators || null);
      setEnumeratorScorecard(runsRes.enumeratorScorecard || []);
      setZoneBreakdown(runsRes.zoneBreakdown || []);
      if (runsRes.alertSettings) {
        setAlertSettings(runsRes.alertSettings);
        setAlertEmailDraft(runsRes.alertSettings.alertEmail);
        setNotifyEveryRunDraft(runsRes.alertSettings.notifyOnEveryRun);
      }
      setActions(actionsRes.actions || []);
      setValidations(valRes.validations || []);
      setSources(srcRes.sources || []);
      setRecords(recRes.records || []);
      setYamlDraft(rulesRes.rawYaml || "");
      setRuleFeedback(fbRes.feedback || []);
      setRuleSuggestions(fbRes.suggestions || []);
      setUnexpectedEval(evalRes);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({
        kind: "err",
        text: describeApiError(err),
      });
    } finally {
      setLoading(false);
    }
  }, [router, spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCopyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      setBanner({ kind: "err", text: "Copie presse-papiers refusée par le navigateur." });
    }
  }

  async function handleRun(
    mode: "agent" | "nightly" | "autonomous_sync" | "demo_kobo_ingest" | "inbox_drop"
  ) {
    setRunningMode(mode);
    setBanner(null);
    try {
      await guardianApi.triggerRun(spaceId, mode);
      await refresh();
      const msgMap: Record<typeof mode, string> = {
        demo_kobo_ingest:
          "Export CommCare/Kobo anonymisé injecté (doublons, âge aberrant, GPS hors zone, copier-coller enquêteur) et contrôlé par l'agent.",
        inbox_drop:
          "Fichier CSV déposé dans l'inbox surveillée : déclenchement automatique, analyse et archivage terminés.",
        nightly: "Tâche planifiée (Cron) exécutée sur les espaces actifs.",
        autonomous_sync: "Synchronisation API autonome (CommCare / Kobo / ODK) terminée.",
        agent: "Cycle complet de l'Agent IA (règles + tool use + journal + email) terminé.",
      };
      setBanner({ kind: "ok", text: msgMap[mode] });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setRunningMode(null);
    }
  }

  function handleDemoRun() {
    if (
      !window.confirm(
        "Cette démonstration ajoutera des enregistrements synthétiques à l’espace actuel. Ne l’exécutez pas dans un espace opérationnel. Continuer ?"
      )
    ) {
      return;
    }
    void handleRun("demo_kobo_ingest");
  }

  async function handleDecideValidation(validationId: string, decision: "approved" | "rejected") {
    setDecidingValidationId(validationId);
    setBanner(null);
    try {
      await guardianApi.decideValidation(spaceId, validationId, decision);
      await refresh();
      setBanner({
        kind: "ok",
        text:
          decision === "approved"
            ? "Décision approuvée, base nettoyée et retour enregistré pour l'apprentissage des règles."
            : "Proposition rejetée et enregistrée dans le journal d'audit.",
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setDecidingValidationId(null);
    }
  }

  async function handleRollback(actionId: string) {
    setRevertingId(actionId);
    setBanner(null);
    try {
      await guardianApi.rollbackAction(spaceId, actionId);
      setConfirmRollbackId(null);
      await refresh();
      setBanner({
        kind: "ok",
        text: `Action ${actionId} annulée (rollback restauré dans le journal).`,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setRevertingId(null);
    }
  }

  async function handleDownloadCleanCsv() {
    setDownloadingCsv(true);
    setBanner(null);
    try {
      const { blob, fileName } = await guardianApi.downloadCleanCsv(spaceId, false);
      triggerBlobDownload(blob, fileName);
      setBanner({
        kind: "ok",
        text: `Export CSV propre téléchargé (${fileName} — encodage UTF-8 BOM prêt pour Excel/PowerBI).`,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: "Impossible d'exporter le fichier CSV propre." });
    } finally {
      setDownloadingCsv(false);
    }
  }

  async function handleDownloadWeeklyDocx() {
    setDownloadingDocx(true);
    setBanner(null);
    try {
      const { blob, fileName } = await guardianApi.downloadWeeklyDocx(spaceId);
      triggerBlobDownload(blob, fileName);
      setBanner({ kind: "ok", text: `Rapport hebdomadaire généré (${fileName}).` });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: "Impossible de générer le rapport .docx." });
    } finally {
      setDownloadingDocx(false);
    }
  }

  async function handleSaveAlertSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!alertEmailDraft.trim()) return;
    setSavingAlertSettings(true);
    setBanner(null);
    try {
      const res = await guardianApi.saveSpaceAlertSettings(spaceId, {
        alertEmail: alertEmailDraft.trim(),
        notifyOnEveryRun: notifyEveryRunDraft,
      });
      setAlertSettings(res.settings);
      setBanner({
        kind: "ok",
        text: `Paramètres d'alerte enregistrés (${res.settings.alertEmail}).`,
      });
    } catch (err) {
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setSavingAlertSettings(false);
    }
  }

  async function handleAskNlq(questionText: string) {
    const q = questionText.trim();
    if (!q) return;
    setNlqLoading(true);
    try {
      const res = await guardianApi.askQuestion(spaceId, q);
      setNlqResult(res);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: "Impossible d'exécuter la question en lecture seule." });
    } finally {
      setNlqLoading(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setBanner(null);
    try {
      const fileBase64 = await fileToBase64(selectedFile);
      const columnMapping = mappingText.trim()
        ? (JSON.parse(mappingText.trim()) as Record<string, string>)
        : undefined;
      const res = await guardianApi.ingestFile({
        spaceId,
        fileName: selectedFile.name,
        fileBase64,
        columnMapping,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
      setBanner({
        kind: "ok",
        text: `${res.ingest.insertedCount} ligne(s) ingérée(s), ${res.ingest.skippedIdempotentCount} ignorée(s) (idempotence).`,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Erreur lors de l'import du fichier.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleJsonIngest(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    try {
      const items = JSON.parse(jsonText) as Record<string, unknown>[];
      if (!Array.isArray(items)) throw new Error("Le JSON doit être un tableau d'objets.");
      const res = await guardianApi.ingestJson({ spaceId, rawItems: items });
      setShowJsonForm(false);
      await refresh();
      setBanner({
        kind: "ok",
        text: `${res.ingest.insertedCount} soumission(s) JSON ingérée(s), ${res.ingest.skippedIdempotentCount} ignorée(s).`,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "JSON invalide.",
      });
    }
  }

  async function handleAddConnector(e: React.FormEvent) {
    e.preventDefault();
    if (!connName.trim()) return;
    try {
      await guardianApi.registerSource({
        spaceId,
        name: connName.trim(),
        type: connType,
        format: connType === "generic" ? connFormat : undefined,
        endpointUrl: connEndpoint.trim() || undefined,
      });
      setConnName("");
      setConnEndpoint("");
      setShowConnectorForm(false);
      await refresh();
      setBanner({ kind: "ok", text: "Connecteur enregistré dans cet espace." });
    } catch {
      setBanner({ kind: "err", text: "Paramètres du connecteur invalides." });
    }
  }

  async function handleSaveRules() {
    setSavingRules(true);
    setBanner(null);
    try {
      await guardianApi.saveRules(spaceId, yamlDraft);
      await refresh();
      setBanner({ kind: "ok", text: "Règles YAML validées et enregistrées." });
    } catch {
      setBanner({ kind: "err", text: "YAML invalide : vérifiez la structure." });
    } finally {
      setSavingRules(false);
    }
  }

  const latest = runs[0];
  const totalTokens = runs.reduce((acc, r) => acc + (r.tokensUsed || 0), 0);
  const totalLlmCalls = runs.reduce((acc, r) => acc + (r.llmCallsCount || 0), 0);
  const pendingValidations = useMemo(
    () => validations.filter((v) => v.status === "pending"),
    [validations]
  );

  const severityCounts = useMemo(() => {
    const counts = { bloquante: 0, a_verifier: 0, mineure: 0 };
    for (const a of anomalies) counts[a.severity] += 1;
    return counts;
  }, [anomalies]);

  const filteredAnomalies = useMemo(() => {
    if (severityFilter === "all") return anomalies;
    return anomalies.filter((a) => a.severity === severityFilter);
  }, [anomalies, severityFilter]);

  const activeEmail = emailSummaries[selectedEmailIdx] || emailSummaries[0] || null;
  const verificationTextToCopy = activeEmail?.summaryText || latest?.summaryText || "";
  const webhookEndpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/ingest/${encodedSpaceId}`
      : `/api/webhooks/ingest/${encodedSpaceId}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="overview"
        title="Agent IA Autonome — Contrôle Qualité CommCare / Kobo"
        subtitle="Déclenchement autonome, règles déterministes + LLM tool use, fiabilité enquêteurs, export propre CSV/Word et journal anti-dérapage."
        actions={
          <>
            <button
              type="button"
              onClick={() => void handleRun("agent")}
              disabled={runningMode !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play size={13} />
              {runningMode === "agent" ? "Contrôle en cours…" : "Lancer contrôle Agent IA"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadCleanCsv()}
              disabled={downloadingCsv || records.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet size={13} />
              {downloadingCsv ? "Export CSV…" : "Exporter CSV propre"}
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadWeeklyDocx()}
              disabled={downloadingDocx}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileDown size={13} />
              {downloadingDocx ? "Export…" : "Rapport .docx"}
            </button>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Actualiser"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <ToastBanner banner={banner} onDismiss={() => setBanner(null)} />

        {loading && runs.length === 0 && records.length === 0 ? (
          <DashboardSkeleton />
        ) : (
          <>
            <PipelineMetricsStrip
              runsCount={runs.length}
              nightlyCron={automation?.nightlyCron}
              recordsCount={records.length}
              totalLlmCalls={totalLlmCalls}
              totalTokens={totalTokens}
              anomaliesCount={anomalies.length}
              severityCounts={severityCounts}
              emailSummariesCount={emailSummaries.length}
              actionsCount={actions.length}
            />

            <SystemDiagnosticsCard />

            {/* Onglets de travail */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
              <button
                type="button"
                onClick={() => setTab("agent_pipeline")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tab === "agent_pipeline"
                    ? "bg-foreground text-background"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Activity size={13} /> Pilotage Qualité, Email &amp; Journal
              </button>
              <button
                type="button"
                onClick={() => setTab("data_sources")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tab === "data_sources"
                    ? "bg-foreground text-background"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Database size={13} /> Collectes, Webhooks &amp; NLQ ({records.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("rules")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  tab === "rules"
                    ? "bg-foreground text-background"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileCode2 size={13} /> Règles YAML &amp; Calibration
                {ruleSuggestions.length > 0 ? ` (${ruleSuggestions.length})` : ""}
              </button>
            </div>

            {/* ONGLET 1 : Pilotage Qualité, Validations inline, Enquêteurs, Email, Journal */}
            {tab === "agent_pipeline" && (
          <div className="space-y-6">
            {records.length === 0 && !loading && (
              <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-foreground">
                    Espace prêt pour votre premier contrôle autonome
                  </h2>
                  <p className="text-xs text-muted-foreground max-w-2xl">
                    Injectez en un clic un export CommCare/Kobo anonymisé contenant les 4 cas
                    d&apos;erreurs (doublons + cas ambigu, âge aberrant 178 ans, GPS hors zone,
                    copier-coller enquêteur ENQ-04) pour déclencher l&apos;agent IA, calculer la
                    fiabilité des enquêteurs et préparer le CSV propre.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDemoRun}
                  disabled={runningMode !== null}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  <Bot size={15} />
                  {runningMode === "demo_kobo_ingest"
                    ? "Injection & Analyse…"
                    : "Injecter l'export CommCare/Kobo & Lancer l'Agent"}
                </button>
              </section>
            )}

            {/* Validations humaines prioritaires inline */}
            {pendingValidations.length > 0 && (
              <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Cas ambigus en attente de validation humaine ({pendingValidations.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Approuvez ou rejetez directement ces cas incertains sans quitter le tableau de
                      bord.
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/${encodedSpaceId}/validations`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    File complète des validations
                  </Link>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {pendingValidations.slice(0, 4).map((val) => (
                    <div
                      key={val.id}
                      className="rounded-xl border border-border bg-card p-3.5 text-xs space-y-2.5 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                          <span className="font-semibold text-amber-700 dark:text-amber-300 uppercase">
                            {val.actionType}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            Confiance {(val.confidence * 100).toFixed(0)} %
                          </span>
                        </div>
                        <div className="font-semibold text-foreground">{val.title}</div>
                        <p className="text-muted-foreground leading-relaxed">{val.description}</p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={decidingValidationId === val.id}
                          onClick={() => void handleDecideValidation(val.id, "approved")}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 size={12} /> Approuver
                        </button>
                        <button
                          type="button"
                          disabled={decidingValidationId === val.id}
                          onClick={() => void handleDecideValidation(val.id, "rejected")}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          <XCircle size={12} /> Rejeter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Split View : Anomalies par Sévérité + Résumé Email & Message de vérification */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Anomalies détectées classées par sévérité ({filteredAnomalies.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Doublons, âges aberrants, GPS hors zone et copier-coller enquêteurs.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { key: "all", label: `Toutes (${anomalies.length})` },
                        { key: "bloquante", label: `Bloquantes (${severityCounts.bloquante})` },
                        { key: "a_verifier", label: `À vérifier (${severityCounts.a_verifier})` },
                        { key: "mineure", label: `Mineures (${severityCounts.mineure})` },
                      ] as const
                    ).map((sev) => (
                      <button
                        key={sev.key}
                        type="button"
                        onClick={() => setSeverityFilter(sev.key)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          severityFilter === sev.key
                            ? "bg-foreground text-background"
                            : "border border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {sev.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredAnomalies.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={14} /> Aucune anomalie ouverte pour ce filtre.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                    {filteredAnomalies.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-xl border border-border bg-background/60 p-3.5 text-xs space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold uppercase ${
                                a.severity === "bloquante"
                                  ? "text-red-600 dark:text-red-400"
                                  : a.severity === "a_verifier"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-primary"
                              }`}
                            >
                              {a.severity}
                            </span>
                            <span className="text-muted-foreground">·</span>
                            <span className="font-semibold text-foreground">
                              {formatCategoryLabel(a.category)}
                            </span>
                          </div>
                          <span className="text-muted-foreground">
                            {a.ruleId} · {a.status}
                          </span>
                        </div>
                        <p className="text-foreground leading-relaxed">{a.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Résumé envoyé par Email & Message de vérification copiable */}
              <div className="lg:col-span-5 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Résumé Email &amp; Message de Vérification
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Prêt à copier pour WhatsApp/SMS superviseur ou envoi SMTP/Resend.
                      </p>
                    </div>
                    {verificationTextToCopy && (
                      <button
                        type="button"
                        onClick={() => void handleCopyText("emailSummary", verificationTextToCopy)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted shrink-0"
                      >
                        {copiedKey === "emailSummary" ? (
                          <>
                            <Check size={12} className="text-emerald-600" /> Copié
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copier message
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {activeEmail ? (
                    <div className="space-y-3">
                      {emailSummaries.length > 1 && (
                        <select
                          aria-label="Sélectionner un email envoyé"
                          value={selectedEmailIdx}
                          onChange={(e) => setSelectedEmailIdx(Number(e.target.value))}
                          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-mono text-foreground"
                        >
                          {emailSummaries.map((mail, idx) => (
                            <option key={mail.id} value={idx}>
                              {new Date(mail.sentAt).toLocaleTimeString("fr-FR")} — {mail.runId}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="rounded-xl border border-border bg-background/70 p-3.5 text-xs space-y-2">
                        <div className="space-y-1 border-b border-border pb-2 font-mono text-[11px]">
                          <div className="text-foreground font-semibold">{activeEmail.subject}</div>
                          <div className="text-muted-foreground">
                            Destinataire : {activeEmail.recipient}
                          </div>
                          <div className="text-muted-foreground">
                            Canaux : {activeEmail.channels.join(" · ")} ·{" "}
                            {activeEmail.emailSent
                              ? `SMTP/Resend (${activeEmail.emailProvider})`
                              : "Aperçu & Journal prêts (configurez SMTP/Resend pour envoi externe)"}
                          </div>
                        </div>

                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                          {activeEmail.summaryText}
                        </pre>
                      </div>
                    </div>
                  ) : latest?.summaryText ? (
                    <div className="rounded-xl border border-border bg-background/70 p-3.5 text-xs space-y-2">
                      <p className="font-mono text-[11px] text-muted-foreground">
                        Run : {latest.id} · Déclencheur : {latest.trigger}
                      </p>
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                        {latest.summaryText}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4">
                      Aucun résumé envoyé pour le moment. Lancez un contrôle ou injectez l&apos;export
                      CommCare/Kobo.
                    </p>
                  )}
                </div>

                {latest && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                    <div>
                      Dernier run : {latest.id} ({latest.status})
                    </div>
                    <div>
                      Fournisseur : {latest.llmProvider || "deterministic"}/
                      {latest.llmModel || "rules-fallback-v1"} · {latest.durationMs ?? 0} ms
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Gouvernance ONG & Entreprise : Scorecard Fiabilité Enquêteurs + Répartition par Zone */}
            {(enumeratorScorecard.length > 0 || zoneBreakdown.length > 0) && (
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7 rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-primary" />
                      <div>
                        <h2 className="text-sm font-semibold">
                          Scorecard Fiabilité des Enquêteurs ({enumeratorScorecard.length})
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Classés du plus critique au plus fiable (copier-coller, GPS hors zone,
                          doublons).
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3">Enquêteur</th>
                          <th className="py-2 pr-3">Soumissions</th>
                          <th className="py-2 pr-3">Conformes</th>
                          <th className="py-2 pr-3">Copier-coller</th>
                          <th className="py-2 pr-3">GPS</th>
                          <th className="py-2 text-right">Fiabilité</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {enumeratorScorecard.map((row) => (
                          <tr key={row.enumeratorId}>
                            <td className="py-2 pr-3 font-mono font-semibold text-foreground">
                              {row.enumeratorId}
                            </td>
                            <td className="py-2 pr-3 font-mono tabular-nums">
                              {row.totalSubmissions}
                            </td>
                            <td className="py-2 pr-3 font-mono tabular-nums">
                              {row.cleanSubmissions}
                            </td>
                            <td
                              className={`py-2 pr-3 font-mono tabular-nums ${
                                row.copyPasteAlerts > 0
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {row.copyPasteAlerts}
                            </td>
                            <td
                              className={`py-2 pr-3 font-mono tabular-nums ${
                                row.geoAlerts > 0
                                  ? "font-semibold text-amber-600 dark:text-amber-400"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {row.geoAlerts}
                            </td>
                            <td
                              className={`py-2 text-right font-mono font-bold tabular-nums ${
                                row.reliabilityScore < 75
                                  ? "text-red-600 dark:text-red-400"
                                  : row.reliabilityScore < 95
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {row.reliabilityScore} %
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="lg:col-span-5 rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-border pb-3">
                    <MapPin size={16} className="text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold">
                        Couverture &amp; Montants par Zone ({zoneBreakdown.length})
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Bénéficiaires actifs vérifiés et alertes par zone d&apos;intervention.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {zoneBreakdown.map((z) => (
                      <div
                        key={z.zone}
                        className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-foreground">{z.zone}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {z.activeBeneficiaries} actif(s) · {z.anomaliesCount} alerte(s)
                          </div>
                        </div>
                        <div className="text-right font-mono font-semibold tabular-nums text-foreground">
                          {z.totalAmount.toLocaleString("fr-FR")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Pilier 5 : Journal d'actions de l'agent (Détection des dérapages) */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Journal des Actions de l&apos;Agent (Détection des dérapages)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Chaque appel d&apos;outil, requête LLM, fusion, garde-fou et notification est
                    enregistré avec niveau de confiance et possibilité d&apos;annulation (rollback).
                  </p>
                </div>
                <Link
                  href={`/dashboard/${encodedSpaceId}/historique`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Journal complet &amp; audit
                </Link>
              </div>

              {actions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucune action enregistrée dans le journal pour le moment.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Horodatage</th>
                        <th className="py-2 pr-3">Outil / Action</th>
                        <th className="py-2 pr-3">Auteur</th>
                        <th className="py-2 pr-3">Décision tracée</th>
                        <th className="py-2 pr-3">Confiance</th>
                        <th className="py-2 pr-3">Modèle / Tokens</th>
                        <th className="py-2 text-right">Contrôle / Rollback</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {actions.slice(0, 15).map((act) => (
                        <tr key={act.id}>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(act.timestamp).toLocaleTimeString("fr-FR")}
                          </td>
                          <td className="py-2.5 pr-3 font-mono font-semibold text-[11px] text-primary">
                            {act.toolName === "llm_fallback" ? "Repli LLM → règles" : act.toolName}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] uppercase">
                            {act.author}
                          </td>
                          <td className="py-2.5 pr-3 text-foreground max-w-md">{act.decision}</td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] tabular-nums">
                            {(act.confidence * 100).toFixed(0)} %
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {act.llmProvider || "script"} · {act.tokensUsed ?? 0} tok
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {act.reverted ? (
                              <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                                ANNULÉE
                              </span>
                            ) : act.reversible ? (
                              <button
                                type="button"
                                disabled={revertingId === act.id}
                                onClick={() => setConfirmRollbackId(act.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                              >
                                <RotateCcw size={11} />
                                {revertingId === act.id ? "Rollback…" : "Annuler"}
                              </button>
                            ) : (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                Lecture / Log
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ONGLET 2 : Collectes CommCare / Kobo, Webhooks Temps Réel, Email Config & NLQ */}
        {tab === "data_sources" && (
          <div className="space-y-6">
            {/* Centre d'Automatisation, Webhook & Notifications */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <Radio size={16} className="text-primary" />
                  <div>
                    <h2 className="text-sm font-semibold">
                      Webhook Temps Réel KoboToolbox / CommCare &amp; Déclencheurs
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Recevez chaque nouvelle soumission terrain en temps réel ou déclenchez un test
                      de pipeline.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 rounded-xl border border-border bg-background/60 p-3.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Endpoint POST (REST Services Kobo / CommCare Forwarding)
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyText("webhookUrl", webhookEndpointUrl)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      {copiedKey === "webhookUrl" ? (
                        <>
                          <Check size={11} /> URL copiée
                        </>
                      ) : (
                        <>
                          <Copy size={11} /> Copier URL
                        </>
                      )}
                    </button>
                  </div>
                  <div className="truncate rounded border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                    {webhookEndpointUrl}
                  </div>
                  {alertSettings?.webhookSecret && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        Header requis : <strong className="text-foreground">X-Webhook-Secret</strong>{" "}
                        = {alertSettings.webhookSecret}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyText("webhookSecret", alertSettings.webhookSecret)
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        {copiedKey === "webhookSecret" ? "Secret copié" : "Copier secret"}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDemoRun}
                    disabled={runningMode !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Bot size={13} />
                    {runningMode === "demo_kobo_ingest"
                      ? "Injection…"
                      : "Importer un jeu de données terrain Kobo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRun("inbox_drop")}
                    disabled={runningMode !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <FolderInput size={13} />
                    {runningMode === "inbox_drop" ? "Dépôt…" : "Tester l'ingestion dossier Inbox"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRun("nightly")}
                    disabled={runningMode !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <MoonStar size={13} /> Exécuter Cron planifié
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRun("autonomous_sync")}
                    disabled={runningMode !== null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw size={13} /> Synchro API
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleSaveAlertSettings}
                className="lg:col-span-5 rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border pb-3">
                    <Mail size={16} className="text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold">Destinataire des Alertes Email</h2>
                      <p className="text-xs text-muted-foreground">
                        Email recevant la synthèse et les cas à vérifier après chaque contrôle.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Adresse email coordinateur / équipe MEAL
                    </label>
                    <input
                      type="email"
                      required
                      value={alertEmailDraft}
                      onChange={(e) => setAlertEmailDraft(e.target.value)}
                      placeholder="coordinateur-meal@organisation.org"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyEveryRunDraft}
                      onChange={(e) => setNotifyEveryRunDraft(e.target.checked)}
                      className="rounded border-border"
                    />
                    Envoyer un résumé après chaque exécution autonome
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={savingAlertSettings}
                  className="w-full rounded-lg bg-foreground px-3.5 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {savingAlertSettings ? "Enregistrement…" : "Enregistrer la configuration email"}
                </button>
              </form>
            </section>

            {mealIndicators && (
              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Indicateurs MEAL de l&apos;espace
                  </h2>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Bénéficiaires actifs : {mealIndicators.activeBeneficiaries} · Nettoyés :{" "}
                    {mealIndicators.cleanedRecords}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-muted-foreground">Zones couvertes</div>
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {mealIndicators.zonesCoveredCount}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {mealIndicators.zonesCovered.join(", ") || "—"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-muted-foreground">Enquêteurs identifiés</div>
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {mealIndicators.enumeratorsCount}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Agents terrain actifs</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-muted-foreground">Alertes copier-coller</div>
                    <div
                      className={`text-lg font-bold font-mono tabular-nums ${
                        mealIndicators.copyPasteAlerts > 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {mealIndicators.copyPasteAlerts}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Règle qualité enquêteur
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-muted-foreground">Montants suivis</div>
                    <div className="text-lg font-bold font-mono tabular-nums">
                      {mealIndicators.totalAmountDisbursed.toLocaleString("fr-FR")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">Cumul actif vérifié</div>
                  </div>
                </div>
              </section>
            )}

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Sources connectées ({sources.length})</h2>
                    <p className="text-xs text-muted-foreground">
                      CSV, Excel, CommCare, Kobo/ODK et ingestion JSON directe.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowJsonForm((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                    >
                      <Upload size={12} /> JSON / Kobo
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConnectorForm((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                    >
                      <Plus size={12} /> Connecteur
                    </button>
                  </div>
                </div>

                {showConnectorForm && (
                  <form
                    onSubmit={handleAddConnector}
                    className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs"
                  >
                    <input
                      required
                      placeholder="Nom source"
                      value={connName}
                      onChange={(e) => setConnName(e.target.value)}
                      className="rounded border border-border bg-background px-2.5 py-1.5"
                    />
                    <select
                      value={connType}
                      onChange={(e) => setConnType(e.target.value as "commcare" | "generic")}
                      className="rounded border border-border bg-background px-2 py-1.5"
                    >
                      <option value="generic">Kobo / ODK / JSON</option>
                      <option value="commcare">CommCare HQ</option>
                    </select>
                    {connType === "generic" ? (
                      <select
                        value={connFormat}
                        onChange={(e) => setConnFormat(e.target.value as "json" | "kobo" | "odk")}
                        className="rounded border border-border bg-background px-2 py-1.5"
                      >
                        <option value="kobo">Format Kobo</option>
                        <option value="odk">Format ODK</option>
                        <option value="json">JSON libre</option>
                      </select>
                    ) : (
                      <input
                        placeholder="URL endpoint (optionnel)"
                        value={connEndpoint}
                        onChange={(e) => setConnEndpoint(e.target.value)}
                        className="rounded border border-border bg-background px-2.5 py-1.5"
                      />
                    )}
                    <button
                      type="submit"
                      className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                    >
                      Enregistrer
                    </button>
                  </form>
                )}

                {showJsonForm && (
                  <form
                    onSubmit={handleJsonIngest}
                    className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs"
                  >
                    <textarea
                      rows={5}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="w-full rounded border border-border bg-background p-2 font-mono text-[11px]"
                    />
                    <button
                      type="submit"
                      className="rounded bg-foreground px-3 py-1.5 font-medium text-background"
                    >
                      Ingérer les soumissions JSON
                    </button>
                  </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sources.map((src) => (
                    <div
                      key={src.id}
                      className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{src.name}</span>
                        <span className="font-mono text-[10px] text-primary">{src.status}</span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {src.type.toUpperCase()}
                        {src.format ? ` (${src.format})` : ""} · {src.recordsCount} ligne(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form
                onSubmit={handleUpload}
                className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm"
              >
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-primary" />
                  Importer CSV / Excel
                </h2>
                <p className="text-xs text-muted-foreground">
                  Détection automatique encodage/séparateur et conservation du brut immuable.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder='Mapping JSON optionnel (ex: {"nom":"fullName"})'
                  value={mappingText}
                  onChange={(e) => setMappingText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px]"
                />
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {uploading ? "Import & analyse…" : "Importer et contrôler"}
                </button>
              </form>
            </section>

            {/* NLQ Français / Malagasy */}
            <section className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-primary" />
                  <h2 className="text-sm font-semibold">
                    Questions en langage naturel (Français / Malagasy)
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Lecture seule · Périmètre {spaceId}
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAskNlq(nlqInput);
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={nlqInput}
                  onChange={(e) => setNlqInput(e.target.value)}
                  placeholder="Ex. Combien d'anomalies bloquantes ? ou Firy ny olona ao Dakar ?"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={nlqLoading || !nlqInput.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  <Send size={13} />
                  {nlqLoading ? "Analyse…" : "Interroger"}
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5">
                {NLQ_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setNlqInput(ex);
                      void handleAskNlq(ex);
                    }}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {nlqResult && (
                <div className="rounded-lg border border-border bg-muted/40 p-3.5 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
                    <span>
                      Langue : {nlqResult.language.toUpperCase()} · Outil : {nlqResult.toolUsed} (
                      {nlqResult.metric})
                    </span>
                    <span>
                      {nlqResult.llmProvider}/{nlqResult.llmModel} · Scope :{" "}
                      {nlqResult.scope.tenantId}/{nlqResult.scope.spaceId}
                    </span>
                  </div>
                  <p className="text-foreground font-medium">{nlqResult.answer}</p>
                </div>
              )}
            </section>

            <RecordsExplorer
              records={records}
              anomalies={anomalies}
              downloadingCsv={downloadingCsv}
              onDownloadCleanCsv={() => void handleDownloadCleanCsv()}
            />
          </div>
        )}

        {/* ONGLET 3 : Règles YAML, Calibration & Benchmark R&D repliable */}
        {tab === "rules" && (
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Configuration YAML des règles du projet</h2>
                  <p className="text-xs text-muted-foreground">
                    Champs obligatoires, plages, déduplication et zones d&apos;intervention GPS
                    (`geoBounds.interventionZones`). Les champs obligatoires peuvent aussi
                    référencer des réponses de formulaire présentes dans `extra`.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveRules()}
                  disabled={savingRules}
                  className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingRules ? "Enregistrement…" : "Valider et enregistrer"}
                </button>
              </div>
              <textarea
                rows={18}
                value={yamlDraft}
                onChange={(e) => setYamlDraft(e.target.value)}
                className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
              />
            </section>

            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold">
                  Apprentissage des décisions humaines par règle
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chaque validation ou rejet met à jour le taux de rejet. Au-delà de 60 %,
                  l&apos;agent propose un ajustement de seuil sans jamais modifier le YAML seul.
                </p>
              </div>

              {ruleSuggestions.length > 0 && (
                <div className="space-y-2">
                  {ruleSuggestions.map((s) => (
                    <div
                      key={s.ruleId}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1"
                    >
                      <div className="font-mono font-semibold text-amber-800 dark:text-amber-300">
                        Suggestion : {s.ruleId} — Rejet {(s.rejectionRate * 100).toFixed(0)} % (
                        {s.rejectedCount}/{s.totalCount})
                      </div>
                      <p className="text-foreground">{s.suggestedAction}</p>
                      <p className="text-[11px] text-muted-foreground">{s.rationale}</p>
                    </div>
                  ))}
                </div>
              )}

              {ruleFeedback.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aucune décision humaine enregistrée pour cet espace.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3">Règle</th>
                        <th className="py-2 pr-3">Validées</th>
                        <th className="py-2 pr-3">Rejetées</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2">Taux de rejet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {ruleFeedback.map((fb) => (
                        <tr key={fb.ruleId}>
                          <td className="py-2 pr-3 font-mono font-medium">{fb.ruleId}</td>
                          <td className="py-2 pr-3 font-mono">{fb.approvedCount}</td>
                          <td className="py-2 pr-3 font-mono">{fb.rejectedCount}</td>
                          <td className="py-2 pr-3 font-mono">{fb.totalCount}</td>
                          <td
                            className={`py-2 font-mono font-semibold ${
                              fb.rejectionRate > 0.6
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                            }`}
                          >
                            {(fb.rejectionRate * 100).toFixed(1)} %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Benchmark R&D repliable pour ne pas encombrer le pilotage quotidien */}
            {unexpectedEval && (
              <details className="group rounded-xl border border-border bg-card p-5 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FlaskConical size={16} className="text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold">
                        Benchmark R&amp;D : Évaluation sur {unexpectedEval.totalUnexpectedErrors} cas
                        imprévus hors YAML
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Précision {(unexpectedEval.agentDetector.precision * 100).toFixed(0)} % ·
                        Rappel {(unexpectedEval.agentDetector.recall * 100).toFixed(0)} % vs baseline
                        YAML {(unexpectedEval.yamlBaseline.recall * 100).toFixed(0)} %
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    className="text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>

                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-muted-foreground">Précision (Détecteur imprévus)</div>
                      <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {(unexpectedEval.agentDetector.precision * 100).toFixed(0)} %
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-muted-foreground">Rappel (Détecteur imprévus)</div>
                      <div className="text-xl font-bold font-mono text-primary tabular-nums">
                        {(unexpectedEval.agentDetector.recall * 100).toFixed(0)} % (
                        {unexpectedEval.agentDetector.truePositives}/
                        {unexpectedEval.totalUnexpectedErrors})
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-muted-foreground">Faux positifs</div>
                      <div className="text-xl font-bold font-mono tabular-nums">
                        {unexpectedEval.agentDetector.falsePositives}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-muted-foreground">Rappel YAML seul (baseline)</div>
                      <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                        {(unexpectedEval.yamlBaseline.recall * 100).toFixed(0)} % (
                        {unexpectedEval.yamlBaseline.truePositives}/
                        {unexpectedEval.totalUnexpectedErrors})
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3">ID cas</th>
                          <th className="py-2 pr-3">Type imprévu</th>
                          <th className="py-2 pr-3">Couvert YAML</th>
                          <th className="py-2 pr-3">Détecté Agent</th>
                          <th className="py-2">Motif observé</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {unexpectedEval.cases.map((c) => (
                          <tr key={c.externalId}>
                            <td className="py-2 pr-3 font-mono text-[11px]">{c.externalId}</td>
                            <td className="py-2 pr-3 font-mono text-[11px]">{c.errorType}</td>
                            <td className="py-2 pr-3 font-mono text-[11px]">
                              {c.caughtByYaml ? "Oui" : "Non"}
                            </td>
                            <td className="py-2 pr-3 font-mono text-[11px] font-semibold">
                              {c.caughtByAgent ? (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Détecté
                                </span>
                              ) : (
                                <span className="text-red-600 dark:text-red-400">Manqué</span>
                              )}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {c.detectedReasons.join(" ; ") || c.description}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
          </>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(confirmRollbackId)}
        title="Confirmer l'annulation (Rollback)"
        description="Cette opération restaure l'état antérieur des enregistrements concernés par cette action et journalise le rollback dans l'historique d'audit."
        confirmLabel="Confirmer le rollback"
        variant="warning"
        busy={Boolean(revertingId)}
        onCancel={() => setConfirmRollbackId(null)}
        onConfirm={() => {
          if (confirmRollbackId) {
            return handleRollback(confirmRollbackId);
          }
        }}
      />
    </div>
  );
}
