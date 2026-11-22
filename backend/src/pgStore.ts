import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type {
  AgentAction,
  Anomaly,
  DataRun,
  DataSourceConfig,
  NormalizedRecord,
  RawRecord,
  RuleFeedbackStat,
  UserSpace,
  ValidationItem,
} from "./connectors/types";

let pgPool: Pool | undefined;
let pgReadyPromise: Promise<boolean> | undefined;
let pgWriteChain: Promise<void> = Promise.resolve();

function getBackendEnvCandidates(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, ".env"),
    path.join(cwd, ".env.local"),
    path.join(cwd, "backend", ".env"),
  ];
}

function readDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of getBackendEnvCandidates()) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "DATABASE_URL" && val) {
        process.env.DATABASE_URL = val;
        return val;
      }
      if (key === "PGSSL" && val && !process.env.PGSSL) {
        process.env.PGSSL = val;
      }
    }
  }
  return undefined;
}

export function isPgEnabled(): boolean {
  if (process.env.GUARDIAN_DISABLE_PG === "1") return false;
  const isTestScript = process.argv.some((arg) =>
    /[/\\](tests|scripts)[/\\]|evaluate\.|idempotence\.test|isolation\.test/.test(arg)
  );
  if (isTestScript && process.env.GUARDIAN_TEST_PG !== "1") return false;
  return Boolean(readDatabaseUrl());
}

export function getPgPool(): Pool | null {
  const url = readDatabaseUrl();
  if (!url) return null;
  if (!pgPool) {
    const pgSslEnv = process.env.PGSSL?.trim().toLowerCase();
    const needsSsl =
      pgSslEnv === "false" || pgSslEnv === "0"
        ? false
        : pgSslEnv === "true" ||
          pgSslEnv === "1" ||
          url.includes("render.com") ||
          url.includes("sslmode=require");
    pgPool = new Pool({
      connectionString: url,
      max: 10,
      connectionTimeoutMillis: 15000,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
    });
    pgPool.on("error", (err) => {
      console.error("Erreur pool PostgreSQL backend :", err);
    });
  }
  return pgPool;
}

export async function checkPgHealth(): Promise<{
  ok: boolean;
  storage: "postgresql" | "memory";
}> {
  if (!isPgEnabled()) {
    return { ok: true, storage: "memory" };
  }
  const pool = getPgPool();
  if (!pool) return { ok: false, storage: "postgresql" };
  try {
    await pool.query("SELECT 1");
    return { ok: true, storage: "postgresql" };
  } catch {
    return { ok: false, storage: "postgresql" };
  }
}

