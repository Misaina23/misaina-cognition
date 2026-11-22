import fs from "node:fs";
import path from "node:path";
import type {
  AgentAction,
  Anomaly,
  ConnectorKind,
  DataRun,
  DataSourceConfig,
  NormalizedRecord,
  RawRecord,
  TenantSpaceContext,
  ValidationItem,
} from "./connectors/types";
import { parseProjectRulesYaml, type ProjectRulesConfig } from "./rules/engine";
import { tenantSpacesRegistry } from "./tenant";

interface JournalState {
  sources: DataSourceConfig[];
  rawRecords: RawRecord[];
  normalizedRecords: NormalizedRecord[];
  runs: DataRun[];
  anomalies: Anomaly[];
  agentActions: AgentAction[];
  validationQueue: ValidationItem[];
  rulesYamlBySpace: Map<string, string>;
}

const state: JournalState = {
  sources: [
    {
      id: "src-u1-csv",
      tenantId: "tenant-direction-executive-conseil",
      spaceId: "space-u1-global",
      name: "Import CSV / Excel Bénéficiaires",
      type: "csv",
      status: "ACTIVE",
      recordsCount: 0,
      createdAt: "2026-11-20T09:00:00.000Z",
    },
    {
      id: "src-u3-kobo",
      tenantId: "tenant-operations-sahel-dakar",
      spaceId: "space-u3-sahel",
      name: "KoboToolbox Enquête Sahel",
      type: "generic",
      format: "kobo",
      status: "ACTIVE",
      recordsCount: 0,
      createdAt: "2026-11-20T09:00:00.000Z",
    },
  ],
  rawRecords: [],
  normalizedRecords: [],
  runs: [],
  anomalies: [],
  agentActions: [],
  validationQueue: [],
  rulesYamlBySpace: new Map(),
};

function safeSeg(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getBackendRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "config", "projects"))) return cwd;
  return path.join(cwd, "backend");
}

export function getSpaceDiskDirs(ctx: TenantSpaceContext): {
  inboxDir: string;
  archiveDir: string;
  quarantineDir: string;
} {
  const base = path.join(getBackendRoot(), "data");
  const t = safeSeg(ctx.tenantId);
  const s = safeSeg(ctx.spaceId);
  return {
    inboxDir: path.join(base, "inbox", t, s),
    archiveDir: path.join(base, "archive", t, s),
    quarantineDir: path.join(base, "quarantine", t, s),
  };
}

export function ensureSpaceDirectories(ctx: TenantSpaceContext) {
  const dirs = getSpaceDiskDirs(ctx);
  fs.mkdirSync(dirs.inboxDir, { recursive: true });
  fs.mkdirSync(dirs.archiveDir, { recursive: true });
  fs.mkdirSync(dirs.quarantineDir, { recursive: true });
  return dirs;
}

export function saveRawUploadToArchive(
  ctx: TenantSpaceContext,
  fileName: string,
  buffer: Buffer | Uint8Array
): string {
  const { archiveDir } = ensureSpaceDirectories(ctx);
  const dest = path.join(archiveDir, `${Date.now()}_${safeSeg(fileName)}`);
  fs.writeFileSync(dest, Buffer.from(buffer));
  return dest;
}

export function saveQuarantineSnapshot(
  ctx: TenantSpaceContext,
  runId: string,
  payload: Record<string, unknown>
): string {
  const { quarantineDir } = ensureSpaceDirectories(ctx);
  const dest = path.join(quarantineDir, `${safeSeg(runId)}.json`);
  fs.writeFileSync(dest, JSON.stringify(payload, null, 2), "utf8");
  return dest;
}

export function moveInboxFile(
  ctx: TenantSpaceContext,
  sourcePath: string,
  target: "archive" | "quarantine"
): string {
  const dirs = ensureSpaceDirectories(ctx);
  const dest = path.join(
    target === "archive" ? dirs.archiveDir : dirs.quarantineDir,
    `${Date.now()}_${safeSeg(path.basename(sourcePath))}`
  );
  fs.renameSync(sourcePath, dest);
  return dest;
}

