import axios, { type InternalAxiosRequestConfig } from "axios";

const rawBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
const baseURL =
  !rawBaseUrl || rawBaseUrl === "/api"
    ? "/api"
    : rawBaseUrl.toLowerCase().endsWith("/api")
      ? rawBaseUrl
      : `${rawBaseUrl}/api`;
let memorySessionToken: string | null = null;

function getStoredToken(): string | null {
  return memorySessionToken;
}

function setStoredToken(token: string | null): void {
  memorySessionToken = token;
}

export const api = axios.create({
  baseURL,
  timeout: 25000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    if (status === 401) {
      setStoredToken(null);
      return Promise.reject(error);
    }

    const isGet = config?.method?.toLowerCase() === "get";
    const isTransient = !status || status === 502 || status === 503 || status === 504;
    if (config && isGet && isTransient && !config._retried) {
      config._retried = true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export type Permission =
  | "meal:read"
  | "meal:export"
  | "meal:run_agent"
  | "meal:ingest"
  | "meal:validate"
  | "meal:rollback"
  | "rules:edit"
  | "knowledge:read"
  | "knowledge:write"
  | "spaces:create"
  | "users:manage";

export type AccountStatus = "active" | "pending" | "suspended" | "rejected";
export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "COORDINATEUR"
  | "ANALYSTE"
  | "LECTEUR"
  | "USER";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole | string;
  department: string;
  status?: AccountStatus;
  permissions?: Permission[];
  createdAt?: string;
  validatedBy?: string;
  validatedAt?: string;
}

export interface PermissionOption {
  code: Permission;
  label: string;
}

export interface UsersDirectoryResponse {
  users: AuthUser[];
  spaces: UserSpace[];
  availablePermissions: PermissionOption[];
  rolePresets: Record<string, Permission[]>;
}

export interface UserSpace {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  ownerUserId: string;
  memberUserIds: string[];
  createdAt: string;
}

export interface DataSourceConfig {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string;
  type: "csv" | "excel" | "commcare" | "generic";
  format?: "json" | "kobo" | "odk";
  status: string;
  endpointUrl?: string;
  authTokenEnvName?: string;
  lastCursorDate?: string;
  lastCursorId?: string;
  lastSyncAt?: string;
  recordsCount: number;
  createdAt: string;
}

export interface NormalizedRecord {
  id: string;
  externalId: string;
  sourceId: string;
  sourceType: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  age: number | null;
  amount: number | null;
  latitude: number | null;
  longitude: number | null;
  zone: string | null;
  enumeratorId?: string | null;
  status: "active" | "archived" | "merged";
  mergedIntoId?: string;
  archivedReason?: string;
  createdAt: string;
}

export interface DataRun {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  recordsIngested: number;
  recordsSkippedIdempotent: number;
  recordsProcessed: number;
  duplicatesFound: number;
  anomaliesBySeverity: Record<"bloquante" | "a_verifier" | "mineure", number>;
  autoActionsCount: number;
  pendingValidationsCount: number;
  llmCallsCount?: number;
  llmProvider?: string;
  llmModel?: string;
  tokensUsed: number;
  estimatedCostUsd: number;
  summaryText?: string;
  notificationChannels?: string[];
}

export interface Anomaly {
  id: string;
  runId: string;
  recordId: string;
  relatedRecordId?: string;
  ruleId: string;
  category: string;
  severity: "bloquante" | "a_verifier" | "mineure";
  field?: string;
  message: string;
  similarityScore?: number;
  status: string;
  createdAt: string;
}

export interface ValidationItem {
  id: string;
  runId: string;
  anomalyId?: string;
  actionType: "merge" | "archive" | "review_batch";
  title: string;
  description: string;
  primaryRecordId: string;
  secondaryRecordId?: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface AgentAction {
  id: string;
  runId: string;
  timestamp: string;
  toolName: string;
  output?: Record<string, unknown>;
  decision: string;
  confidence: number;
  author: "agent" | "human";
  llmProvider?: string;
  llmModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  durationMs?: number;
  reversible: boolean;
  reverted: boolean;
  revertedAt?: string;
}

export interface RuleFeedbackStat {
  tenantId: string;
  spaceId: string;
  ruleId: string;
  approvedCount: number;
  rejectedCount: number;
  totalCount: number;
  rejectionRate: number;
  updatedAt: string;
}

export interface RuleThresholdSuggestion {
  ruleId: string;
  rejectionRate: number;
  rejectedCount: number;
  totalCount: number;
  currentSetting: string;
  suggestedAction: string;
  rationale: string;
}

export interface EvalMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}

export interface UnexpectedCaseResult {
  externalId: string;
  errorType: string;
  description: string;
  caughtByYaml: boolean;
  caughtByAgent: boolean;
  detectedReasons: string[];
}

export interface UnexpectedEvalReport {
  totalRows: number;
  totalUnexpectedErrors: number;
  yamlBaseline: EvalMetrics;
  agentDetector: EvalMetrics;
  falsePositiveExternalIds: string[];
  cases: UnexpectedCaseResult[];
  evaluatedAt: string;
}

export interface MealIndicators {
  activeBeneficiaries: number;
  cleanedRecords: number;
  zonesCoveredCount: number;
  zonesCovered: string[];
  enumeratorsCount: number;
  copyPasteAlerts: number;
  totalAmountDisbursed: number;
}

export interface NlqResponse {
  language: "fr" | "mg";
  answer: string;
  readOnly: true;
  scope: { tenantId: string; spaceId: string };
  toolUsed: string;
  metric: string;
  data: Record<string, unknown>;
  llmProvider: string;
  llmModel: string;
  tokensUsed: number;
}

export function isUnauthorizedError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401;
}

export function describeApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : "Erreur inconnue";
  }
  const status = err.response?.status;
  const serverMsg =
    typeof err.response?.data === "object" &&
    err.response?.data !== null &&
    "message" in err.response.data
      ? String((err.response.data as { message?: unknown }).message || "")
      : "";
  if (serverMsg) return status ? `HTTP ${status} — ${serverMsg}` : serverMsg;
  if (status) return `HTTP ${status} (${err.response?.statusText || "Erreur serveur"})`;
  if (err.code === "ECONNABORTED") {
    return "Délai dépassé : le serveur backend met du temps à démarrer.";
  }
  return "Backend injoignable (vérifiez NEXT_PUBLIC_API_URL, BACKEND_URL ou CORS_ORIGIN).";
}

