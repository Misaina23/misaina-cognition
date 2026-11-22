import axios from "axios";

const rawBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
const baseURL = rawBaseUrl ? `${rawBaseUrl}/api` : "/api";

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
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
  decision: string;
  confidence: number;
  author: "agent" | "human";
  llmProvider?: string;
  llmModel?: string;
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

export const guardianApi = {
  login: (email: string, password: string) =>
    api
      .post<{ user: AuthUser; token: string; spaces: UserSpace[] }>("/auth/login", {
        email,
        password,
      })
      .then((r) => r.data),
  logout: () => api.post<{ loggedOut: boolean }>("/auth/logout").then((r) => r.data),
  me: () => api.get<{ user: AuthUser; spaces: UserSpace[] }>("/auth/me").then((r) => r.data),

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
        mealIndicators?: MealIndicators;
      }>("/runs", {
        params: { spaceId },
      })
      .then((r) => r.data),

  triggerRun: (spaceId: string, mode: "agent" | "nightly" | "autonomous_sync" = "agent") =>
    api.post("/runs", { spaceId, mode }).then((r) => r.data),

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
};