export const journalRepo = {
  listSources(ctx: TenantSpaceContext): DataSourceConfig[] {
    return state.sources.filter(
      (s) => s.tenantId === ctx.tenantId && s.spaceId === ctx.spaceId
    );
  },

  getSource(ctx: TenantSpaceContext, sourceId: string): DataSourceConfig | null {
    return (
      state.sources.find(
        (s) => s.id === sourceId && s.tenantId === ctx.tenantId && s.spaceId === ctx.spaceId
      ) || null
    );
  },

  upsertSource(
    ctx: TenantSpaceContext,
    input: Omit<DataSourceConfig, "tenantId" | "spaceId" | "createdAt" | "recordsCount"> & {
      recordsCount?: number;
    }
  ): DataSourceConfig {
    const existing = this.getSource(ctx, input.id);
    if (existing) {
      Object.assign(existing, input, { tenantId: ctx.tenantId, spaceId: ctx.spaceId });
      return existing;
    }
    const created: DataSourceConfig = {
      ...input,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      recordsCount: input.recordsCount ?? 0,
      createdAt: new Date().toISOString(),
    };
    state.sources.push(created);
    return created;
  },

  ensureSourceForType(
    ctx: TenantSpaceContext,
    type: ConnectorKind,
    name: string,
    extra?: Partial<DataSourceConfig>
  ): DataSourceConfig {
    const existing = state.sources.find(
      (s) =>
        s.tenantId === ctx.tenantId &&
        s.spaceId === ctx.spaceId &&
        s.type === type &&
        (!extra?.format || s.format === extra.format)
    );
    if (existing) return existing;
    const created: DataSourceConfig = {
      id: `src-${ctx.spaceId}-${type}-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      name,
      type,
      status: "ACTIVE",
      recordsCount: 0,
      createdAt: new Date().toISOString(),
      ...extra,
    };
    state.sources.push(created);
    return created;
  },

  findDuplicateIngestion(
    ctx: TenantSpaceContext,
    sourceId: string,
    externalId: string,
    payloadHash: string
  ): RawRecord | null {
    return (
      state.rawRecords.find(
        (r) =>
          r.tenantId === ctx.tenantId &&
          r.spaceId === ctx.spaceId &&
          r.sourceId === sourceId &&
          (r.payloadHash === payloadHash ||
            (externalId !== "" && r.externalId === externalId && r.payloadHash === payloadHash))
      ) || null
    );
  },

  insertIngestedPair(
    ctx: TenantSpaceContext,
    raw: RawRecord,
    normalized: NormalizedRecord
  ): RawRecord {
    if (raw.tenantId !== ctx.tenantId || raw.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : RawRecord hors contexte.");
    }
    if (normalized.tenantId !== ctx.tenantId || normalized.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : NormalizedRecord hors contexte.");
    }
    const deepFreeze = <T>(obj: T): T => {
      if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        for (const val of Object.values(obj as Record<string, unknown>)) deepFreeze(val);
      }
      return obj;
    };
    const frozenRaw: RawRecord = Object.freeze({
      ...raw,
      rawPayload: deepFreeze({ ...raw.rawPayload }),
    });
    state.rawRecords.push(frozenRaw);
    state.normalizedRecords.push(normalized);
    return frozenRaw;
  },

  listRawRecords(ctx: TenantSpaceContext): RawRecord[] {
    return state.rawRecords.filter(
      (r) => r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
  },

  listNormalizedRecords(
    ctx: TenantSpaceContext,
    options?: { includeArchived?: boolean; sourceId?: string }
  ): NormalizedRecord[] {
    return state.normalizedRecords.filter((r) => {
      if (r.tenantId !== ctx.tenantId || r.spaceId !== ctx.spaceId) return false;
      if (options?.sourceId && r.sourceId !== options.sourceId) return false;
      if (!options?.includeArchived && r.status !== "active") return false;
      return true;
    });
  },

  getNormalizedRecord(ctx: TenantSpaceContext, recordId: string): NormalizedRecord | null {
    return (
      state.normalizedRecords.find(
        (r) => r.id === recordId && r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
      ) || null
    );
  },

  updateSourceStats(
    ctx: TenantSpaceContext,
    sourceId: string,
    patch: Partial<Pick<DataSourceConfig, "lastCursorDate" | "lastCursorId" | "lastSyncAt" | "status">>
  ): void {
    const src = this.getSource(ctx, sourceId);
    if (!src) return;
    Object.assign(src, patch);
    src.recordsCount = state.normalizedRecords.filter(
      (r) =>
        r.tenantId === ctx.tenantId &&
        r.spaceId === ctx.spaceId &&
        r.sourceId === sourceId &&
        r.status === "active"
    ).length;
  },

  getProjectRules(ctx: TenantSpaceContext): { rawYaml: string; config: ProjectRulesConfig } {
    const key = `${ctx.tenantId}::${ctx.spaceId}`;
    let rawYaml = state.rulesYamlBySpace.get(key);
    if (!rawYaml) {
      const yamlPath = path.join(getBackendRoot(), "config", "projects", "exemple-csv.yaml");
      rawYaml = fs.readFileSync(yamlPath, "utf8");
    }
    return parseProjectRulesYaml(rawYaml);
  },

  setProjectRulesYaml(
    ctx: TenantSpaceContext,
    yamlText: string
  ): { rawYaml: string; config: ProjectRulesConfig } {
    const parsed = parseProjectRulesYaml(yamlText);
    state.rulesYamlBySpace.set(`${ctx.tenantId}::${ctx.spaceId}`, parsed.rawYaml);
    return parsed;
  },

  listAllSpaceContexts(): TenantSpaceContext[] {
    return tenantSpacesRegistry.map((s) => ({
      tenantId: s.tenantId,
      spaceId: s.id,
      userId: s.ownerUserId,
    }));
  },

  createRun(ctx: TenantSpaceContext, run: DataRun): DataRun {
    state.runs.unshift(run);
    return run;
  },

  updateRun(ctx: TenantSpaceContext, runId: string, patch: Partial<DataRun>): DataRun | null {
    const run = state.runs.find(
      (r) => r.id === runId && r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
    if (!run) return null;
    Object.assign(run, patch);
    return run;
  },

  listRuns(ctx: TenantSpaceContext): DataRun[] {
    return state.runs.filter(
      (r) => r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
  },

  replaceOpenAnomalies(ctx: TenantSpaceContext, freshAnomalies: Anomaly[]): Anomaly[] {
    state.anomalies = state.anomalies.filter(
      (a) => !(a.tenantId === ctx.tenantId && a.spaceId === ctx.spaceId && a.status === "open")
    );
    state.anomalies.unshift(...freshAnomalies);
    return freshAnomalies;
  },

  listAnomalies(
    ctx: TenantSpaceContext,
    options?: { status?: Anomaly["status"]; severity?: Anomaly["severity"]; runId?: string }
  ): Anomaly[] {
    return state.anomalies.filter((a) => {
      if (a.tenantId !== ctx.tenantId || a.spaceId !== ctx.spaceId) return false;
      if (options?.status && a.status !== options.status) return false;
      if (options?.severity && a.severity !== options.severity) return false;
      if (options?.runId && a.runId !== options.runId) return false;
      return true;
    });
  },

  updateAnomaly(ctx: TenantSpaceContext, anomalyId: string, patch: Partial<Anomaly>): Anomaly | null {
    const item = state.anomalies.find(
      (a) => a.id === anomalyId && a.tenantId === ctx.tenantId && a.spaceId === ctx.spaceId
    );
    if (!item) return null;
    Object.assign(item, patch);
    return item;
  },

  addAgentAction(ctx: TenantSpaceContext, action: AgentAction): AgentAction {
    if (action.tenantId !== ctx.tenantId || action.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : AgentAction hors contexte.");
    }
    state.agentActions.unshift(action);
    return action;
  },

  listAgentActions(ctx: TenantSpaceContext, runId?: string): AgentAction[] {
    return state.agentActions.filter((a) => {
      if (a.tenantId !== ctx.tenantId || a.spaceId !== ctx.spaceId) return false;
      if (runId && a.runId !== runId) return false;
      return true;
    });
  },

  listValidations(ctx: TenantSpaceContext, status?: ValidationItem["status"]): ValidationItem[] {
    return state.validationQueue.filter((v) => {
      if (v.tenantId !== ctx.tenantId || v.spaceId !== ctx.spaceId) return false;
      if (status && v.status !== status) return false;
      return true;
    });
  },

  addValidationItem(ctx: TenantSpaceContext, item: ValidationItem): ValidationItem {
    if (item.tenantId !== ctx.tenantId || item.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : ValidationItem hors contexte.");
    }
    state.validationQueue.unshift(item);
    return item;
  },
};

export function executeReversibleMerge(params: {
  ctx: TenantSpaceContext;
  runId: string;
  primaryRecordId: string;
  secondaryRecordId: string;
  anomalyId?: string;
  confidence: number;
  author: "agent" | "human";
  reason: string;
}): { action: AgentAction; mergedRecord: NormalizedRecord } {
  const { ctx, runId, primaryRecordId, secondaryRecordId, anomalyId, confidence, author, reason } =
    params;
  const primary = journalRepo.getNormalizedRecord(ctx, primaryRecordId);
  const secondary = journalRepo.getNormalizedRecord(ctx, secondaryRecordId);

  if (!primary || !secondary) throw new Error("Enregistrement introuvable pour fusion.");
  if (primary.id === secondary.id) throw new Error("Fusion impossible sur le même enregistrement.");
  if (secondary.status !== "active") throw new Error("L'enregistrement secondaire n'est plus actif.");

  const primaryBefore = {
    fullName: primary.fullName,
    phone: primary.phone,
    email: primary.email,
    age: primary.age,
    amount: primary.amount,
    zone: primary.zone,
    latitude: primary.latitude,
    longitude: primary.longitude,
  };
  const secondaryBefore = {
    status: secondary.status,
    mergedIntoId: secondary.mergedIntoId,
    archivedAt: secondary.archivedAt,
    archivedReason: secondary.archivedReason,
  };

  if (!primary.fullName && secondary.fullName) primary.fullName = secondary.fullName;
  if (!primary.phone && secondary.phone) primary.phone = secondary.phone;
  if (!primary.email && secondary.email) primary.email = secondary.email;
  if (primary.age === null && secondary.age !== null) primary.age = secondary.age;
  if (primary.zone === null && secondary.zone !== null) primary.zone = secondary.zone;
  if (primary.latitude === null && secondary.latitude !== null) {
    primary.latitude = secondary.latitude;
    primary.longitude = secondary.longitude;
  }
  primary.updatedAt = new Date().toISOString();

  secondary.status = "merged";
  secondary.mergedIntoId = primary.id;
  secondary.archivedAt = new Date().toISOString();
  secondary.archivedReason = reason;
  secondary.updatedAt = new Date().toISOString();

  if (anomalyId) {
    journalRepo.updateAnomaly(ctx, anomalyId, {
      status: author === "agent" ? "auto_resolved" : "resolved",
    });
  }
  journalRepo.updateSourceStats(ctx, secondary.sourceId, {});

  const action = journalRepo.addAgentAction(ctx, {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "propose_merge",
    inputs: { primaryRecordId, secondaryRecordId, anomalyId, reason },
    output: { mergedRecordId: secondary.id, keptRecordId: primary.id, status: "merged" },
    decision: `Fusion réversible : ${secondary.externalId} -> ${primary.externalId}`,
    confidence,
    author,
    authorId: author === "human" ? ctx.userId : "guardian-agent",
    reversible: true,
    reverted: false,
    snapshotBefore: {
      primaryRecordId: primary.id,
      primaryBefore,
      secondaryRecordId: secondary.id,
      secondaryBefore,
      anomalyId,
    },
  });

  return { action, mergedRecord: secondary };
}

export function executeReversibleArchive(params: {
  ctx: TenantSpaceContext;
  runId: string;
  recordId: string;
  anomalyId?: string;
  confidence: number;
  author: "agent" | "human";
  reason: string;
}): { action: AgentAction; archivedRecord: NormalizedRecord } {
  const { ctx, runId, recordId, anomalyId, confidence, author, reason } = params;
  const rec = journalRepo.getNormalizedRecord(ctx, recordId);
  if (!rec) throw new Error("Enregistrement introuvable pour archivage.");
  if (rec.status !== "active") throw new Error("Enregistrement déjà archivé/fusionné.");

  const before = { status: rec.status, archivedAt: rec.archivedAt, archivedReason: rec.archivedReason };
  rec.status = "archived";
  rec.archivedAt = new Date().toISOString();
  rec.archivedReason = reason;
  rec.updatedAt = new Date().toISOString();

  if (anomalyId) {
    journalRepo.updateAnomaly(ctx, anomalyId, {
      status: author === "agent" ? "auto_resolved" : "resolved",
    });
  }
  journalRepo.updateSourceStats(ctx, rec.sourceId, {});

  const action = journalRepo.addAgentAction(ctx, {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "archive_record",
    inputs: { recordId, anomalyId, reason },
    output: { recordId: rec.id, status: "archived" },
    decision: `Archivage restaurable de ${rec.externalId} (${reason})`,
    confidence,
    author,
    authorId: author === "human" ? ctx.userId : "guardian-agent",
    reversible: true,
    reverted: false,
    snapshotBefore: { recordId: rec.id, before, anomalyId },
  });

  return { action, archivedRecord: rec };
}

export function rollbackAgentAction(ctx: TenantSpaceContext, actionId: string): AgentAction {
  const action = journalRepo.listAgentActions(ctx).find((a) => a.id === actionId);
  if (!action) throw new Error("Action introuvable dans cet espace.");
  if (!action.reversible || !action.snapshotBefore) throw new Error("Action non réversible.");
  if (action.reverted) throw new Error("Action déjà annulée.");

  const snap = action.snapshotBefore;
  if (action.toolName === "propose_merge") {
    const primary = journalRepo.getNormalizedRecord(ctx, String(snap.primaryRecordId));
    const secondary = journalRepo.getNormalizedRecord(ctx, String(snap.secondaryRecordId));
    if (primary && snap.primaryBefore) {
      Object.assign(primary, snap.primaryBefore, { updatedAt: new Date().toISOString() });
    }
    if (secondary && snap.secondaryBefore) {
      const sb = snap.secondaryBefore as Record<string, unknown>;
      secondary.status = (sb.status as NormalizedRecord["status"]) || "active";
      secondary.mergedIntoId = sb.mergedIntoId as string | undefined;
      secondary.archivedAt = sb.archivedAt as string | undefined;
      secondary.archivedReason = sb.archivedReason as string | undefined;
      secondary.updatedAt = new Date().toISOString();
      journalRepo.updateSourceStats(ctx, secondary.sourceId, {});
    }
  } else if (action.toolName === "archive_record") {
    const rec = journalRepo.getNormalizedRecord(ctx, String(snap.recordId));
    if (rec && snap.before) {
      const b = snap.before as Record<string, unknown>;
      rec.status = (b.status as NormalizedRecord["status"]) || "active";
      rec.archivedAt = b.archivedAt as string | undefined;
      rec.archivedReason = b.archivedReason as string | undefined;
      rec.updatedAt = new Date().toISOString();
      journalRepo.updateSourceStats(ctx, rec.sourceId, {});
    }
  }

  if (snap.anomalyId) {
    journalRepo.updateAnomaly(ctx, String(snap.anomalyId), { status: "open" });
  }

  action.reverted = true;
  action.revertedAt = new Date().toISOString();
  action.revertedBy = ctx.userId;

  journalRepo.addAgentAction(ctx, {
    id: `act-rb-${Date.now()}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId: action.runId,
    timestamp: new Date().toISOString(),
    toolName: "rollback_action",
    inputs: { revertedActionId: action.id },
    output: { restored: true },
    decision: `Annulation humaine de l'action ${action.toolName} (${action.id})`,
    confidence: 1,
    author: "human",
    authorId: ctx.userId,
    reversible: false,
    reverted: false,
  });

  return action;
}