export async function closePgPool(): Promise<void> {
  if (pgPool) {
    const p = pgPool;
    pgPool = undefined;
    await p.end();
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS guardian_spaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NOT NULL,
  member_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guardian_sources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  format TEXT,
  status TEXT NOT NULL,
  column_mapping JSONB,
  endpoint_url TEXT,
  auth_token_env_name TEXT,
  records_path TEXT,
  external_id_field TEXT,
  geo_field TEXT,
  last_cursor_date TEXT,
  last_cursor_id TEXT,
  last_sync_at TEXT,
  records_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guardian_raw_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  raw_format TEXT NOT NULL,
  detected_encoding TEXT,
  detected_delimiter TEXT,
  ingested_at TEXT NOT NULL,
  UNIQUE (tenant_id, space_id, source_id, payload_hash)
);
CREATE TABLE IF NOT EXISTS guardian_normalized_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  raw_record_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  record_key TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  age DOUBLE PRECISION,
  amount DOUBLE PRECISION,
  currency TEXT,
  recorded_at TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  zone TEXT,
  enumerator_id TEXT,
  status TEXT NOT NULL,
  merged_into_id TEXT,
  archived_at TEXT,
  archived_reason TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE guardian_normalized_records ADD COLUMN IF NOT EXISTS enumerator_id TEXT;
CREATE TABLE IF NOT EXISTS guardian_project_rules (
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  yaml_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, space_id)
);
CREATE TABLE IF NOT EXISTS guardian_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  records_ingested INTEGER NOT NULL DEFAULT 0,
  records_skipped_idempotent INTEGER NOT NULL DEFAULT 0,
  records_processed INTEGER NOT NULL DEFAULT 0,
  duplicates_found INTEGER NOT NULL DEFAULT 0,
  anomalies_by_severity JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_actions_count INTEGER NOT NULL DEFAULT 0,
  pending_validations_count INTEGER NOT NULL DEFAULT 0,
  llm_calls_count INTEGER NOT NULL DEFAULT 0,
  llm_provider TEXT,
  llm_model TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  summary_text TEXT,
  notification_channels JSONB
);
ALTER TABLE guardian_runs ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guardian_runs ADD COLUMN IF NOT EXISTS llm_calls_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guardian_runs ADD COLUMN IF NOT EXISTS llm_provider TEXT;
ALTER TABLE guardian_runs ADD COLUMN IF NOT EXISTS llm_model TEXT;
CREATE TABLE IF NOT EXISTS guardian_rule_feedback (
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, space_id, rule_id)
);
CREATE TABLE IF NOT EXISTS guardian_anomalies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  related_record_id TEXT,
  rule_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  field TEXT,
  message TEXT NOT NULL,
  similarity_score DOUBLE PRECISION,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guardian_validations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  anomaly_id TEXT,
  action_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  primary_record_id TEXT NOT NULL,
  secondary_record_id TEXT,
  confidence DOUBLE PRECISION NOT NULL,
  proposed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  author TEXT NOT NULL,
  author_id TEXT,
  llm_provider TEXT,
  llm_model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  tokens_used INTEGER,
  duration_ms INTEGER,
  reversible BOOLEAN NOT NULL DEFAULT FALSE,
  reverted BOOLEAN NOT NULL DEFAULT FALSE,
  reverted_at TEXT,
  reverted_by TEXT,
  snapshot_before JSONB
);
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS llm_provider TEXT;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS llm_model TEXT;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS input_tokens INTEGER;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS output_tokens INTEGER;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS tokens_used INTEGER;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  department TEXT NOT NULL,
  classification TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  document_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  chunks JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS knowledge_queries (
  query_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  merkle_proof_root TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence DOUBLE PRECISION NOT NULL,
  bm25_latency_ms INTEGER NOT NULL DEFAULT 0,
  vector_latency_ms INTEGER NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  llm_fallback_reason TEXT,
  clearance_applied TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_audit_ledger (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  space_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  classification TEXT NOT NULL,
  resource_summary TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  prev_event_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  timestamp TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enterprise_leads (
  id TEXT PRIMARY KEY,
  organization TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  employee_count TEXT NOT NULL,
  deployment_mode TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export function enqueuePgTask(task: (pool: Pool) => Promise<void>): void {
  if (!isPgEnabled()) return;
  const pool = getPgPool();
  if (!pool) return;
  pgWriteChain = pgWriteChain
    .then(() => task(pool))
    .catch((err) => {
      console.error("Erreur d'écriture PostgreSQL backend :", err);
    });
}

export async function flushPgQueue(): Promise<void> {
  await pgWriteChain;
}

export async function initAndHydrateFromPg(seedDefaults: {
  spaces: UserSpace[];
  sources: DataSourceConfig[];
}) {
  if (!isPgEnabled()) return null;
  const pool = getPgPool();
  if (!pool) return null;

  if (!pgReadyPromise) {
    pgReadyPromise = (async () => {
      await pool.query(SCHEMA_SQL);
      const countRes = await pool.query<{ cnt: string }>(
        "SELECT COUNT(*)::text AS cnt FROM guardian_spaces"
      );
      if (Number(countRes.rows[0]?.cnt ?? "0") === 0) {
        for (const s of seedDefaults.spaces) await upsertSpacePg(pool, s);
        for (const src of seedDefaults.sources) await upsertSourcePg(pool, src);
      }
      return true;
    })().catch((err) => {
      pgReadyPromise = undefined;
      console.error("Échec initialisation schéma PostgreSQL backend :", err);
      return false;
    });
  }

  const ok = await pgReadyPromise;
  if (!ok) return null;
  await flushPgQueue();

  const [spacesRes, sourcesRes, rawRes, normRes, rulesRes, runsRes, anomRes, valRes, actRes, fbRes] =
    await Promise.all([
      pool.query("SELECT * FROM guardian_spaces ORDER BY created_at ASC"),
      pool.query("SELECT * FROM guardian_sources ORDER BY created_at ASC"),
      pool.query("SELECT * FROM guardian_raw_records ORDER BY ingested_at ASC"),
      pool.query("SELECT * FROM guardian_normalized_records ORDER BY created_at ASC"),
      pool.query("SELECT * FROM guardian_project_rules"),
      pool.query("SELECT * FROM guardian_runs ORDER BY started_at DESC"),
      pool.query("SELECT * FROM guardian_anomalies ORDER BY created_at DESC"),
      pool.query("SELECT * FROM guardian_validations ORDER BY created_at DESC"),
      pool.query("SELECT * FROM agent_actions ORDER BY timestamp DESC"),
      pool.query("SELECT * FROM guardian_rule_feedback"),
    ]);

  return {
    spaces: spacesRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      description: r.description ?? "",
      ownerUserId: r.owner_user_id,
      memberUserIds: Array.isArray(r.member_user_ids) ? r.member_user_ids : [],
      createdAt: r.created_at,
    })) as UserSpace[],
    sources: sourcesRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      name: r.name,
      type: r.type,
      format: r.format ?? undefined,
      status: r.status,
      columnMapping: r.column_mapping ?? undefined,
      endpointUrl: r.endpoint_url ?? undefined,
      authTokenEnvName: r.auth_token_env_name ?? undefined,
      recordsPath: r.records_path ?? undefined,
      externalIdField: r.external_id_field ?? undefined,
      geoField: r.geo_field ?? undefined,
      lastCursorDate: r.last_cursor_date ?? undefined,
      lastCursorId: r.last_cursor_id ?? undefined,
      lastSyncAt: r.last_sync_at ?? undefined,
      recordsCount: Number(r.records_count ?? 0),
      createdAt: r.created_at,
    })) as DataSourceConfig[],
    rawRecords: rawRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      sourceId: r.source_id,
      sourceType: r.source_type,
      externalId: r.external_id,
      payloadHash: r.payload_hash,
      rawPayload: r.raw_payload ?? {},
      rawFormat: r.raw_format,
      detectedEncoding: r.detected_encoding ?? undefined,
      detectedDelimiter: r.detected_delimiter ?? undefined,
      ingestedAt: r.ingested_at,
    })) as RawRecord[],
    normalizedRecords: normRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      rawRecordId: r.raw_record_id,
      sourceId: r.source_id,
      sourceType: r.source_type,
      externalId: r.external_id,
      payloadHash: r.payload_hash,
      recordKey: r.record_key,
      fullName: r.full_name ?? null,
      phone: r.phone ?? null,
      email: r.email ?? null,
      age: r.age === null || r.age === undefined ? null : Number(r.age),
      amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
      currency: r.currency ?? null,
      recordedAt: r.recorded_at ?? null,
      latitude: r.latitude === null || r.latitude === undefined ? null : Number(r.latitude),
      longitude: r.longitude === null || r.longitude === undefined ? null : Number(r.longitude),
      zone: r.zone ?? null,
      enumeratorId: r.enumerator_id ?? null,
      status: r.status,
      mergedIntoId: r.merged_into_id ?? undefined,
      archivedAt: r.archived_at ?? undefined,
      archivedReason: r.archived_reason ?? undefined,
      extra: r.extra ?? {},
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) as NormalizedRecord[],
    rulesYaml: rulesRes.rows.map((r) => [`${r.tenant_id}::${r.space_id}`, r.yaml_text]) as Array<[string, string]>,
    runs: runsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      sourceId: r.source_id,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
      durationMs: Number(r.duration_ms ?? 0),
      recordsIngested: Number(r.records_ingested ?? 0),
      recordsSkippedIdempotent: Number(r.records_skipped_idempotent ?? 0),
      recordsProcessed: Number(r.records_processed ?? 0),
      duplicatesFound: Number(r.duplicates_found ?? 0),
      anomaliesBySeverity: r.anomalies_by_severity ?? { bloquante: 0, a_verifier: 0, mineure: 0 },
      autoActionsCount: Number(r.auto_actions_count ?? 0),
      pendingValidationsCount: Number(r.pending_validations_count ?? 0),
      llmCallsCount: Number(r.llm_calls_count ?? 0),
      llmProvider: r.llm_provider ?? undefined,
      llmModel: r.llm_model ?? undefined,
      tokensUsed: Number(r.tokens_used ?? 0),
      estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
      summaryText: r.summary_text ?? undefined,
      notificationChannels: Array.isArray(r.notification_channels) ? r.notification_channels : undefined,
    })) as DataRun[],
    anomalies: anomRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      runId: r.run_id,
      recordId: r.record_id,
      relatedRecordId: r.related_record_id ?? undefined,
      ruleId: r.rule_id,
      category: r.category,
      severity: r.severity,
      field: r.field ?? undefined,
      message: r.message,
      similarityScore:
        r.similarity_score === null || r.similarity_score === undefined
          ? undefined
          : Number(r.similarity_score),
      status: r.status,
      createdAt: r.created_at,
    })) as Anomaly[],
    validations: valRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      runId: r.run_id,
      anomalyId: r.anomaly_id ?? undefined,
      actionType: r.action_type,
      title: r.title,
      description: r.description,
      primaryRecordId: r.primary_record_id,
      secondaryRecordId: r.secondary_record_id ?? undefined,
      confidence: Number(r.confidence ?? 0),
      proposedPayload: r.proposed_payload ?? {},
      status: r.status,
      decidedBy: r.decided_by ?? undefined,
      decidedAt: r.decided_at ?? undefined,
      createdAt: r.created_at,
    })) as ValidationItem[],
    agentActions: actRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      runId: r.run_id,
      timestamp: r.timestamp,
      toolName: r.tool_name,
      inputs: r.inputs ?? {},
      output: r.output ?? {},
      decision: r.decision,
      confidence: Number(r.confidence ?? 0),
      author: r.author,
      authorId: r.author_id ?? undefined,
      llmProvider: r.llm_provider ?? undefined,
      llmModel: r.llm_model ?? undefined,
      inputTokens:
        r.input_tokens === null || r.input_tokens === undefined
          ? typeof r.output?.inputTokens === "number"
            ? r.output.inputTokens
            : undefined
          : Number(r.input_tokens),
      outputTokens:
        r.output_tokens === null || r.output_tokens === undefined
          ? typeof r.output?.outputTokens === "number"
            ? r.output.outputTokens
            : undefined
          : Number(r.output_tokens),
      tokensUsed:
        r.tokens_used === null || r.tokens_used === undefined ? undefined : Number(r.tokens_used),
      durationMs:
        r.duration_ms === null || r.duration_ms === undefined ? undefined : Number(r.duration_ms),
      reversible: Boolean(r.reversible),
      reverted: Boolean(r.reverted),
      revertedAt: r.reverted_at ?? undefined,
      revertedBy: r.reverted_by ?? undefined,
      snapshotBefore: r.snapshot_before ?? undefined,
    })) as AgentAction[],
    ruleFeedback: fbRes.rows.map((r) => {
      const approved = Number(r.approved_count ?? 0);
      const rejected = Number(r.rejected_count ?? 0);
      const total = approved + rejected;
      return {
        tenantId: r.tenant_id,
        spaceId: r.space_id,
        ruleId: r.rule_id,
        approvedCount: approved,
        rejectedCount: rejected,
        totalCount: total,
        rejectionRate: total > 0 ? Number((rejected / total).toFixed(4)) : 0,
        updatedAt: r.updated_at,
      } satisfies RuleFeedbackStat;
    }),
  };
}

