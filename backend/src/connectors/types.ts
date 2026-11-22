import { z } from "zod";

/**
 * Contexte d'isolation multitenant strict injecté côté serveur.
 */
export interface TenantSpaceContext {
  tenantId: string;
  spaceId: string;
  userId: string;
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

export type ConnectorKind = "csv" | "excel" | "commcare" | "generic";
export type GenericFormat = "json" | "kobo" | "odk";

export interface DataSourceConfig {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string;
  type: ConnectorKind;
  format?: GenericFormat;
  status: "ACTIVE" | "SYNCING" | "IDLE" | "ERROR";
  columnMapping?: Record<string, string>;
  endpointUrl?: string;
  authTokenEnvName?: string;
  recordsPath?: string;
  externalIdField?: string;
  geoField?: string;
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
 * Schéma interne normalisé commun à toutes les sources.
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
  enumeratorId: z.string().nullable().default(null),
  status: z.enum(["active", "archived", "merged"]),
  mergedIntoId: z.string().optional(),
  archivedAt: z.string().optional(),
  archivedReason: z.string().optional(),
  extra: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NormalizedRecord = z.infer<typeof NormalizedRecordSchema>;

export type AnomalySeverity = "bloquante" | "a_verifier" | "mineure";

export interface Anomaly {
  id: string;
  tenantId: string;
  spaceId: string;
  runId: string;
  recordId: string;
  relatedRecordId?: string;
  ruleId: string;
  category:
    | "exact_duplicate"
    | "near_duplicate"
    | "outlier"
    | "missing_required"
    | "geo_out_of_bounds"
    | "format"
    | "enumerator_copy_paste";
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
  durationMs?: number;
  recordsIngested: number;
  recordsSkippedIdempotent: number;
  recordsProcessed: number;
  duplicatesFound: number;
  anomaliesBySeverity: Record<AnomalySeverity, number>;
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
  llmProvider?: string;
  llmModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  durationMs?: number;
  reversible: boolean;
  reverted: boolean;
  revertedAt?: string;
  revertedBy?: string;
  snapshotBefore?: Record<string, unknown>;
}

export interface ConnectorInput {
  source: DataSourceConfig;
  fileBuffer?: Buffer | Uint8Array;
  fileName?: string;
  rawItems?: Record<string, unknown>[];
  columnMapping?: Record<string, string>;
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
 * Interface commune à tous les connecteurs d'ingestion.
 */
export interface SourceConnector {
  readonly type: ConnectorKind;
  ingest(input: ConnectorInput, ctx: TenantSpaceContext): Promise<ConnectorIngestResult>;
}

import crypto from "node:crypto";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function computeStableHash(payload: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(stableStringify(payload), "utf8").digest("hex");
}

const FIELD_ALIASES: Record<string, string[]> = {
  externalId: ["id", "_id", "__id", "external_id", "record_id", "uuid", "matricule", "case_id"],
  fullName: ["fullname", "full_name", "nom_complet", "nom", "name", "beneficiaire", "beneficiary_name", "patient_name"],
  firstName: ["prenom", "first_name", "firstname", "given_name"],
  lastName: ["nom_famille", "last_name", "lastname", "family_name", "surname"],
  phone: ["phone", "telephone", "tel", "mobile", "phone_number", "num_tel", "contact"],
  email: ["email", "mail", "courriel", "e_mail", "email_address"],
  age: ["age", "years", "age_annees", "age_years"],
  amount: ["amount", "montant", "aide_montant", "grant_amount", "somme", "total", "valeur"],
  currency: ["currency", "devise", "monnaie"],
  recordedAt: ["recorded_at", "date", "submitted_at", "submission_time", "_submission_time", "received_on", "created_at", "date_collecte"],
  latitude: ["latitude", "lat", "gps_lat", "geo_lat"],
  longitude: ["longitude", "lon", "lng", "long", "gps_lon", "geo_lon"],
  zone: ["zone", "region", "localite", "commune", "site", "camp", "location_name", "district", "fokontany"],
  enumeratorId: [
    "enumerator_id",
    "enumerator",
    "enqueteur",
    "enqueteur_id",
    "agent_id",
    "agent_terrain",
    "collector",
    "interviewer",
    "submitted_by",
    "username",
    "mpanadihady",
  ],
};

function cleanKey(k: string): string {
  return k
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, "_");
}

function toStringOrNull(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function toNumberOrNull(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const n = Number(String(val).trim().replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function extractGeoCoordinates(
  mapped: Record<string, unknown>,
  raw: Record<string, unknown>,
  geoField?: string
): { latitude: number | null; longitude: number | null } {
  let lat = toNumberOrNull(mapped.latitude);
  let lon = toNumberOrNull(mapped.longitude);
  if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };

  const candidates = [geoField, "_geolocation", "geolocation", "location", "gps", "coordonnees"].filter(
    Boolean
  ) as string[];
  for (const f of candidates) {
    const val = raw[f] ?? mapped[f];
    if (!val) continue;
    if (Array.isArray(val) && val.length >= 2) {
      lat = toNumberOrNull(val[0]);
      lon = toNumberOrNull(val[1]);
      if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };
    }
    if (typeof val === "string") {
      const parts = val
        .trim()
        .split(/[\s,;]+/)
        .map((p) => toNumberOrNull(p))
        .filter((n): n is number => n !== null);
      if (parts.length >= 2) return { latitude: parts[0], longitude: parts[1] };
    }
    if (typeof val === "object" && val !== null) {
      const o = val as Record<string, unknown>;
      lat = toNumberOrNull(o.latitude ?? o.lat);
      lon = toNumberOrNull(o.longitude ?? o.lon ?? o.lng);
      if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };
    }
  }
  return { latitude: lat, longitude: lon };
}

export function buildNormalizedPair(params: {
  ctx: TenantSpaceContext;
  sourceId: string;
  sourceType: ConnectorKind;
  rawPayload: Record<string, unknown>;
  rawFormat: string;
  columnMapping?: Record<string, string>;
  externalIdField?: string;
  geoField?: string;
  detectedEncoding?: string;
  detectedDelimiter?: string;
  rowIndex?: number;
}): { raw: RawRecord; normalized: NormalizedRecord } {
  const {
    ctx,
    sourceId,
    sourceType,
    rawPayload,
    rawFormat,
    columnMapping = {},
    externalIdField,
    geoField,
    detectedEncoding,
    detectedDelimiter,
    rowIndex = 0,
  } = params;

  const now = new Date().toISOString();
  const payloadHash = computeStableHash(rawPayload);
  const mapped: Record<string, unknown> = {};
  const consumed = new Set<string>();

  for (const [srcKey, targetField] of Object.entries(columnMapping)) {
    if (srcKey in rawPayload) {
      mapped[targetField] = rawPayload[srcKey];
      consumed.add(srcKey);
    }
  }

  for (const [srcKey, value] of Object.entries(rawPayload)) {
    if (consumed.has(srcKey)) continue;
    const nk = cleanKey(srcKey);
    for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
      if (mapped[canonical] !== undefined) continue;
      if (aliases.includes(nk)) {
        mapped[canonical] = value;
        consumed.add(srcKey);
        break;
      }
    }
  }