export const guardianApi = {
  login: (email: string, password: string) =>
    api
      .post<{ user: AuthUser; token: string; spaces: UserSpace[] }>("/auth/login", {
        email,
        password,
      })
      .then((r) => {
        if (r.data?.token) setStoredToken(r.data.token);
        return r.data;
      }),
  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    requestedRole?: "COORDINATEUR" | "ANALYSTE" | "LECTEUR";
  }) =>
    api
      .post<{
        registered: boolean;
        status: AccountStatus;
        message: string;
        user: AuthUser;
      }>("/auth/register", payload)
      .then((r) => r.data),
  logout: () =>
    api
      .post<{ loggedOut: boolean }>("/auth/logout")
      .then((r) => r.data)
      .finally(() => {
        setStoredToken(null);
      }),
  me: () => api.get<{ user: AuthUser; spaces: UserSpace[] }>("/auth/me").then((r) => r.data),

  getUsers: () => api.get<UsersDirectoryResponse>("/users").then((r) => r.data),
  createUserByAdmin: (payload: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    role: UserRole;
    permissions?: Permission[];
    spaceIds?: string[];
  }) => api.post<{ user: AuthUser }>("/users", payload).then((r) => r.data),
  approveUser: (payload: {
    userId: string;
    decision: "approve" | "reject";
    role?: UserRole;
    permissions?: Permission[];
    spaceIds?: string[];
  }) => api.post<{ user: AuthUser }>("/users/approve", payload).then((r) => r.data),
  updateUserPermissions: (payload: {
    userId: string;
    role?: UserRole;
    permissions?: Permission[];
    status?: "active" | "suspended";
    spaceIds?: string[];
  }) => api.put<{ user: AuthUser }>("/users/permissions", payload).then((r) => r.data),

  getSpaces: () => api.get<{ spaces: UserSpace[] }>("/spaces").then((r) => r.data),
  createSpace: (name: string, description = "") =>
    api.post<{ space: UserSpace }>("/spaces", { name, description }).then((r) => r.data),

  getSources: (spaceId: string) =>
    api
      .get<{ tenantId: string; spaceId: string; sources: DataSourceConfig[] }>("/sources", {
        params: { spaceId },
      })
      .then((r) => r.data),
  registerSource: (payload: {
    spaceId: string;
    name: string;
    type: "csv" | "excel" | "commcare" | "generic";
    format?: "json" | "kobo" | "odk";
    endpointUrl?: string;
    authTokenEnvName?: string;
  }) => api.post<{ source: DataSourceConfig }>("/sources", payload).then((r) => r.data),

  ingestFile: (payload: {
    spaceId: string;
    fileName: string;
    fileBase64: string;
    columnMapping?: Record<string, string>;
  }) =>
    api
      .post<{
        ingest: { insertedCount: number; skippedIdempotentCount: number };
        run: DataRun;
      }>("/sources/ingest", payload)
      .then((r) => r.data),

  ingestJson: (payload: {
    spaceId: string;
    sourceId?: string;
    rawItems: Record<string, unknown>[];
  }) =>
    api
      .post<{
        ingest: { insertedCount: number; skippedIdempotentCount: number };
        run: DataRun;
      }>("/sources/ingest", payload)
      .then((r) => r.data),

  getRuns: (spaceId: string) =>
    api
      .get<{
        tenantId: string;
        spaceId: string;
        runs: DataRun[];
        anomalies: Anomaly[];
        emailSummaries?: RunEmailSummary[];
        alertSettings?: SpaceAlertSettings;
        enumeratorScorecard?: EnumeratorScorecard[];
        zoneBreakdown?: ZoneBreakdown[];
        automation?: AutomationStatus;
        mealIndicators?: MealIndicators;
      }>("/runs", {
        params: { spaceId },
      })
      .then((r) => r.data),

  triggerRun: (
    spaceId: string,
    mode:
      | "agent"
      | "nightly"
      | "autonomous_sync"
      | "demo_kobo_ingest"
      | "inbox_drop" = "agent"
  ) => api.post("/runs", { spaceId, mode }).then((r) => r.data),

  getRecords: (spaceId: string, includeArchived = true) =>
    api
      .get<{ records: NormalizedRecord[] }>("/records", {
        params: { spaceId, includeArchived: includeArchived ? "true" : "false" },
      })
      .then((r) => r.data),

  getRules: (spaceId: string) =>
    api.get<{ rawYaml: string }>("/rules", { params: { spaceId } }).then((r) => r.data),
  saveRules: (spaceId: string, yaml: string) =>
    api.put<{ rawYaml: string }>("/rules", { spaceId, yaml }).then((r) => r.data),
  getRuleFeedback: (spaceId: string) =>
    api
      .get<{
        tenantId: string;
        spaceId: string;
        feedback: RuleFeedbackStat[];
        suggestions: RuleThresholdSuggestion[];
      }>("/rules/feedback", { params: { spaceId } })
      .then((r) => r.data),

  getUnexpectedEvaluation: (spaceId: string) =>
    api
      .get<UnexpectedEvalReport>("/evaluation/unexpected", { params: { spaceId } })
      .then((r) => r.data),

  downloadWeeklyDocx: async (spaceId: string): Promise<{ blob: Blob; fileName: string }> => {
    const resp = await api.get<Blob>("/reports/weekly", {
      params: { spaceId },
      responseType: "blob",
    });
    const cd = String(resp.headers["content-disposition"] || "");
    const match = /filename="([^"]+)"/.exec(cd);
    return {
      blob: resp.data,
      fileName: match?.[1] || `rapport-hebdo-${spaceId}.docx`,
    };
  },

  downloadCleanCsv: async (
    spaceId: string,
    includeFlagged = false
  ): Promise<{ blob: Blob; fileName: string }> => {
    const resp = await api.get<Blob>("/records/export", {
      params: { spaceId, includeFlagged: includeFlagged ? "true" : "false" },
      responseType: "blob",
    });
    const cd = String(resp.headers["content-disposition"] || "");
    const match = /filename="([^"]+)"/.exec(cd);
    return {
      blob: resp.data,
      fileName: match?.[1] || `donnees-propres-${spaceId}.csv`,
    };
  },

  saveSpaceAlertSettings: (
    spaceId: string,
    payload: { alertEmail: string; notifyOnEveryRun?: boolean }
  ) =>
    api
      .put<{ settings: SpaceAlertSettings }>("/runs/settings", { spaceId, ...payload })
      .then((r) => r.data),

  askQuestion: (spaceId: string, question: string) =>
    api.post<NlqResponse>("/query", { spaceId, question }).then((r) => r.data),

  getValidations: (spaceId: string) =>
    api
      .get<{ validations: ValidationItem[] }>("/validations", { params: { spaceId } })
      .then((r) => r.data),
  decideValidation: (spaceId: string, validationId: string, decision: "approved" | "rejected") =>
    api.post("/validations", { spaceId, validationId, decision }).then((r) => r.data),

  getActions: (spaceId: string) =>
    api.get<{ actions: AgentAction[] }>("/actions", { params: { spaceId } }).then((r) => r.data),
  rollbackAction: (spaceId: string, actionId: string) =>
    api.post("/actions", { spaceId, actionId }).then((r) => r.data),

  // Sovereign Knowledge Engine (RAG BM25 + Vecteurs Denses + Cryptographic Citations)
  getKnowledgeDocuments: (spaceId: string) =>
    api
      .get<{ tenantId: string; spaceId: string; documents: KnowledgeDocument[] }>(
        "/knowledge/documents",
        { params: { spaceId } }
      )
      .then((r) => r.data),

  ingestKnowledgeDocument: (payload: {
    spaceId: string;
    title: string;
    fileName: string;
    content: string;
    department?: string;
    classification: ClassificationLevel;
  }) =>
    api
      .post<{ document: KnowledgeDocument }>("/knowledge/documents", payload)
      .then((r) => r.data),

  deleteKnowledgeDocument: (spaceId: string, documentId: string) =>
    api
      .delete<{ deleted: boolean; id: string }>(
        `/knowledge/documents/${encodeURIComponent(documentId)}`,
        { params: { spaceId } }
      )
      .then((r) => r.data),

  queryKnowledge: (payload: {
    spaceId: string;
    question: string;
    clearanceFilter?: ClassificationLevel | "ALL";
  }) => api.post<KnowledgeQueryResult>("/knowledge/query", payload).then((r) => r.data),

  getKnowledgeQueries: (spaceId: string) =>
    api
      .get<{ queries: KnowledgeQueryResult[] }>("/knowledge/queries", { params: { spaceId } })
      .then((r) => r.data),

  verifyCitationProof: (payload: {
    spaceId: string;
    chunkHash: string;
    queryHash: string;
    sealedAt: string;
    proofReceipt: string;
  }) => api.post<ProofVerificationResult>("/knowledge/verify-proof", payload).then((r) => r.data),

  exportBriefingDocx: async (payload: {
    spaceId: string;
    question: string;
    answer: string;
    queryHash: string;
    merkleProofRoot: string;
    citations: CryptographicCitation[];
  }): Promise<{ blob: Blob; fileName: string }> => {
    const resp = await api.post<Blob>("/knowledge/export-docx", payload, {
      responseType: "blob",
    });
    const cd = String(resp.headers["content-disposition"] || "");
    const match = /filename="([^"]+)"/.exec(cd);
    return {
      blob: resp.data,
      fileName: match?.[1] || `synthese-certifiee-${payload.spaceId}.docx`,
    };
  },

  getKnowledgeAudit: (spaceId: string) =>
    api
      .get<{
        tenantId: string;
        spaceId: string;
        audit: AuditLedgerEntry[];
        compliance: ComplianceMetrics;
      }>("/knowledge/audit", { params: { spaceId } })
      .then((r) => r.data),

  submitEnterpriseContact: (payload: {
    organization: string;
    contactName: string;
    email: string;
    employeeCount: string;
    deploymentMode: "SecNumCloud" | "On-Premise" | "Hybride";
    message: string;
  }) =>
    api
      .post<{ ticketId: string; status: string; message: string; createdAt: string }>(
        "/contact/enterprise",
        payload
      )
      .then((r) => r.data),
};