export async function upsertSpacePg(pool: Pool, s: UserSpace): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_spaces (id, tenant_id, name, description, owner_user_id, member_user_ids, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, member_user_ids = EXCLUDED.member_user_ids`,
    [s.id, s.tenantId, s.name, s.description, s.ownerUserId, JSON.stringify(s.memberUserIds), s.createdAt]
  );
}

export async function upsertSourcePg(pool: Pool, src: DataSourceConfig): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_sources (
       id, tenant_id, space_id, name, type, format, status, column_mapping,
       endpoint_url, auth_token_env_name, records_path, external_id_field, geo_field,
       last_cursor_date, last_cursor_id, last_sync_at, records_count, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, status = EXCLUDED.status, column_mapping = EXCLUDED.column_mapping,
       endpoint_url = EXCLUDED.endpoint_url, auth_token_env_name = EXCLUDED.auth_token_env_name,
       records_path = EXCLUDED.records_path, external_id_field = EXCLUDED.external_id_field,
       geo_field = EXCLUDED.geo_field, last_cursor_date = EXCLUDED.last_cursor_date,
       last_cursor_id = EXCLUDED.last_cursor_id, last_sync_at = EXCLUDED.last_sync_at,
       records_count = EXCLUDED.records_count`,
    [
      src.id, src.tenantId, src.spaceId, src.name, src.type, src.format ?? null, src.status,
      src.columnMapping ? JSON.stringify(src.columnMapping) : null, src.endpointUrl ?? null,
      src.authTokenEnvName ?? null, src.recordsPath ?? null, src.externalIdField ?? null,
      src.geoField ?? null, src.lastCursorDate ?? null, src.lastCursorId ?? null,
      src.lastSyncAt ?? null, src.recordsCount, src.createdAt,
    ]
  );
}

