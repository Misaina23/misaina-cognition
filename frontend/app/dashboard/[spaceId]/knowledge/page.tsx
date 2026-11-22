"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileCheck2,
  FileDown,
  FilePlus2,
  Fingerprint,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { SpaceHeader } from "@/components/SpaceHeader";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AuditLedgerEntry,
  type ClassificationLevel,
  type ComplianceMetrics,
  type CryptographicCitation,
  type KnowledgeDocument,
  type KnowledgeQueryResult,
  type ProofVerificationResult,
} from "@/lib/api";

type KnowledgeTab = "assistant" | "vault" | "audit";

const SUGGESTED_QUESTIONS = [
  "Comment l'isolation inter-filiales SecNumCloud est-elle garantie ?",
  "Quel est le protocole de fusion BM25 + RRF et vérification SHA-256 ?",
  "Quels sont les seuils d'alerte GPS et copier-coller sur le terrain Sahel ?",
];

const CLEARANCE_OPTIONS: Array<{ value: ClassificationLevel | "ALL"; label: string }> = [
  { value: "ALL", label: "Tous niveaux PSSI" },
  { value: "CONFIDENTIEL", label: "Jusqu'à CONFIDENTIEL" },
  { value: "RESTREINT", label: "Jusqu'à RESTREINT" },
  { value: "INTERNE", label: "Jusqu'à INTERNE" },
  { value: "PUBLIC", label: "PUBLIC uniquement" },
];

