import axios from "axios";

const rawBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
const baseURL = rawBaseUrl ? `${rawBaseUrl}/api` : "/api";

const ACTIVE_USER_KEY = "gardien_active_user_id";

export function getActiveUserId(): string {
  if (typeof window === "undefined") return "u-1";
  return window.localStorage.getItem(ACTIVE_USER_KEY) || "u-1";
}

export function setActiveUserId(userId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_USER_KEY, userId);
}

export const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    config.headers = config.headers || {};
    config.headers["X-User-Id"] = getActiveUserId();
  }
  return config;
});

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
  recordsIngested: number;
  recordsSkippedIdempotent: number;
  recordsProcessed: number;
  duplicatesFound: number;
  anomaliesBySeverity: Record<"bloquante" | "a_verifier" | "mineure", number>;
  autoActionsCount: number;
  pendingValidationsCount: number;
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
  reversible: boolean;
  reverted: boolean;
  revertedAt?: string;
}

export const guardianApi = {
  getSpaces: () => api.get<{ spaces: UserSpace[] }>("/spaces").then((r) => r.data),
  createSpace: (name: string, description = "") =>
    api.post<{ space: UserSpace }>("/spaces", { name, description }).then((r) => r.data),

  getSources: (spaceId: string) =>
    api.get<{ tenantId: string; spaceId: string; sources: DataSourceConfig[] }>("/sources", { params: { spaceId } }).then((r) => r.data),
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
      .get<{ tenantId: string; spaceId: string; runs: DataRun[]; anomalies: Anomaly[] }>("/runs", {
        params: { spaceId },
      })
      .then((r) => r.data),

  triggerRun: (spaceId: string, mode: "agent" | "nightly" = "agent") =>
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

  getValidations: (spaceId: string) =>
    api.get<{ validations: ValidationItem[] }>("/validations", { params: { spaceId } }).then((r) => r.data),
  decideValidation: (spaceId: string, validationId: string, decision: "approved" | "rejected") =>
    api.post("/validations", { spaceId, validationId, decision }).then((r) => r.data),

  getActions: (spaceId: string) =>
    api.get<{ actions: AgentAction[] }>("/actions", { params: { spaceId } }).then((r) => r.data),
  rollbackAction: (spaceId: string, actionId: string) =>
    api.post("/actions", { spaceId, actionId }).then((r) => r.data),
};