export async function insertRawRecordPg(pool: Pool, raw: RawRecord): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_raw_records (
       id, tenant_id, space_id, source_id, source_type, external_id,
       payload_hash, raw_payload, raw_format, detected_encoding, detected_delimiter, ingested_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12)
     ON CONFLICT (id) DO NOTHING`,
    [
      raw.id, raw.tenantId, raw.spaceId, raw.sourceId, raw.sourceType, raw.externalId,
      raw.payloadHash, JSON.stringify(raw.rawPayload), raw.rawFormat,
      raw.detectedEncoding ?? null, raw.detectedDelimiter ?? null, raw.ingestedAt,
    ]
  );
}

export async function upsertNormalizedRecordPg(pool: Pool, rec: NormalizedRecord): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_normalized_records (
       id, tenant_id, space_id, raw_record_id, source_id, source_type, external_id,
       payload_hash, record_key, full_name, phone, email, age, amount, currency,
       recorded_at, latitude, longitude, zone, enumerator_id, status, merged_into_id, archived_at,
       archived_reason, extra, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,$26,$27)
     ON CONFLICT (id) DO UPDATE SET
       full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, email = EXCLUDED.email,
       age = EXCLUDED.age, amount = EXCLUDED.amount, currency = EXCLUDED.currency,
       recorded_at = EXCLUDED.recorded_at, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
       zone = EXCLUDED.zone, enumerator_id = EXCLUDED.enumerator_id, status = EXCLUDED.status,
       merged_into_id = EXCLUDED.merged_into_id, archived_at = EXCLUDED.archived_at,
       archived_reason = EXCLUDED.archived_reason, extra = EXCLUDED.extra, updated_at = EXCLUDED.updated_at`,
    [
      rec.id, rec.tenantId, rec.spaceId, rec.rawRecordId, rec.sourceId, rec.sourceType, rec.externalId,
      rec.payloadHash, rec.recordKey, rec.fullName, rec.phone, rec.email, rec.age, rec.amount,
      rec.currency, rec.recordedAt, rec.latitude, rec.longitude, rec.zone, rec.enumeratorId ?? null, rec.status,
      rec.mergedIntoId ?? null, rec.archivedAt ?? null, rec.archivedReason ?? null,
      JSON.stringify(rec.extra ?? {}), rec.createdAt, rec.updatedAt,
    ]
  );
}