export default function SovereignKnowledgePage() {
  const router = useRouter();
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [tab, setTab] = useState<KnowledgeTab>("assistant");
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [queries, setQueries] = useState<KnowledgeQueryResult[]>([]);
  const [audit, setAudit] = useState<AuditLedgerEntry[]>([]);
  const [compliance, setCompliance] = useState<ComplianceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // RAG Query state
  const [question, setQuestion] = useState("");
  const [clearanceFilter, setClearanceFilter] = useState<ClassificationLevel | "ALL">("ALL");
  const [querying, setQuerying] = useState(false);
  const [activeResult, setActiveResult] = useState<KnowledgeQueryResult | null>(null);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [proofResults, setProofResults] = useState<Record<string, ProofVerificationResult>>({});
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);

  // Vault Document Ingestion state
  const [docTitle, setDocTitle] = useState("");
  const [docFileName, setDocFileName] = useState("directive_interne.txt");
  const [docDept, setDocDept] = useState("Direction Technique & PSSI");
  const [docClass, setDocClass] = useState<ClassificationLevel>("RESTREINT");
  const [docContent, setDocContent] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const [docsRes, queriesRes, auditRes] = await Promise.all([
        guardianApi.getKnowledgeDocuments(spaceId),
        guardianApi.getKnowledgeQueries(spaceId),
        guardianApi.getKnowledgeAudit(spaceId),
      ]);
      setDocuments(docsRes.documents || []);
      const qList = queriesRes.queries || [];
      setQueries(qList);
      if (qList.length > 0 && !activeResult) {
        setActiveResult(qList[0]);
      }
      setAudit(auditRes.audit || []);
      setCompliance(auditRes.compliance || null);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setLoading(false);
    }
  }, [activeResult, router, spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleQuery(qText: string) {
    const clean = qText.trim();
    if (clean.length < 2) return;
    setQuerying(true);
    setBanner(null);
    setProofResults({});
    try {
      const res = await guardianApi.queryKnowledge({
        spaceId,
        question: clean,
        clearanceFilter,
      });
      setActiveResult(res);
      const [queriesRes, auditRes] = await Promise.all([
        guardianApi.getKnowledgeQueries(spaceId),
        guardianApi.getKnowledgeAudit(spaceId),
      ]);
      setQueries(queriesRes.queries || []);
      setAudit(auditRes.audit || []);
      setCompliance(auditRes.compliance || null);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setQuerying(false);
    }
  }

  async function handleVerifyCitation(cit: CryptographicCitation, queryHash: string) {
    const key = `${cit.chunkHash}:${cit.citationIndex}`;
    setVerifyingKey(key);
    try {
      const verification = await guardianApi.verifyCitationProof({
        spaceId,
        chunkHash: cit.chunkHash,
        queryHash,
        sealedAt: cit.sealedAt,
        proofReceipt: cit.proofReceipt,
      });
      setProofResults((prev) => ({ ...prev, [key]: verification }));
      const auditRes = await guardianApi.getKnowledgeAudit(spaceId);
      setAudit(auditRes.audit || []);
      setCompliance(auditRes.compliance || null);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setVerifyingKey(null);
    }
  }

  async function handleExportDocx() {
    if (!activeResult) return;
    setExportingDocx(true);
    setBanner(null);
    try {
      const qPrompt = question.trim() || "Synthèse documentaire souveraine";
      const { blob, fileName } = await guardianApi.exportBriefingDocx({
        spaceId,
        question: qPrompt,
        answer: activeResult.answer,
        queryHash: activeResult.queryHash,
        merkleProofRoot: activeResult.merkleProofRoot,
        citations: activeResult.citations,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setBanner({ kind: "ok", text: `Note de synthèse certifiée générée (${fileName}).` });
      const auditRes = await guardianApi.getKnowledgeAudit(spaceId);
      setAudit(auditRes.audit || []);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setExportingDocx(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFileName(file.name);
    if (!docTitle.trim()) {
      setDocTitle(file.name.replace(/\.[^.]+$/, ""));
    }
    try {
      const text = await file.text();
      setDocContent(text);
    } catch {
      setBanner({ kind: "err", text: "Lecture du fichier texte impossible." });
    }
  }

  async function handleIngestDocument(e: React.FormEvent) {
    e.preventDefault();
    if (docTitle.trim().length < 2 || docContent.trim().length < 10) {
      setBanner({
        kind: "err",
        text: "Le titre (2+ car.) et le contenu (10+ car.) sont requis pour l'indexation.",
      });
      return;
    }
    setIngesting(true);
    setBanner(null);
    try {
      const res = await guardianApi.ingestKnowledgeDocument({
        spaceId,
        title: docTitle.trim(),
        fileName: docFileName.trim() || "document.txt",
        content: docContent.trim(),
        department: docDept.trim() || "Direction",
        classification: docClass,
      });
      setDocTitle("");
      setDocContent("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
      setBanner({
        kind: "ok",
        text: `Document scellé (${res.document.chunks.length} fragments indexés, SHA-256 ${res.document.documentHash.slice(0, 14)}...).`,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setIngesting(false);
    }
  }

  async function handleDeleteDocument(doc: KnowledgeDocument) {
    setBanner(null);
    try {
      await guardianApi.deleteKnowledgeDocument(spaceId, doc.id);
      await refresh();
      setBanner({ kind: "ok", text: `Document retiré du coffre (${doc.title}).` });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="knowledge"
        title={`Moteur de Connaissance Souverain — ${spaceId}`}
        subtitle="Pipeline hybride BM25 et vecteurs denses RRF, traçabilité cryptographique SHA-256 / HMAC et conformité SecNumCloud / PSSI."
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Actualiser le moteur de connaissance"
          >
            <RefreshCw size={14} />
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {banner && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-medium ${
              banner.kind === "err"
                ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {banner.text}
          </div>
        )}

        {/* Compliance & Telemetry Strip */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Documents scellés</span>
              <Lock size={14} className="text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {compliance?.documentsCount ?? documents.length}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Cloisonnement strict {spaceId}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Fragments indexés</span>
              <Database size={14} className="text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {compliance?.chunksCount ??
                documents.reduce((acc, d) => acc + d.chunks.length, 0)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Index BM25 + vecteurs 128 dim
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Requêtes &amp; preuves</span>
              <Fingerprint size={14} className="text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {compliance?.queriesCount ?? queries.length}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Reçus HMAC-SHA256 générés
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Latence moyenne / Audit</span>
              <Activity size={14} className="text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums">
              {compliance?.avgLatencyMs ?? 0} ms
            </div>
            <div className="text-[11px] text-muted-foreground">
              {compliance?.auditEntriesCount ?? audit.length} événements chaînés SHA-256
            </div>
          </div>
        </section>

        {/* Sub-navigation tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setTab("assistant")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "assistant"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Search size={13} /> Assistant RAG Hybride &amp; Preuves
          </button>
          <button
            type="button"
            onClick={() => setTab("vault")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "vault"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <FilePlus2 size={13} /> Coffre Documentaire ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("audit")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "audit"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck size={13} /> Audit &amp; Conformité SecNumCloud ({audit.length})
          </button>
        </div>

        {/* TAB 1: Hybrid RAG Assistant */}
        {tab === "assistant" && (
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Interrogation Hybride BM25 + Vecteurs Denses (RRF)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Chaque réponse s&apos;appuie uniquement sur les fragments autorisés de ce tenant et génère des citations scellées HMAC-SHA256.
                  </p>
                </div>
                <select
                  value={clearanceFilter}
                  onChange={(e) =>
                    setClearanceFilter(e.target.value as ClassificationLevel | "ALL")
                  }
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:border-primary"
                >
                  {CLEARANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleQuery(question);
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Posez une question sur vos directives PSSI, procédures SecNumCloud ou protocoles terrain..."
                  className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={querying || question.trim().length < 2}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Send size={13} />
                  {querying ? "Calcul RRF…" : "Exécuter requête RAG"}
                </button>
              </form>

              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setQuestion(q);
                      void handleQuery(q);
                    }}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>

            {activeResult ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Synthesis & Telemetry */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Synthèse documentaire certifiée
                        </h3>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {activeResult.llmProvider} / {activeResult.llmModel} · Confiance{" "}
                          {(activeResult.confidence * 100).toFixed(0)} % · Filtre{" "}
                          {activeResult.clearanceApplied}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleExportDocx()}
                        disabled={exportingDocx}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                      >
                        <FileDown size={13} />
                        {exportingDocx ? "Export…" : "Exporter note .docx certifiée"}
                      </button>
                    </div>

                    <div className="space-y-3 text-sm leading-relaxed text-foreground">
                      <Markdown>{activeResult.answer}</Markdown>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
                      <div className="rounded-lg border border-border bg-background p-2.5">
                        <span className="text-[11px] text-muted-foreground block">Latence BM25</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {activeResult.bm25LatencyMs} ms
                        </span>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-2.5">
                        <span className="text-[11px] text-muted-foreground block">
                          Latence Vecteurs
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {activeResult.vectorLatencyMs} ms
                        </span>
                      </div>
                      <div className="rounded-lg border border-border bg-background p-2.5">
                        <span className="text-[11px] text-muted-foreground block">
                          Total Pipeline
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-primary">
                          {activeResult.totalLatencyMs} ms
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                      <div className="break-all">Query SHA-256 : {activeResult.queryHash}</div>
                      <div className="break-all">
                        Racine Merkle des preuves : {activeResult.merkleProofRoot}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cryptographic Citations */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Citations &amp; Preuves Cryptographiques ({activeResult.citations.length})
                      </h3>
                      <Fingerprint size={16} className="text-primary" />
                    </div>

                    {activeResult.citations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Aucune citation correspondante pour ce filtre PSSI.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
                        {activeResult.citations.map((cit) => {
                          const key = `${cit.chunkHash}:${cit.citationIndex}`;
                          const verification = proofResults[key];
                          const isVerifying = verifyingKey === key;

                          return (
                            <div
                              key={key}
                              className="rounded-xl border border-border bg-background/70 p-3.5 text-xs space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-foreground">
                                  [{cit.citationIndex}] {cit.documentTitle}
                                </span>
                                <span className="font-mono text-[11px] text-primary">
                                  {cit.classification} · Page {cit.pageNumber}
                                </span>
                              </div>

                              <p className="text-muted-foreground leading-relaxed">{cit.excerpt}</p>

                              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] border-t border-border pt-2">
                                <div>
                                  <span className="text-muted-foreground block">BM25</span>
                                  <span className="font-semibold tabular-nums">
                                    {cit.bm25Score.toFixed(4)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block">Vecteur</span>
                                  <span className="font-semibold tabular-nums">
                                    {cit.vectorScore.toFixed(4)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block">RRF</span>
                                  <span className="font-semibold tabular-nums text-primary">
                                    {cit.rrfScore.toFixed(5)}
                                  </span>
                                </div>
                              </div>

                              <div className="font-mono text-[10px] text-muted-foreground break-all space-y-0.5">
                                <div>Chunk SHA-256 : {cit.chunkHash}</div>
                                <div>Reçu HMAC : {cit.proofReceipt.slice(0, 36)}...</div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={isVerifying}
                                  onClick={() =>
                                    void handleVerifyCitation(cit, activeResult.queryHash)
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  <FileCheck2 size={12} />
                                  {isVerifying ? "Vérification…" : "Vérifier preuve SHA-256"}
                                </button>

                                {verification && (
                                  <span
                                    className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold ${
                                      verification.valid
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-red-600 dark:text-red-400"
                                    }`}
                                  >
                                    {verification.valid ? (
                                      <CheckCircle2 size={13} />
                                    ) : (
                                      <ShieldAlert size={13} />
                                    )}
                                    {verification.valid ? "PREUVE VALIDE" : "PREUVE INVALIDE"}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-6 text-xs text-muted-foreground">
                {loading
                  ? "Chargement des index et de l'historique RAG…"
                  : "Soumettez une question ci-dessus pour inspecter les scores BM25, vecteurs denses, RRF et preuves SHA-256."}
              </div>
            )}

            {queries.length > 0 && (
              <section className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground">
                  Requêtes scellées récentes ({queries.length})
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {queries.slice(0, 6).map((q) => (
                    <button
                      key={q.queryId}
                      type="button"
                      onClick={() => {
                        setActiveResult(q);
                        setProofResults({});
                      }}
                      className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                        activeResult?.queryId === q.queryId
                          ? "border-primary bg-primary/5"
                          : "border-border bg-background/60 hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                        <span>{q.queryId}</span>
                        <span>{q.totalLatencyMs} ms</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-foreground font-medium">{q.answer}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: Coffre Documentaire */}
        {tab === "vault" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleIngestDocument}
              className="lg:col-span-5 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm h-fit"
            >
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Indexer un document dans le coffre isolé
                </h2>
                <p className="text-xs text-muted-foreground">
                  Découpage sémantique, vectorisation 128-dim, indexation BM25 et calcul d&apos;arbre de Merkle SHA-256.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Importer un fichier texte (.txt, .md, .csv, .json)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.csv,.json,.log"
                  onChange={handleFileSelect}
                  className="block w-full text-xs text-muted-foreground"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Titre du document
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Ex. Politique d'Accès PSSI 2026"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Direction / Entité
                  </label>
                  <input
                    type="text"
                    value={docDept}
                    onChange={(e) => setDocDept(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Classification PSSI
                  </label>
                  <select
                    value={docClass}
                    onChange={(e) => setDocClass(e.target.value as ClassificationLevel)}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
                  >
                    <option value="PUBLIC">PUBLIC</option>
                    <option value="INTERNE">INTERNE</option>
                    <option value="RESTREINT">RESTREINT</option>
                    <option value="CONFIDENTIEL">CONFIDENTIEL</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Contenu documentaire brut
                </label>
                <textarea
                  rows={7}
                  required
                  minLength={10}
                  placeholder="Collez le texte de la procédure, directive ou note technique..."
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={ingesting}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <FilePlus2 size={14} />
                {ingesting ? "Scellement & Indexation…" : "Sceller SHA-256 et indexer"}
              </button>
            </form>

            <div className="lg:col-span-7 space-y-3">
              {documents.map((doc) => {
                const isExpanded = expandedDocId === doc.id;
                return (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-foreground text-sm">
                            {doc.title}
                          </span>
                          <span className="font-mono text-[11px] text-primary">
                            {doc.classification}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {doc.fileName} · {doc.department} · {doc.chunks.length} fragments ·{" "}
                          {doc.sizeBytes} octets · v{doc.version}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          Fragments
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDocument(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:text-red-400 hover:bg-red-500/20"
                          title="Retirer du coffre"
                        >
                          <Trash2 size={13} /> Retirer
                        </button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-[10px] text-muted-foreground space-y-1 break-all">
                      <div>Document SHA-256 : {doc.documentHash}</div>
                      <div>Racine Merkle : {doc.merkleRoot}</div>
                    </div>

                    {isExpanded && (
                      <div className="space-y-2 border-t border-border pt-3">
                        {doc.chunks.map((ch) => (
                          <div
                            key={ch.id}
                            className="rounded-lg border border-border bg-background p-3 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                              <span>
                                Fragment #{ch.chunkIndex + 1} · Page {ch.pageNumber}
                              </span>
                              <span>SHA-256 : {ch.chunkHash.slice(0, 18)}...</span>
                            </div>
                            <p className="text-foreground leading-relaxed">{ch.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: Audit & Conformité SecNumCloud */}
        {tab === "audit" && (
          <div className="space-y-6">
            {compliance && (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {compliance.secNumCloudControls.map((ctrl) => (
                  <div
                    key={ctrl.code}
                    className="rounded-xl border border-border bg-card p-4 space-y-1.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-muted-foreground">{ctrl.code}</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {ctrl.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-foreground">{ctrl.label}</p>
                  </div>
                ))}
              </section>
            )}

            <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Registre d&apos;Audit Immuable Chaîné SHA-256 ({audit.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chaque événement scelle le condensat de l&apos;événement précédent pour prévenir toute falsification du journal de conformité.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Horodatage</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Acteur</th>
                      <th className="py-2 pr-3">PSSI</th>
                      <th className="py-2 pr-3">Détail</th>
                      <th className="py-2 pr-3">Latence</th>
                      <th className="py-2 pr-3">Condensat précédent</th>
                      <th className="py-2">Condensat SHA-256</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {audit.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString("fr-FR")}
                        </td>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-[11px] text-foreground">
                          {entry.action}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[11px]">
                          {entry.actorEmail} ({entry.actorRole})
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-primary">
                          {entry.classification}
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground max-w-xs truncate">
                          {entry.resourceSummary}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[11px] tabular-nums">
                          {entry.latencyMs} ms
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[10px] text-muted-foreground">
                          {entry.prevEventHash.slice(0, 14)}...
                        </td>
                        <td className="py-2.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                          {entry.eventHash.slice(0, 14)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
