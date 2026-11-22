import axios from "axios";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface DataRun {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  recordsProcessed: number;
  duplicatesFound: number;
  anomaliesBySeverity: Record<"bloquante" | "a_verifier" | "mineure", number>;
  autoActionsCount: number;
  pendingValidationsCount: number;
  summaryText?: string;
}

export interface Anomaly {
  id: string;
  ruleId: string;
  category: string;
  severity: "bloquante" | "a_verifier" | "mineure";
  message: string;
  status: string;
}

export interface ValidationItem {
  id: string;
  runId: string;
  actionType: string;
  title: string;
  description: string;
  primaryRecordId: string;
  secondaryRecordId?: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
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
}

export const guardianApi = {
  getSources: (spaceId: string) => api.get("/sources", { params: { spaceId } }).then((r) => r.data),
  ingestCsvText: (spaceId: string, fileName: string, csvText: string) =>
    api.post("/sources/ingest", { spaceId, fileName, csvText }).then((r) => r.data),
  getRuns: (spaceId: string) =>
    api.get<{ runs: DataRun[]; anomalies: Anomaly[] }>("/runs", { params: { spaceId } }).then((r) => r.data),
  triggerRun: (spaceId: string) => api.post("/runs", { spaceId, mode: "agent" }).then((r) => r.data),
  getValidations: (spaceId: string) =>
    api.get<{ validations: ValidationItem[] }>("/validations", { params: { spaceId } }).then((r) => r.data),
  decideValidation: (spaceId: string, validationId: string, decision: "approved" | "rejected") =>
    api.post("/validations", { spaceId, validationId, decision }).then((r) => r.data),
  getActions: (spaceId: string) =>
    api.get<{ actions: AgentAction[] }>("/actions", { params: { spaceId } }).then((r) => r.data),
  rollbackAction: (spaceId: string, actionId: string) =>
    api.post("/actions", { spaceId, actionId }).then((r) => r.data),
};