export async function upsertProjectRulesPg(pool: Pool, tenantId: string, spaceId: string, yamlText: string): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_project_rules (tenant_id, space_id, yaml_text, updated_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (tenant_id, space_id) DO UPDATE SET yaml_text = EXCLUDED.yaml_text, updated_at = EXCLUDED.updated_at`,
    [tenantId, spaceId, yamlText, new Date().toISOString()]
  );
}

export async function upsertRunPg(pool: Pool, run: DataRun): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_runs (
       id, tenant_id, space_id, source_id, trigger, status, started_at, finished_at,
       duration_ms, records_ingested, records_skipped_idempotent, records_processed, duplicates_found,
       anomalies_by_severity, auto_actions_count, pending_validations_count,
       llm_calls_count, llm_provider, llm_model, tokens_used, estimated_cost_usd,
       summary_text, notification_channels
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status, finished_at = EXCLUDED.finished_at, duration_ms = EXCLUDED.duration_ms,
       records_ingested = EXCLUDED.records_ingested, records_skipped_idempotent = EXCLUDED.records_skipped_idempotent,
       records_processed = EXCLUDED.records_processed, duplicates_found = EXCLUDED.duplicates_found,
       anomalies_by_severity = EXCLUDED.anomalies_by_severity, auto_actions_count = EXCLUDED.auto_actions_count,
       pending_validations_count = EXCLUDED.pending_validations_count, llm_calls_count = EXCLUDED.llm_calls_count,
       llm_provider = EXCLUDED.llm_provider, llm_model = EXCLUDED.llm_model, tokens_used = EXCLUDED.tokens_used,
       estimated_cost_usd = EXCLUDED.estimated_cost_usd, summary_text = EXCLUDED.summary_text,
       notification_channels = EXCLUDED.notification_channels`,
    [
      run.id, run.tenantId, run.spaceId, run.sourceId, run.trigger, run.status, run.startedAt,
      run.finishedAt ?? null, run.durationMs ?? 0, run.recordsIngested, run.recordsSkippedIdempotent,
      run.recordsProcessed, run.duplicatesFound, JSON.stringify(run.anomaliesBySeverity),
      run.autoActionsCount, run.pendingValidationsCount, run.llmCallsCount ?? 0,
      run.llmProvider ?? null, run.llmModel ?? null, run.tokensUsed, run.estimatedCostUsd,
      run.summaryText ?? null, run.notificationChannels ? JSON.stringify(run.notificationChannels) : null,
    ]
  );
}

