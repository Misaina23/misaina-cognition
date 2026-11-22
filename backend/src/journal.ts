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
  RuleFeedbackStat,
  RuleThresholdSuggestion,
  TenantSpaceContext,
  ValidationItem,
} from "./connectors/types";
import { parseProjectRulesYaml, type ProjectRulesConfig } from "./rules/engine";
import { tenantSpacesRegistry } from "./tenant";
import {
  enqueuePgTask,
  flushPgQueue,
  initAndHydrateFromPg,
  insertRawRecordPg,
  isPgEnabled,
  replaceOpenAnomaliesPg,
  upsertAgentActionPg,
  upsertAnomalyPg,
  upsertNormalizedRecordPg,
  upsertProjectRulesPg,
  upsertRuleFeedbackPg,
  upsertRunPg,
  upsertSourcePg,
  upsertSpacePg,
  upsertValidationItemPg,
} from "./pgStore";

interface JournalState {
  sources: DataSourceConfig[];
  rawRecords: RawRecord[];
  normalizedRecords: NormalizedRecord[];
  runs: DataRun[];
  anomalies: Anomaly[];
  agentActions: AgentAction[];
  validationQueue: ValidationItem[];
  rulesYamlBySpace: Map<string, string>;
  ruleFeedback: RuleFeedbackStat[];
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
  ruleFeedback: [],
};

function safeSeg(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getBackendRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "config", "projects"))) return cwd;
  return path.join(cwd, "backend");
}

function isPersistenceDisabled(): boolean {
  if (process.env.GUARDIAN_DISABLE_DISK_STATE === "1") return true;
  return process.argv.some((arg) =>
    /[/\\](tests|scripts)[/\\]|evaluate\.|idempotence\.test|isolation\.test/.test(arg)
  );
}

function getJournalStateFilePath(): string {
  return path.join(getBackendRoot(), "data", "journal-state.json");
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const val of Object.values(obj as Record<string, unknown>)) deepFreeze(val);
  }
  return obj;
}

let journalHydrated = false;
let journalPgHydrated = false;

function hydrateStateOnce(): void {
  if (journalHydrated) return;
  journalHydrated = true;
  if (isPersistenceDisabled() || isPgEnabled()) return;

  const filePath = getJournalStateFilePath();
  if (!fs.existsSync(filePath)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      spaces?: typeof tenantSpacesRegistry;
      sources?: DataSourceConfig[];
      rawRecords?: RawRecord[];
      normalizedRecords?: NormalizedRecord[];
      runs?: DataRun[];
      anomalies?: Anomaly[];
      agentActions?: AgentAction[];
      validationQueue?: ValidationItem[];
      rulesYamlBySpace?: Array<[string, string]>;
      ruleFeedback?: RuleFeedbackStat[];
    };
    if (Array.isArray(parsed.spaces) && parsed.spaces.length > 0) {
      tenantSpacesRegistry.splice(0, tenantSpacesRegistry.length, ...parsed.spaces);
    }
    if (Array.isArray(parsed.sources)) state.sources = parsed.sources;
    if (Array.isArray(parsed.rawRecords)) {
      state.rawRecords = parsed.rawRecords.map((r) =>
        Object.freeze({ ...r, rawPayload: deepFreeze({ ...r.rawPayload }) })
      );
    }
    if (Array.isArray(parsed.normalizedRecords)) state.normalizedRecords = parsed.normalizedRecords;
    if (Array.isArray(parsed.runs)) state.runs = parsed.runs;
    if (Array.isArray(parsed.anomalies)) state.anomalies = parsed.anomalies;
    if (Array.isArray(parsed.agentActions)) state.agentActions = parsed.agentActions;
    if (Array.isArray(parsed.validationQueue)) state.validationQueue = parsed.validationQueue;
    if (Array.isArray(parsed.rulesYamlBySpace)) {
      state.rulesYamlBySpace = new Map(parsed.rulesYamlBySpace);
    }
    if (Array.isArray(parsed.ruleFeedback)) {
      state.ruleFeedback = parsed.ruleFeedback;
    }
  } catch (err) {
    console.error("Impossible de restaurer backend/data/journal-state.json :", err);
  }
}