export type ClassificationLevel = "PUBLIC" | "INTERNE" | "RESTREINT" | "CONFIDENTIEL";

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  excerpt: string;
  chunkHash: string;
}

export interface KnowledgeDocument {
  id: string;
  tenantId: string;
  spaceId: string;
  title: string;
  fileName: string;
  department: string;
  classification: ClassificationLevel;
  version: number;
  sizeBytes: number;
  documentHash: string;
  merkleRoot: string;
  uploadedBy: string;
  createdAt: string;
  chunks: KnowledgeChunk[];
}

export interface CryptographicCitation {
  citationIndex: number;
  documentId: string;
  documentTitle: string;
  classification: ClassificationLevel;
  pageNumber: number;
  chunkIndex: number;
  excerpt: string;
  bm25Score: number;
  vectorScore: number;
  rrfScore: number;
  chunkHash: string;
  documentHash: string;
  proofReceipt: string;
  sealedAt: string;
}

export interface KnowledgeQueryResult {
  queryId: string;
  queryHash: string;
  merkleProofRoot: string;
  answer: string;
  citations: CryptographicCitation[];
  confidence: number;
  bm25LatencyMs: number;
  vectorLatencyMs: number;
  totalLatencyMs: number;
  llmProvider: string;
  llmModel: string;
  tenantId: string;
  spaceId: string;
  clearanceApplied: string;
  createdAt: string;
}