export async function replaceOpenAnomaliesPg(pool: Pool, tenantId: string, spaceId: string, fresh: Anomaly[]): Promise<void> {
  await pool.query(
    `DELETE FROM guardian_anomalies WHERE tenant_id = $1 AND space_id = $2 AND status = 'open'`,
    [tenantId, spaceId]
  );
  for (const a of fresh) await upsertAnomalyPg(pool, a);
}

export async function upsertAnomalyPg(pool: Pool, a: Anomaly): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_anomalies (
       id, tenant_id, space_id, run_id, record_id, related_record_id,
       rule_id, category, severity, field, message, similarity_score, status, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, severity = EXCLUDED.severity, message = EXCLUDED.message`,
    [
      a.id, a.tenantId, a.spaceId, a.runId, a.recordId, a.relatedRecordId ?? null,
      a.ruleId, a.category, a.severity, a.field ?? null, a.message, a.similarityScore ?? null,
      a.status, a.createdAt,
    ]
  );
}

export async function upsertAgentActionPg(pool: Pool, act: AgentAction): Promise<void> {
  await pool.query(
    `INSERT INTO agent_actions (
       id, tenant_id, space_id, run_id, timestamp, tool_name, inputs, output,
       decision, confidence, author, author_id, llm_provider, llm_model,
       input_tokens, output_tokens, tokens_used, duration_ms,
       reversible, reverted, reverted_at, reverted_by, snapshot_before
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
     ON CONFLICT (id) DO UPDATE SET reverted = EXCLUDED.reverted, reverted_at = EXCLUDED.reverted_at, reverted_by = EXCLUDED.reverted_by`,
    [
      act.id, act.tenantId, act.spaceId, act.runId, act.timestamp, act.toolName,
      JSON.stringify(act.inputs ?? {}), JSON.stringify(act.output ?? {}), act.decision,
      act.confidence, act.author, act.authorId ?? null,
      act.llmProvider ?? null, act.llmModel ?? null,
      act.inputTokens ?? null, act.outputTokens ?? null, act.tokensUsed ?? null, act.durationMs ?? null,
      act.reversible, act.reverted,
      act.revertedAt ?? null, act.revertedBy ?? null,
      act.snapshotBefore ? JSON.stringify(act.snapshotBefore) : null,
    ]
  );
}

export async function upsertValidationItemPg(pool: Pool, v: ValidationItem): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_validations (
       id, tenant_id, space_id, run_id, anomaly_id, action_type, title, description,
       primary_record_id, secondary_record_id, confidence, proposed_payload, status,
       decided_by, decided_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, decided_by = EXCLUDED.decided_by, decided_at = EXCLUDED.decided_at`,
    [
      v.id, v.tenantId, v.spaceId, v.runId, v.anomalyId ?? null, v.actionType, v.title, v.description,
      v.primaryRecordId, v.secondaryRecordId ?? null, v.confidence, JSON.stringify(v.proposedPayload ?? {}),
      v.status, v.decidedBy ?? null, v.decidedAt ?? null, v.createdAt,
    ]
  );
}