  let fullName = toStringOrNull(mapped.fullName);
  if (!fullName) {
    const first = toStringOrNull(mapped.firstName);
    const last = toStringOrNull(mapped.lastName);
    if (first || last) fullName = [first, last].filter(Boolean).join(" ").trim();
  }

  const explicitExternal =
    (externalIdField ? toStringOrNull(rawPayload[externalIdField]) : null) ??
    toStringOrNull(mapped.externalId);
  const externalId = explicitExternal || `hash-${payloadHash.slice(0, 16)}-${rowIndex}`;
  const { latitude, longitude } = extractGeoCoordinates(mapped, rawPayload, geoField);

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPayload)) {
    if (!consumed.has(k)) extra[k] = v;
  }

  const rawId = `raw-${sourceId}-${payloadHash.slice(0, 12)}-${Date.now()}-${rowIndex}`;
  const normId = `rec-${sourceId}-${payloadHash.slice(0, 12)}-${Date.now()}-${rowIndex}`;
  const phoneStr = toStringOrNull(mapped.phone);
  const normalizedPhone = phoneStr ? phoneStr.replace(/[^\d+]/g, "") : null;
  const normalizedName = fullName
    ? fullName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";

  const raw: RawRecord = {
    id: rawId,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    sourceId,
    sourceType,
    externalId,
    payloadHash,
    rawPayload: { ...rawPayload },
    rawFormat,
    detectedEncoding,
    detectedDelimiter,
    ingestedAt: now,
  };

  const normalized: NormalizedRecord = {
    id: normId,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    rawRecordId: rawId,
    sourceId,
    sourceType,
    externalId,
    payloadHash,
    recordKey: `${normalizedName}|${normalizedPhone || ""}`,
    fullName,
    phone: phoneStr,
    email: toStringOrNull(mapped.email)?.toLowerCase() ?? null,
    age: toNumberOrNull(mapped.age),
    amount: toNumberOrNull(mapped.amount),
    currency:
      toStringOrNull(mapped.currency) ??
      (mapped.amount !== undefined && mapped.amount !== null ? "EUR" : null),
    recordedAt: toStringOrNull(mapped.recordedAt),
    latitude,
    longitude,
    zone: toStringOrNull(mapped.zone),
    enumeratorId: toStringOrNull(mapped.enumeratorId),
    status: "active",
    extra,
    createdAt: now,
    updatedAt: now,
  };

  return { raw, normalized };
}