export function resolveValidationItem(
  ctx: TenantSpaceContext,
  validationId: string,
  decision: "approved" | "rejected"
): { item: ValidationItem; executedAction?: AgentAction } {
  const item = journalRepo.listValidations(ctx).find((v) => v.id === validationId);
  if (!item) throw new Error("Validation introuvable dans cet espace.");
  if (item.status !== "pending") throw new Error(`Déjà traitée (${item.status}).`);

  item.status = decision;
  item.decidedBy = ctx.userId;
  item.decidedAt = new Date().toISOString();

  let executedAction: AgentAction | undefined;
  if (decision === "approved") {
    if (item.actionType === "merge" && item.secondaryRecordId) {
      executedAction = executeReversibleMerge({
        ctx,
        runId: item.runId,
        primaryRecordId: item.primaryRecordId,
        secondaryRecordId: item.secondaryRecordId,
        anomalyId: item.anomalyId,
        confidence: item.confidence,
        author: "human",
        reason: `Validation humaine : ${item.title}`,
      }).action;
    } else if (item.actionType === "archive") {
      executedAction = executeReversibleArchive({
        ctx,
        runId: item.runId,
        recordId: item.primaryRecordId,
        anomalyId: item.anomalyId,
        confidence: item.confidence,
        author: "human",
        reason: `Validation humaine : ${item.title}`,
      }).action;
    } else {
      journalRepo.addAgentAction(ctx, {
        id: `act-val-${Date.now()}`,
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runId: item.runId,
        timestamp: new Date().toISOString(),
        toolName: "human_review_batch",
        inputs: { validationId: item.id },
        output: { approved: true },
        decision: `Revue humaine approuvée : ${item.title}`,
        confidence: 1,
        author: "human",
        authorId: ctx.userId,
        reversible: false,
        reverted: false,
      });
    }
  } else {
    if (item.anomalyId) journalRepo.updateAnomaly(ctx, item.anomalyId, { status: "ignored" });
    journalRepo.addAgentAction(ctx, {
      id: `act-rej-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId: item.runId,
      timestamp: new Date().toISOString(),
      toolName: "human_reject_validation",
      inputs: { validationId: item.id },
      output: { rejected: true },
      decision: `Proposition rejetée : ${item.title}`,
      confidence: 1,
      author: "human",
      authorId: ctx.userId,
      reversible: false,
      reverted: false,
    });
  }

  return { item, executedAction };
}