export async function upsertRuleFeedbackPg(pool: Pool, stat: RuleFeedbackStat): Promise<void> {
  await pool.query(
    `INSERT INTO guardian_rule_feedback (tenant_id, space_id, rule_id, approved_count, rejected_count, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, space_id, rule_id) DO UPDATE SET
       approved_count = EXCLUDED.approved_count,
       rejected_count = EXCLUDED.rejected_count,
       updated_at = EXCLUDED.updated_at`,
    [stat.tenantId, stat.spaceId, stat.ruleId, stat.approvedCount, stat.rejectedCount, stat.updatedAt]
  );
}

export interface PgKnowledgeStateSnapshot {
  documents: Array<{
    id: string;
    tenantId: string;
    spaceId: string;
    title: string;
    fileName: string;
    department: string;
    classification: "PUBLIC" | "INTERNE" | "RESTREINT" | "CONFIDENTIEL";
    version: number;
    sizeBytes: number;
    documentHash: string;
    merkleRoot: string;
    uploadedBy: string;
    createdAt: string;
    chunks: unknown[];
  }>;
  queries: Array<{
    queryId: string;
    tenantId: string;
    spaceId: string;
    queryHash: string;
    merkleProofRoot: string;
    answer: string;
    citations: unknown[];
    confidence: number;
    bm25LatencyMs: number;
    vectorLatencyMs: number;
    totalLatencyMs: number;
    llmProvider: string;
    llmModel: string;
    llmFallbackReason?: string;
    clearanceApplied: string;
    createdAt: string;
  }>;
  audit: Array<{
    id: string;
    tenantId: string;
    spaceId: string;
    actorEmail: string;
    actorRole: string;
    action: "RAG_QUERY" | "DOCUMENT_INGEST" | "DOCUMENT_DELETE" | "PROOF_VERIFY" | "DOCX_EXPORT";
    classification: "PUBLIC" | "INTERNE" | "RESTREINT" | "CONFIDENTIEL";
    resourceSummary: string;
    latencyMs: number;
    prevEventHash: string;
    eventHash: string;
    timestamp: string;
  }>;
  leads: Array<{
    id: string;
    organization: string;
    contactName: string;
    email: string;
    employeeCount: string;
    deploymentMode: "SecNumCloud" | "On-Premise" | "Hybride";
    message: string;
    createdAt: string;
  }>;
}

export async function loadKnowledgeFromPg(): Promise<PgKnowledgeStateSnapshot | null> {
  if (!isPgEnabled()) return null;
  const pool = getPgPool();
  if (!pool) return null;

  await pool.query(SCHEMA_SQL);
  await flushPgQueue();

  const [docsRes, queriesRes, auditRes, leadsRes] = await Promise.all([
    pool.query("SELECT * FROM knowledge_documents ORDER BY created_at DESC"),
    pool.query("SELECT * FROM knowledge_queries ORDER BY created_at DESC"),
    pool.query("SELECT * FROM knowledge_audit_ledger ORDER BY timestamp DESC"),
    pool.query("SELECT * FROM enterprise_leads ORDER BY created_at DESC"),
  ]);

  return {
    documents: docsRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      title: r.title,
      fileName: r.file_name,
      department: r.department,
      classification: r.classification,
      version: Number(r.version ?? 1),
      sizeBytes: Number(r.size_bytes ?? 0),
      documentHash: r.document_hash,
      merkleRoot: r.merkle_root,
      uploadedBy: r.uploaded_by,
      createdAt: r.created_at,
      chunks: Array.isArray(r.chunks) ? r.chunks : [],
    })),
    queries: queriesRes.rows.map((r) => ({
      queryId: r.query_id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      queryHash: r.query_hash,
      merkleProofRoot: r.merkle_proof_root,
      answer: r.answer,
      citations: Array.isArray(r.citations) ? r.citations : [],
      confidence: Number(r.confidence ?? 0.8),
      bm25LatencyMs: Number(r.bm25_latency_ms ?? 0),
      vectorLatencyMs: Number(r.vector_latency_ms ?? 0),
      totalLatencyMs: Number(r.total_latency_ms ?? 0),
      llmProvider: r.llm_provider,
      llmModel: r.llm_model,
      llmFallbackReason: r.llm_fallback_reason ?? undefined,
      clearanceApplied: r.clearance_applied,
      createdAt: r.created_at,
    })),
    audit: auditRes.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      spaceId: r.space_id,
      actorEmail: r.actor_email,
      actorRole: r.actor_role,
      action: r.action,
      classification: r.classification,
      resourceSummary: r.resource_summary,
      latencyMs: Number(r.latency_ms ?? 0),
      prevEventHash: r.prev_event_hash,
      eventHash: r.event_hash,
      timestamp: r.timestamp,
    })),
    leads: leadsRes.rows.map((r) => ({
      id: r.id,
      organization: r.organization,
      contactName: r.contact_name,
      email: r.email,
      employeeCount: r.employee_count,
      deploymentMode: r.deployment_mode,
      message: r.message,
      createdAt: r.created_at,
    })),
  };
}

