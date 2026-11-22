import { z } from "zod";

/**
 * Contexte d'isolation multitenant strict injecté côté serveur.
 * L'agent LLM et les routes client ne manipulent jamais directement
 * ces identifiants en paramètre libre pour éviter toute fuite entre espaces.
 */
export interface TenantSpaceContext {
  tenantId: string;
  spaceId: string;
  userId: string;
}

/**
 * Espace utilisateur / projet rattaché à un tenant.
 */
export interface UserSpace {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  ownerUserId: string;
  memberUserIds: string[];
  createdAt: string;
}

export type ConnectorKind = "csv" | "excel" | "commcare" | "generic";
export type GenericFormat = "json" | "kobo" | "odk";

/**
 * Configuration d'une source connectée à un espace (tenantId, spaceId).
 */
export interface DataSourceConfig {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string;
  type: ConnectorKind;
  format?: GenericFormat;
  status: "ACTIVE" | "SYNCING" | "IDLE" | "ERROR";
  /** Mapping configurable : { colonneSource: champInterne } */
  columnMapping?: Record<string, string>;
  /** Configuration spécifique CommCare ou connecteur générique */
  endpointUrl?: string;
  authTokenEnvName?: string;
  recordsPath?: string;
  externalIdField?: string;
  geoField?: string;
  /** Curseur d'ingestion incrémentale (CommCare / API) */
  lastCursorDate?: string;
  lastCursorId?: string;
  lastSyncAt?: string;
  recordsCount: number;
  createdAt: string;
}

/**
 * Enregistrement brut immuable : conservé tel quel, jamais modifié.
 */
export interface RawRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly spaceId: string;
  readonly sourceId: string;
  readonly sourceType: ConnectorKind;
  readonly externalId: string;
  readonly payloadHash: string;
  readonly rawPayload: Readonly<Record<string, unknown>>;
  readonly rawFormat: string;
  readonly detectedEncoding?: string;
  readonly detectedDelimiter?: string;
  readonly ingestedAt: string;
}

/**
 * Schéma interne normalisé commun à toutes les sources (CSV, Excel, CommCare, Kobo, ODK, JSON).
 */
export const NormalizedRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  spaceId: z.string(),
  rawRecordId: z.string(),
  sourceId: z.string(),
  sourceType: z.enum(["csv", "excel", "commcare", "generic"]),
  externalId: z.string(),
  payloadHash: z.string(),
  recordKey: z.string(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  age: z.number().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  recordedAt: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  zone: z.string().nullable(),
  status: z.enum(["active", "archived", "merged"]),
  mergedIntoId: z.string().optional(),
  archivedAt: z.string().optional(),
  archivedReason: z.string().optional(),
  extra: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NormalizedRecord = z.infer<typeof NormalizedRecordSchema>;

/**
 * Types préparés pour le moteur de contrôle, l'agent LLM et l'audit (Étapes 2 et 3).
 */
export type AnomalySeverity = "bloquante" | "a_verifier" | "mineure";

export interface Anomaly {
  id: string;
  tenantId: string;
  spaceId: string;
  runId: string;
  recordId: string;
  relatedRecordId?: string;
  ruleId: string;
  category: "exact_duplicate" | "near_duplicate" | "outlier" | "missing_required" | "geo_out_of_bounds" | "format";
  severity: AnomalySeverity;
  field?: string;
  message: string;
  similarityScore?: number;
  status: "open" | "auto_resolved" | "pending_validation" | "resolved" | "ignored";
  createdAt: string;
}

export interface DataRun {
  id: string;
  tenantId: string;
  spaceId: string;
  sourceId: string;
  trigger: "upload" | "submission" | "nightly_schedule" | "manual";
  status: "running" | "completed" | "awaiting_validation" | "failed" | "aborted_guardrail";
  startedAt: string;
  finishedAt?: string;
  recordsIngested: number;
  recordsSkippedIdempotent: number;
  recordsProcessed: number;
  duplicatesFound: number;
  anomaliesBySeverity: Record<AnomalySeverity, number>;
  autoActionsCount: number;
  pendingValidationsCount: number;
  tokensUsed: number;
  estimatedCostUsd: number;
  summaryText?: string;
  notificationChannels?: string[];
}

export interface ValidationItem {
  id: string;
  tenantId: string;
  spaceId: string;
  runId: string;
  anomalyId?: string;
  actionType: "merge" | "archive" | "review_batch";
  title: string;
  description: string;
  primaryRecordId: string;
  secondaryRecordId?: string;
  confidence: number;
  proposedPayload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface AgentAction {
  id: string;
  tenantId: string;
  spaceId: string;
  runId: string;
  timestamp: string;
  toolName: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  decision: string;
  confidence: number;
  author: "agent" | "human";
  authorId?: string;
  reversible: boolean;
  reverted: boolean;
  revertedAt?: string;
  revertedBy?: string;
  /** État avant modification permettant une annulation exacte */
  snapshotBefore?: Record<string, unknown>;
}

/**
 * Entrée générique passée à un connecteur SourceConnector.
 */
export interface ConnectorInput {
  source: DataSourceConfig;
  /** Contenu binaire d'un fichier CSV ou Excel */
  fileBuffer?: Buffer | Uint8Array;
  fileName?: string;
  /** Données JSON directes (pour tests, webhooks ou import manuel) */
  rawItems?: Record<string, unknown>[];
  /** Surcharge ponctuelle du mapping */
  columnMapping?: Record<string, string>;
  /** Limite max d'items à récupérer */
  limit?: number;
}

export interface ConnectorIngestResult {
  sourceId: string;
  sourceType: ConnectorKind;
  totalRead: number;
  insertedCount: number;
  skippedIdempotentCount: number;
  detectedEncoding?: string;
  detectedDelimiter?: string;
  newCursorDate?: string;
  newCursorId?: string;
  rawRecords: RawRecord[];
  normalizedRecords: NormalizedRecord[];
}

/**
 * Interface commune obligatoire pour tous les connecteurs d'ingestion.
 */
export interface SourceConnector {
  readonly type: ConnectorKind;
  ingest(input: ConnectorInput, ctx: TenantSpaceContext): Promise<ConnectorIngestResult>;
}