export interface ProofVerificationResult {
  valid: boolean;
  algorithm: string;
  chunkFoundInTenant: boolean;
  documentTitle?: string;
  classification?: ClassificationLevel;
  chunkHash: string;
  verifiedAt: string;
}

export interface AuditLedgerEntry {
  id: string;
  tenantId: string;
  spaceId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  classification: ClassificationLevel;
  resourceSummary: string;
  latencyMs: number;
  prevEventHash: string;
  eventHash: string;
  timestamp: string;
}

export interface ComplianceMetrics {
  tenantId: string;
  spaceId: string;
  documentsCount: number;
  chunksCount: number;
  queriesCount: number;
  auditEntriesCount: number;
  avgLatencyMs: number;
  secNumCloudControls: Array<{ code: string; label: string; status: string }>;
}

export interface RunEmailSummary {
  id: string;
  tenantId: string;
  spaceId: string;
  runId: string;
  subject: string;
  recipient: string;
  channels: string[];
  emailSent: boolean;
  emailProvider?: "resend" | "smtp";
  summaryText: string;
  sentAt: string;
}

export interface AutomationStatus {
  nightlyCron: string;
  pollingCron: string;
  inboxWatched: boolean;
}

export interface SpaceAlertSettings {
  alertEmail: string;
  notifyOnEveryRun: boolean;
  webhookSecret: string;
}

export interface EnumeratorScorecard {
  enumeratorId: string;
  totalSubmissions: number;
  cleanSubmissions: number;
  anomaliesCount: number;
  copyPasteAlerts: number;
  geoAlerts: number;
  reliabilityScore: number;
}

export interface ZoneBreakdown {
  zone: string;
  activeBeneficiaries: number;
  totalAmount: number;
  anomaliesCount: number;
}