export async function upsertKnowledgeDocumentPg(
  pool: Pool,
  doc: PgKnowledgeStateSnapshot["documents"][number]
): Promise<void> {
  await pool.query(
    `INSERT INTO knowledge_documents (
       id, tenant_id, space_id, title, file_name, department, classification,
       version, size_bytes, document_hash, merkle_root, uploaded_by, created_at, chunks
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       classification = EXCLUDED.classification,
       version = EXCLUDED.version,
       chunks = EXCLUDED.chunks`,
    [
      doc.id,
      doc.tenantId,
      doc.spaceId,
      doc.title,
      doc.fileName,
      doc.department,
      doc.classification,
      doc.version,
      doc.sizeBytes,
      doc.documentHash,
      doc.merkleRoot,
      doc.uploadedBy,
      doc.createdAt,
      JSON.stringify(doc.chunks),
    ]
  );
}

export async function deleteKnowledgeDocumentPg(
  pool: Pool,
  documentId: string,
  tenantId: string,
  spaceId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM knowledge_documents WHERE id = $1 AND tenant_id = $2 AND space_id = $3`,
    [documentId, tenantId, spaceId]
  );
}

export async function insertKnowledgeQueryPg(
  pool: Pool,
  q: PgKnowledgeStateSnapshot["queries"][number]
): Promise<void> {
  await pool.query(
    `INSERT INTO knowledge_queries (
       query_id, tenant_id, space_id, query_hash, merkle_proof_root, answer,
       citations, confidence, bm25_latency_ms, vector_latency_ms, total_latency_ms,
       llm_provider, llm_model, llm_fallback_reason, clearance_applied, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (query_id) DO NOTHING`,
    [
      q.queryId,
      q.tenantId,
      q.spaceId,
      q.queryHash,
      q.merkleProofRoot,
      q.answer,
      JSON.stringify(q.citations),
      q.confidence,
      q.bm25LatencyMs,
      q.vectorLatencyMs,
      q.totalLatencyMs,
      q.llmProvider,
      q.llmModel,
      q.llmFallbackReason ?? null,
      q.clearanceApplied,
      q.createdAt,
    ]
  );
}

export async function insertKnowledgeAuditPg(
  pool: Pool,
  entry: PgKnowledgeStateSnapshot["audit"][number]
): Promise<void> {
  await pool.query(
    `INSERT INTO knowledge_audit_ledger (
       id, tenant_id, space_id, actor_email, actor_role, action,
       classification, resource_summary, latency_ms, prev_event_hash, event_hash, timestamp
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO NOTHING`,
    [
      entry.id,
      entry.tenantId,
      entry.spaceId,
      entry.actorEmail,
      entry.actorRole,
      entry.action,
      entry.classification,
      entry.resourceSummary,
      entry.latencyMs,
      entry.prevEventHash,
      entry.eventHash,
      entry.timestamp,
    ]
  );
}

export async function insertEnterpriseLeadPg(
  pool: Pool,
  lead: PgKnowledgeStateSnapshot["leads"][number]
): Promise<void> {
  await pool.query(
    `INSERT INTO enterprise_leads (
       id, organization, contact_name, email, employee_count, deployment_mode, message, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO NOTHING`,
    [
      lead.id,
      lead.organization,
      lead.contactName,
      lead.email,
      lead.employeeCount,
      lead.deploymentMode,
      lead.message,
      lead.createdAt,
    ]
  );
}

