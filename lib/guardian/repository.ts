import fs from "node:fs";
import path from "node:path";
import { mockDb } from "../server/mockDb";
import {
  DEFAULT_PROJECT_RULES_YAML,
  parseProjectRulesYaml,
  type ProjectRulesConfig,
} from "./rulesConfig";
import type {
  AgentAction,
  Anomaly,
  ConnectorKind,
  DataRun,
  DataSourceConfig,
  NormalizedRecord,
  RawRecord,
  TenantSpaceContext,
  UserSpace,
  ValidationItem,
} from "./types";

/**
 * Couche d'accès aux données du Gardien strictement scopée par (tenantId, spaceId).
 * Aucune requête ne peut traverser la frontière d'un autre tenant ou d'un autre espace.
 */
export const guardianRepo = {
  /** Liste les espaces d'un utilisateur dans son tenant */
  listSpaces(tenantId: string, userId: string): UserSpace[] {
    return mockDb.userSpaces.filter(
      (s) =>
        s.tenantId === tenantId &&
        (s.ownerUserId === userId || s.memberUserIds.includes(userId))
    );
  },

  /** Crée un nouvel espace isolé dans le tenant de l'utilisateur */
  createSpace(
    tenantId: string,
    userId: string,
    name: string,
    description = ""
  ): UserSpace {
    const space: UserSpace = {
      id: `space-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tenantId,
      name: name.trim(),
      description: description.trim(),
      ownerUserId: userId,
      memberUserIds: [userId],
      createdAt: new Date().toISOString(),
    };
    mockDb.userSpaces.push(space);
    return space;
  },

  /** Liste les sources connectées d'un espace (tenantId, spaceId) */
  listSources(ctx: TenantSpaceContext): DataSourceConfig[] {
    return mockDb.guardianSources.filter(
      (s) => s.tenantId === ctx.tenantId && s.spaceId === ctx.spaceId
    );
  },

  /** Récupère une source uniquement si elle appartient au couple (tenantId, spaceId) */
  getSource(ctx: TenantSpaceContext, sourceId: string): DataSourceConfig | null {
    return (
      mockDb.guardianSources.find(
        (s) =>
          s.id === sourceId &&
          s.tenantId === ctx.tenantId &&
          s.spaceId === ctx.spaceId
      ) || null
    );
  },

  /** Crée ou met à jour une source dans l'espace (tenantId, spaceId) */
  upsertSource(
    ctx: TenantSpaceContext,
    input: Omit<DataSourceConfig, "tenantId" | "spaceId" | "createdAt" | "recordsCount"> & {
      recordsCount?: number;
    }
  ): DataSourceConfig {
    const existing = this.getSource(ctx, input.id);
    if (existing) {
      Object.assign(existing, input, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
      });
      return existing;
    }

    const created: DataSourceConfig = {
      ...input,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      recordsCount: input.recordsCount ?? 0,
      createdAt: new Date().toISOString(),
    };
    mockDb.guardianSources.push(created);
    return created;
  },

  /** Retrouve ou crée une source par défaut selon le type dans (tenantId, spaceId) */
  ensureSourceForType(
    ctx: TenantSpaceContext,
    type: ConnectorKind,
    name: string,
    extra?: Partial<DataSourceConfig>
  ): DataSourceConfig {
    const existing = mockDb.guardianSources.find(
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
    mockDb.guardianSources.push(created);
    return created;
  },

  /**
   * Vérifie l'idempotence dans (tenantId, spaceId, sourceId) :
   * - même externalId déjà ingéré avec le même payloadHash
   * - ou même payloadHash exact pour cette source
   */
  findDuplicateIngestion(
    ctx: TenantSpaceContext,
    sourceId: string,
    externalId: string,
    payloadHash: string
  ): RawRecord | null {
    return (
      mockDb.rawRecords.find(
        (r) =>
          r.tenantId === ctx.tenantId &&
          r.spaceId === ctx.spaceId &&
          r.sourceId === sourceId &&
          (r.payloadHash === payloadHash ||
            (externalId !== "" && r.externalId === externalId && r.payloadHash === payloadHash))
      ) || null
    );
  },

  /**
   * Insère un couple (RawRecord immuable, NormalizedRecord) dans (tenantId, spaceId).
   * Le brut est figé par Object.freeze afin qu'aucune opération ultérieure ne le modifie.
   */
  insertIngestedPair(
    ctx: TenantSpaceContext,
    raw: RawRecord,
    normalized: NormalizedRecord
  ): RawRecord {
    if (raw.tenantId !== ctx.tenantId || raw.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : RawRecord hors contexte (tenantId, spaceId).");
    }
    if (normalized.tenantId !== ctx.tenantId || normalized.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : NormalizedRecord hors contexte (tenantId, spaceId).");
    }

    const deepFreeze = <T>(obj: T): T => {
      if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
        Object.freeze(obj);
        for (const val of Object.values(obj as Record<string, unknown>)) {
          deepFreeze(val);
        }
      }
      return obj;
    };

    const frozenRaw: RawRecord = Object.freeze({
      ...raw,
      rawPayload: deepFreeze({ ...raw.rawPayload }),
    });
    mockDb.rawRecords.push(frozenRaw);
    mockDb.normalizedRecords.push(normalized);
    return frozenRaw;
  },

  /** Liste les enregistrements bruts (lecture seule) pour (tenantId, spaceId) */
  listRawRecords(ctx: TenantSpaceContext): RawRecord[] {
    return mockDb.rawRecords.filter(
      (r) => r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
  },

  /** Liste les enregistrements normalisés pour (tenantId, spaceId) */
  listNormalizedRecords(
    ctx: TenantSpaceContext,
    options?: { includeArchived?: boolean; sourceId?: string }
  ): NormalizedRecord[] {
    return mockDb.normalizedRecords.filter((r) => {
      if (r.tenantId !== ctx.tenantId || r.spaceId !== ctx.spaceId) return false;
      if (options?.sourceId && r.sourceId !== options.sourceId) return false;
      if (!options?.includeArchived && r.status !== "active") return false;
      return true;
    });
  },

  /** Récupère un enregistrement normalisé par ID, uniquement dans (tenantId, spaceId) */
  getNormalizedRecord(
    ctx: TenantSpaceContext,
    recordId: string
  ): NormalizedRecord | null {
    return (
      mockDb.normalizedRecords.find(
        (r) =>
          r.id === recordId &&
          r.tenantId === ctx.tenantId &&
          r.spaceId === ctx.spaceId
      ) || null
    );
  },

  /** Met à jour le compteur d'enregistrements et le curseur d'une source */
  updateSourceStats(
    ctx: TenantSpaceContext,
    sourceId: string,
    patch: Partial<Pick<DataSourceConfig, "lastCursorDate" | "lastCursorId" | "lastSyncAt" | "status">>
  ): void {
    const src = this.getSource(ctx, sourceId);
    if (!src) return;
    Object.assign(src, patch);
    src.recordsCount = mockDb.normalizedRecords.filter(
      (r) =>
        r.tenantId === ctx.tenantId &&
        r.spaceId === ctx.spaceId &&
        r.sourceId === sourceId &&
        r.status === "active"
    ).length;
  },

  /** Retourne le YAML de règles du projet pour (tenantId, spaceId) et sa config validée */
  getProjectRules(ctx: TenantSpaceContext): { rawYaml: string; config: ProjectRulesConfig } {
    const key = `${ctx.tenantId}::${ctx.spaceId}`;
    let rawYaml = mockDb.projectRulesYaml.get(key);
    if (!rawYaml) {
      const examplePath = path.join(process.cwd(), "config", "projects", "exemple-csv.yaml");
      if (fs.existsSync(examplePath)) {
        rawYaml = fs.readFileSync(examplePath, "utf8");
      } else {
        rawYaml = DEFAULT_PROJECT_RULES_YAML;
      }
    }
    return parseProjectRulesYaml(rawYaml);
  },

  /** Sauvegarde et valide un nouveau fichier YAML de règles pour (tenantId, spaceId) */
  setProjectRulesYaml(
    ctx: TenantSpaceContext,
    yamlText: string
  ): { rawYaml: string; config: ProjectRulesConfig } {
    const parsed = parseProjectRulesYaml(yamlText);
    const key = `${ctx.tenantId}::${ctx.spaceId}`;
    mockDb.projectRulesYaml.set(key, parsed.rawYaml);
    return parsed;
  },

  /** Liste tous les couples (tenantId, spaceId) existants pour la tâche planifiée nocturne */
  listAllSpaceContexts(): TenantSpaceContext[] {
    return mockDb.userSpaces.map((s) => ({
      tenantId: s.tenantId,
      spaceId: s.id,
      userId: s.ownerUserId,
    }));
  },

  /** Crée un DataRun dans (tenantId, spaceId) */
  createRun(ctx: TenantSpaceContext, run: DataRun): DataRun {
    if (run.tenantId !== ctx.tenantId || run.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : DataRun hors contexte.");
    }
    mockDb.dataRuns.unshift(run);
    return run;
  },

  /** Met à jour un DataRun dans (tenantId, spaceId) */
  updateRun(ctx: TenantSpaceContext, runId: string, patch: Partial<DataRun>): DataRun | null {
    const run = mockDb.dataRuns.find(
      (r) => r.id === runId && r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
    if (!run) return null;
    Object.assign(run, patch);
    return run;
  },

  /** Liste les runs de l'espace (tenantId, spaceId) */
  listRuns(ctx: TenantSpaceContext): DataRun[] {
    return mockDb.dataRuns.filter(
      (r) => r.tenantId === ctx.tenantId && r.spaceId === ctx.spaceId
    );
  },

  /**
   * Met à jour les anomalies ouvertes pour (tenantId, spaceId) lors d'un nouveau run
   * tout en préservant l'historique des anomalies déjà traitées/validées.
   */
  replaceOpenAnomalies(ctx: TenantSpaceContext, freshAnomalies: Anomaly[]): Anomaly[] {
    mockDb.anomalies = mockDb.anomalies.filter(
      (a) =>
        !(a.tenantId === ctx.tenantId && a.spaceId === ctx.spaceId && a.status === "open")
    );
    mockDb.anomalies.unshift(...freshAnomalies);
    return freshAnomalies;
  },

  /** Liste les anomalies de l'espace (tenantId, spaceId) */
  listAnomalies(
    ctx: TenantSpaceContext,
    options?: { status?: Anomaly["status"]; severity?: Anomaly["severity"]; runId?: string }
  ): Anomaly[] {
    return mockDb.anomalies.filter((a) => {
      if (a.tenantId !== ctx.tenantId || a.spaceId !== ctx.spaceId) return false;
      if (options?.status && a.status !== options.status) return false;
      if (options?.severity && a.severity !== options.severity) return false;
      if (options?.runId && a.runId !== options.runId) return false;
      return true;
    });
  },

  getAnomaly(ctx: TenantSpaceContext, anomalyId: string): Anomaly | null {
    return (
      mockDb.anomalies.find(
        (a) => a.id === anomalyId && a.tenantId === ctx.tenantId && a.spaceId === ctx.spaceId
      ) || null
    );
  },

  updateAnomaly(ctx: TenantSpaceContext, anomalyId: string, patch: Partial<Anomaly>): Anomaly | null {
    const item = this.getAnomaly(ctx, anomalyId);
    if (!item) return null;
    Object.assign(item, patch);
    return item;
  },

  /** Enregistre une action d'agent (ou humaine) dans agent_actions, scopée par (tenantId, spaceId) */
  addAgentAction(ctx: TenantSpaceContext, action: AgentAction): AgentAction {
    if (action.tenantId !== ctx.tenantId || action.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : AgentAction hors contexte.");
    }
    mockDb.agentActions.unshift(action);
    return action;
  },

  listAgentActions(ctx: TenantSpaceContext, runId?: string): AgentAction[] {
    return mockDb.agentActions.filter((a) => {
      if (a.tenantId !== ctx.tenantId || a.spaceId !== ctx.spaceId) return false;
      if (runId && a.runId !== runId) return false;
      return true;
    });
  },

  listValidations(ctx: TenantSpaceContext, status?: ValidationItem["status"]): ValidationItem[] {
    return mockDb.validationQueue.filter((v) => {
      if (v.tenantId !== ctx.tenantId || v.spaceId !== ctx.spaceId) return false;
      if (status && v.status !== status) return false;
      return true;
    });
  },

  addValidationItem(ctx: TenantSpaceContext, item: ValidationItem): ValidationItem {
    if (item.tenantId !== ctx.tenantId || item.spaceId !== ctx.spaceId) {
      throw new Error("Violation d'isolation : ValidationItem hors contexte.");
    }
    mockDb.validationQueue.unshift(item);
    return item;
  },
};