function persistStateToDisk(): void {
  if (isPersistenceDisabled() || isPgEnabled()) return;
  try {
    const filePath = getJournalStateFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmpPath,
      JSON.stringify(
        {
          spaces: tenantSpacesRegistry,
          sources: state.sources,
          rawRecords: state.rawRecords,
          normalizedRecords: state.normalizedRecords,
          runs: state.runs,
          anomalies: state.anomalies,
          agentActions: state.agentActions,
          validationQueue: state.validationQueue,
          rulesYamlBySpace: Array.from(state.rulesYamlBySpace.entries()),
          ruleFeedback: state.ruleFeedback,
        },
        null,
        2
      ),
      "utf8"
    );
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error("Erreur sauvegarde backend/data/journal-state.json :", err);
  }
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
  async ensureReady(): Promise<void> {
    if (journalPgHydrated || !isPgEnabled()) {
      hydrateStateOnce();
      return;
    }
    const snap = await initAndHydrateFromPg({
      spaces: tenantSpacesRegistry,
      sources: state.sources,
    });
    if (snap) {
      if (snap.spaces.length > 0) {
        tenantSpacesRegistry.splice(0, tenantSpacesRegistry.length, ...snap.spaces);
      }
      state.sources = snap.sources;
      state.rawRecords = snap.rawRecords.map((r) =>
        Object.freeze({ ...r, rawPayload: deepFreeze({ ...r.rawPayload }) })
      );
      state.normalizedRecords = snap.normalizedRecords;
      state.rulesYamlBySpace = new Map(snap.rulesYaml);
      state.runs = snap.runs;
      state.anomalies = snap.anomalies;
      state.validationQueue = snap.validations;
      state.agentActions = snap.agentActions;
      state.ruleFeedback = snap.ruleFeedback || [];
      journalPgHydrated = true;
      journalHydrated = true;
    }
  },

  async flushPg(): Promise<void> {
    await flushPgQueue();
  },

  persistState(): void {
    persistStateToDisk();
  },

  syncSpacePg(space: (typeof tenantSpacesRegistry)[number]): void {
    enqueuePgTask((pool) => upsertSpacePg(pool, space));
  },

  syncRecordPg(rec: NormalizedRecord): void {
    enqueuePgTask((pool) => upsertNormalizedRecordPg(pool, rec));
  },

  syncActionPg(action: AgentAction): void {
    enqueuePgTask((pool) => upsertAgentActionPg(pool, action));
  },

  syncValidationPg(item: ValidationItem): void {
    enqueuePgTask((pool) => upsertValidationItemPg(pool, item));
  },

  listSources(ctx: TenantSpaceContext): DataSourceConfig[] {
    hydrateStateOnce();
    return state.sources.filter(
      (s) => s.tenantId === ctx.tenantId && s.spaceId === ctx.spaceId
    );
  },

  getSource(ctx: TenantSpaceContext, sourceId: string): DataSourceConfig | null {
    hydrateStateOnce();
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
    hydrateStateOnce();
    const existing = this.getSource(ctx, input.id);
    if (existing) {
      Object.assign(existing, input, { tenantId: ctx.tenantId, spaceId: ctx.spaceId });
      enqueuePgTask((pool) => upsertSourcePg(pool, existing));
      persistStateToDisk();
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
    enqueuePgTask((pool) => upsertSourcePg(pool, created));
    persistStateToDisk();
    return created;
  },

  ensureSourceForType(
    ctx: TenantSpaceContext,
    type: ConnectorKind,
    name: string,
    extra?: Partial<DataSourceConfig>
  ): DataSourceConfig {
    hydrateStateOnce();
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
    enqueuePgTask((pool) => upsertSourcePg(pool, created));
    persistStateToDisk();
    return created;
  },

  findDuplicateIngestion(
    ctx: TenantSpaceContext,
    sourceId: string,
    externalId: string,
    payloadHash: string
  ): RawRecord | null {
    hydrateStateOnce();
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
    hydrateStateOnce();
    if (raw.tenantId !== ctx.tenantId || raw.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : RawRecord hors contexte.");
    }
    if (normalized.tenantId !== ctx.tenantId || normalized.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : NormalizedRecord hors contexte.");
    }
    const frozenRaw: RawRecord = Object.freeze({
      ...raw,
      rawPayload: deepFreeze({ ...raw.rawPayload }),
    });
    state.rawRecords.push(frozenRaw);
    state.normalizedRecords.push(normalized);
    enqueuePgTask(async (pool) => {
      await insertRawRecordPg(pool, frozenRaw);
      await upsertNormalizedRecordPg(pool, normalized);
    });
    persistStateToDisk();
    return frozenRaw;
  },

  listRawRecords(ctx: TenantSpaceContext): RawRecord[] {
    hydrateStateOnce();
    return state.rawRecords.filter(
      (r) => r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
  },

  listNormalizedRecords(
    ctx: TenantSpaceContext,
    options?: { includeArchived?: boolean; sourceId?: string }
  ): NormalizedRecord[] {
    hydrateStateOnce();
    return state.normalizedRecords.filter((r) => {
      if (r.tenantId !== ctx.tenantId || r.spaceId !== ctx.spaceId) return false;
      if (options?.sourceId && r.sourceId !== options.sourceId) return false;
      if (!options?.includeArchived && r.status !== "active") return false;
      return true;
    });
  },

  getNormalizedRecord(ctx: TenantSpaceContext, recordId: string): NormalizedRecord | null {
    hydrateStateOnce();
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
    hydrateStateOnce();
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
    enqueuePgTask((pool) => upsertSourcePg(pool, src));
    persistStateToDisk();
  },

  getProjectRules(ctx: TenantSpaceContext): { rawYaml: string; config: ProjectRulesConfig } {
    hydrateStateOnce();
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
    hydrateStateOnce();
    const parsed = parseProjectRulesYaml(yamlText);
    state.rulesYamlBySpace.set(`${ctx.tenantId}::${ctx.spaceId}`, parsed.rawYaml);
    enqueuePgTask((pool) => upsertProjectRulesPg(pool, ctx.tenantId, ctx.spaceId, parsed.rawYaml));
    persistStateToDisk();
    return parsed;
  },

  listAllSpaceContexts(): TenantSpaceContext[] {
    hydrateStateOnce();
    return tenantSpacesRegistry.map((s) => ({
      tenantId: s.tenantId,
      spaceId: s.id,
      userId: s.ownerUserId,
    }));
  },

  createRun(ctx: TenantSpaceContext, run: DataRun): DataRun {
    hydrateStateOnce();
    state.runs.unshift(run);
    enqueuePgTask((pool) => upsertRunPg(pool, run));
    persistStateToDisk();
    return run;
  },

  updateRun(ctx: TenantSpaceContext, runId: string, patch: Partial<DataRun>): DataRun | null {
    hydrateStateOnce();
    const run = state.runs.find(
      (r) => r.id === runId && r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
    if (!run) return null;
    Object.assign(run, patch);
    enqueuePgTask((pool) => upsertRunPg(pool, run));
    persistStateToDisk();
    return run;
  },

  listRuns(ctx: TenantSpaceContext): DataRun[] {
    hydrateStateOnce();
    return state.runs.filter(
      (r) => r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
  },

  replaceOpenAnomalies(ctx: TenantSpaceContext, freshAnomalies: Anomaly[]): Anomaly[] {
    hydrateStateOnce();
    state.anomalies = state.anomalies.filter(
      (a) => !(a.tenantId === ctx.tenantId && a.spaceId === ctx.spaceId && a.status === "open")
    );
    state.anomalies.unshift(...freshAnomalies);
    enqueuePgTask((pool) => replaceOpenAnomaliesPg(pool, ctx.tenantId, ctx.spaceId, freshAnomalies));
    persistStateToDisk();
    return freshAnomalies;
  },

  listAnomalies(
    ctx: TenantSpaceContext,
    options?: { status?: Anomaly["status"]; severity?: Anomaly["severity"]; runId?: string }
  ): Anomaly[] {
    hydrateStateOnce();
    return state.anomalies.filter((a) => {
      if (a.tenantId !== ctx.tenantId || a.spaceId !== ctx.spaceId) return false;
      if (options?.status && a.status !== options.status) return false;
      if (options?.severity && a.severity !== options.severity) return false;
      if (options?.runId && a.runId !== options.runId) return false;
      return true;
    });
  },

  updateAnomaly(ctx: TenantSpaceContext, anomalyId: string, patch: Partial<Anomaly>): Anomaly | null {
    hydrateStateOnce();
    const item = state.anomalies.find(
      (a) => a.id === anomalyId && a.tenantId === ctx.tenantId && a.spaceId === ctx.spaceId
    );
    if (!item) return null;
    Object.assign(item, patch);
    enqueuePgTask((pool) => upsertAnomalyPg(pool, item));
    persistStateToDisk();
    return item;
  },

  addAgentAction(ctx: TenantSpaceContext, action: AgentAction): AgentAction {
    hydrateStateOnce();
    if (action.tenantId !== ctx.tenantId || action.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : AgentAction hors contexte.");
    }
    state.agentActions.unshift(action);
    enqueuePgTask((pool) => upsertAgentActionPg(pool, action));
    persistStateToDisk();
    return action;
  },

  listAgentActions(ctx: TenantSpaceContext, runId?: string): AgentAction[] {
    hydrateStateOnce();
    return state.agentActions.filter((a) => {
      if (a.tenantId !== ctx.tenantId || a.spaceId !== ctx.spaceId) return false;
      if (runId && a.runId !== runId) return false;
      return true;
    });
  },

  listValidations(ctx: TenantSpaceContext, status?: ValidationItem["status"]): ValidationItem[] {
    hydrateStateOnce();
    return state.validationQueue.filter((v) => {
      if (v.tenantId !== ctx.tenantId || v.spaceId !== ctx.spaceId) return false;
      if (status && v.status !== status) return false;
      return true;
    });
  },

  addValidationItem(ctx: TenantSpaceContext, item: ValidationItem): ValidationItem {
    hydrateStateOnce();
    if (item.tenantId !== ctx.tenantId || item.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : ValidationItem hors contexte.");
    }
    state.validationQueue.unshift(item);
    enqueuePgTask((pool) => upsertValidationItemPg(pool, item));
    persistStateToDisk();
    return item;
  },

  recordRuleFeedback(
    ctx: TenantSpaceContext,
    ruleId: string,
    decision: "approved" | "rejected"
  ): RuleFeedbackStat {
    hydrateStateOnce();
    const now = new Date().toISOString();
    let stat = state.ruleFeedback.find(
      (f) => f.tenantId === ctx.tenantId && f.spaceId === ctx.spaceId && f.ruleId === ruleId
    );
    if (!stat) {
      stat = {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        ruleId,
        approvedCount: 0,
        rejectedCount: 0,
        totalCount: 0,
        rejectionRate: 0,
        updatedAt: now,
      };
      state.ruleFeedback.push(stat);
    }
    if (decision === "approved") stat.approvedCount += 1;
    else stat.rejectedCount += 1;
    stat.totalCount = stat.approvedCount + stat.rejectedCount;
    stat.rejectionRate =
      stat.totalCount > 0 ? Number((stat.rejectedCount / stat.totalCount).toFixed(4)) : 0;
    stat.updatedAt = now;
    enqueuePgTask((pool) => upsertRuleFeedbackPg(pool, stat!));
    persistStateToDisk();
    return stat;
  },

  listRuleFeedback(ctx: TenantSpaceContext): RuleFeedbackStat[] {
    hydrateStateOnce();
    return state.ruleFeedback.filter(
      (f) => f.tenantId === ctx.tenantId && f.spaceId === ctx.spaceId
    );
  },

  getRuleThresholdSuggestions(ctx: TenantSpaceContext): RuleThresholdSuggestion[] {
    const stats = this.listRuleFeedback(ctx);
    const { config: rules } = this.getProjectRules(ctx);
    const suggestions: RuleThresholdSuggestion[] = [];

    for (const st of stats) {
      if (st.rejectedCount < 2 || st.rejectionRate <= 0.6) continue;
      let currentSetting = "Règle active";
      let suggestedAction = "Passer la sévérité à mineure ou élargir le seuil.";

      if (st.ruleId === "near_duplicate_similarity") {
        const cur = rules.duplicateDetection.nearDuplicate.reviewThreshold;
        const next = Math.min(0.93, Number((cur + 0.05).toFixed(2)));
        currentSetting = `reviewThreshold=${cur}`;
        suggestedAction = `Relâcher reviewThreshold vers ${next} (ou autoMergeThreshold=${rules.duplicateDetection.nearDuplicate.autoMergeThreshold}) pour réduire les faux positifs.`;
      } else if (st.ruleId === "range_amount" && rules.ranges.amount) {
        const curMax = rules.ranges.amount.max;
        currentSetting = `amount=[${rules.ranges.amount.min}, ${curMax}]`;
        suggestedAction = `Élargir le plafond amount.max de ${curMax} à ${Math.round(curMax * 1.5)}.`;
      } else if (st.ruleId === "range_age" && rules.ranges.age) {
        currentSetting = `age=[${rules.ranges.age.min}, ${rules.ranges.age.max}]`;
        suggestedAction = `Vérifier les bornes age (max=${rules.ranges.age.max}) ou passer severity=a_verifier.`;
      } else if (st.ruleId === "geo_zone_mismatch" || st.ruleId === "geo_bounds") {
        currentSetting = `geoBounds.mismatchSeverity=${rules.geoBounds?.mismatchSeverity ?? "a_verifier"}`;
        suggestedAction = `Élargir légèrement les boîtes geoBounds.interventionZones pour la zone concernée.`;
      } else if (st.ruleId.startsWith("required_")) {
        const field = st.ruleId.replace("required_", "");
        currentSetting = `requiredFields[${field}]`;
        suggestedAction = `Assouplir la sévérité de ${field} vers mineure dans le YAML si ce champ est optionnel sur le terrain.`;
      }

      suggestions.push({
        ruleId: st.ruleId,
        rejectionRate: st.rejectionRate,
        rejectedCount: st.rejectedCount,
        totalCount: st.totalCount,
        currentSetting,
        suggestedAction,
        rationale: `Taux de rejet humain de ${Math.round(st.rejectionRate * 100)} % (${st.rejectedCount}/${st.totalCount} décisions). Proposition uniquement — aucune modification automatique du YAML.`,
      });
    }
    return suggestions;
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

  journalRepo.syncRecordPg(primary);
  journalRepo.syncRecordPg(secondary);
  journalRepo.persistState();
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

  journalRepo.syncRecordPg(rec);
  journalRepo.persistState();
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
      journalRepo.syncRecordPg(primary);
    }
    if (secondary && snap.secondaryBefore) {
      const sb = snap.secondaryBefore as Record<string, unknown>;
      secondary.status = (sb.status as NormalizedRecord["status"]) || "active";
      secondary.mergedIntoId = sb.mergedIntoId as string | undefined;
      secondary.archivedAt = sb.archivedAt as string | undefined;
      secondary.archivedReason = sb.archivedReason as string | undefined;
      secondary.updatedAt = new Date().toISOString();
      journalRepo.updateSourceStats(ctx, secondary.sourceId, {});
      journalRepo.syncRecordPg(secondary);
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
      journalRepo.syncRecordPg(rec);
    }
  }

  if (snap.anomalyId) {
    journalRepo.updateAnomaly(ctx, String(snap.anomalyId), { status: "open" });
  }

  action.reverted = true;
  action.revertedAt = new Date().toISOString();
  action.revertedBy = ctx.userId;
  journalRepo.syncActionPg(action);

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

  journalRepo.persistState();
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

  const linkedAnomaly = item.anomalyId
    ? journalRepo.listAnomalies(ctx).find((a) => a.id === item.anomalyId)
    : undefined;
  const feedbackRuleId =
    linkedAnomaly?.ruleId ||
    (item.actionType === "merge" ? "near_duplicate_similarity" : "general_review");
  journalRepo.recordRuleFeedback(ctx, feedbackRuleId, decision);

  journalRepo.syncValidationPg(item);
  journalRepo.persistState();
  return { item, executedAction };
}
