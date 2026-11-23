import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { getPgPool, isPgEnabled } from "./pgStore";
import type { TenantSpaceContext } from "./connectors/types";

export type ObjectiveType = "global" | "specific";
export type IndicatorDirection = "increase" | "decrease";
export type IndicatorFrequency = "monthly" | "quarterly" | "annual";
export type IndicatorPeriodType = "cumulative" | "monthly";
export type IndicatorValueStatus = "proposed" | "validated" | "rejected";
export type ProgressStatus = "on_track" | "late" | "critical" | "no_data";

export interface MealProject {
  id: string;
  tenantId: string;
  spaceId: string;
  name: string;
  startDate: string;
  endDate: string;
  zone: string;
  donor: string;
  createdAt: string;
  updatedAt: string;
}

export interface MealObjective {
  id: string;
  tenantId: string;
  spaceId: string;
  projectId: string;
  type: ObjectiveType;
  label: string;
  createdAt: string;
}

export interface TargetRevision {
  target: number;
  effectiveAt: string;
  changedAt: string;
  changedBy: string;
  reason: string;
}

export interface MealIndicator {
  id: string;
  tenantId: string;
  spaceId: string;
  projectId: string;
  objectiveId: string;
  name: string;
  unit: string;
  baseline: number;
  target: number;
  direction: IndicatorDirection;
  frequency: IndicatorFrequency;
  periodType: IndicatorPeriodType;
  verificationSource: string;
  aliases: string[];
  targetHistory: TargetRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorValue {
  id: string;
  tenantId: string;
  spaceId: string;
  projectId: string;
  indicatorId: string;
  period: string;
  value: number;
  sourceFile: string;
  sourceLocation: string;
  confidence: number;
  status: IndicatorValueStatus;
  reportHash: string;
  createdAt: string;
  validatedAt?: string;
  validatedBy?: string;
  rejectionReason?: string;
  reviewNote?: string;
}

export interface MealAuditAction {
  id: string;
  tenantId: string;
  spaceId: string;
  actorId: string;
  action: string;
  timestamp: string;
  reversible: boolean;
  revertedAt?: string;
  beforeState: MealWorkspaceState;
}

export interface MealWorkspaceState {
  projects: MealProject[];
  objectives: MealObjective[];
  indicators: MealIndicator[];
  values: IndicatorValue[];
  actions: MealAuditAction[];
  summaries: Array<{ projectId: string; period: string; text: string; createdAt: string }>;
}

export interface IndicatorProgress {
  indicator: MealIndicator;
  targetAtPeriod: number;
  currentValue: IndicatorValue | null;
  actualPercent: number | null;
  expectedPercent: number;
  status: ProgressStatus;
}

export interface ImportedReportRow {
  rowNumber: number;
  cells: Record<string, unknown>;
  addresses: Record<string, string>;
}

const EMPTY_STATE = (): MealWorkspaceState => ({
  projects: [],
  objectives: [],
  indicators: [],
  values: [],
  actions: [],
  summaries: [],
});

const cache = new Map<string, MealWorkspaceState>();
const loaded = new Set<string>();
let schemaPromise: Promise<void> | null = null;

function isTestProcess(): boolean {
  return (
    process.env.GUARDIAN_DISABLE_DISK_STATE === "1" ||
    process.argv.some((arg) => /[/\\](tests|scripts)[/\\]|evaluate\.|\.test\./.test(arg))
  );
}

function scopeKey(ctx: TenantSpaceContext): string {
  return `${ctx.tenantId}::${ctx.spaceId}`;
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function workspacePath(ctx: TenantSpaceContext): string {
  const cwd = process.cwd();
  const root = fs.existsSync(path.join(cwd, "config", "projects"))
    ? cwd
    : path.join(cwd, "backend");
  return path.join(
    root,
    "data",
    "meal-projects",
    safePart(ctx.tenantId),
    `${safePart(ctx.spaceId)}.json`
  );
}

async function ensurePgSchema(): Promise<void> {
  if (!isPgEnabled()) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = getPgPool();
      if (!pool) throw new Error("PostgreSQL activé mais pool indisponible.");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS meal_projects (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, space_id TEXT NOT NULL,
          name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
          zone TEXT NOT NULL, donor TEXT NOT NULL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, UNIQUE (tenant_id, space_id, id)
        );
        CREATE TABLE IF NOT EXISTS meal_objectives (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, space_id TEXT NOT NULL,
          project_id TEXT NOT NULL, type TEXT NOT NULL, label TEXT NOT NULL,
          created_at TEXT NOT NULL, UNIQUE (tenant_id, space_id, id)
        );
        CREATE INDEX IF NOT EXISTS meal_objectives_project_idx
          ON meal_objectives (tenant_id, space_id, project_id);
        CREATE TABLE IF NOT EXISTS meal_indicators (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, space_id TEXT NOT NULL,
          project_id TEXT NOT NULL, objective_id TEXT NOT NULL, name TEXT NOT NULL,
          unit TEXT NOT NULL, baseline DOUBLE PRECISION NOT NULL, target DOUBLE PRECISION NOT NULL,
          direction TEXT NOT NULL, frequency TEXT NOT NULL, period_type TEXT NOT NULL,
          verification_source TEXT NOT NULL, aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
          target_history JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          UNIQUE (tenant_id, space_id, id)
        );
        CREATE INDEX IF NOT EXISTS meal_indicators_project_idx
          ON meal_indicators (tenant_id, space_id, project_id, objective_id);
        CREATE TABLE IF NOT EXISTS meal_indicator_values (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, space_id TEXT NOT NULL,
          project_id TEXT NOT NULL, indicator_id TEXT NOT NULL, period TEXT NOT NULL,
          value DOUBLE PRECISION NOT NULL, source_file TEXT NOT NULL,
          source_location TEXT NOT NULL, confidence DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL, report_hash TEXT NOT NULL, created_at TEXT NOT NULL,
          validated_at TEXT, validated_by TEXT, rejection_reason TEXT,
          review_note TEXT,
          UNIQUE (tenant_id, space_id, indicator_id, period, report_hash, source_location)
        );
        ALTER TABLE meal_indicator_values ADD COLUMN IF NOT EXISTS review_note TEXT;
        CREATE INDEX IF NOT EXISTS meal_indicator_values_period_idx
          ON meal_indicator_values (tenant_id, space_id, project_id, period, status);
        CREATE TABLE IF NOT EXISTS meal_project_actions (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, space_id TEXT NOT NULL,
          timestamp TEXT NOT NULL, reversible BOOLEAN NOT NULL,
          reverted_at TEXT, action_data JSONB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS meal_project_summaries (
          id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, space_id TEXT NOT NULL,
          project_id TEXT NOT NULL, period TEXT NOT NULL, text TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);
    })().catch((error: unknown) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

export async function loadMealWorkspace(ctx: TenantSpaceContext): Promise<MealWorkspaceState> {
  const key = scopeKey(ctx);
  if (!isPgEnabled() && loaded.has(key)) return cache.get(key) ?? EMPTY_STATE();

  if (isPgEnabled()) {
    await ensurePgSchema();
    const pool = getPgPool();
    if (!pool) throw new Error("Pool PostgreSQL indisponible.");
    const [projects, objectives, indicators, values, actions, summaries] = await Promise.all([
      pool.query("SELECT * FROM meal_projects WHERE tenant_id = $1 AND space_id = $2", [ctx.tenantId, ctx.spaceId]),
      pool.query("SELECT * FROM meal_objectives WHERE tenant_id = $1 AND space_id = $2", [ctx.tenantId, ctx.spaceId]),
      pool.query("SELECT * FROM meal_indicators WHERE tenant_id = $1 AND space_id = $2", [ctx.tenantId, ctx.spaceId]),
      pool.query("SELECT * FROM meal_indicator_values WHERE tenant_id = $1 AND space_id = $2", [ctx.tenantId, ctx.spaceId]),
      pool.query("SELECT action_data FROM meal_project_actions WHERE tenant_id = $1 AND space_id = $2 ORDER BY timestamp DESC", [ctx.tenantId, ctx.spaceId]),
      pool.query("SELECT project_id, period, text, created_at FROM meal_project_summaries WHERE tenant_id = $1 AND space_id = $2 ORDER BY created_at DESC", [ctx.tenantId, ctx.spaceId]),
    ]);
    return {
      projects: projects.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, spaceId: row.space_id, name: row.name,
        startDate: row.start_date, endDate: row.end_date, zone: row.zone, donor: row.donor,
        createdAt: row.created_at, updatedAt: row.updated_at,
      })),
      objectives: objectives.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, spaceId: row.space_id, projectId: row.project_id,
        type: row.type, label: row.label, createdAt: row.created_at,
      })),
      indicators: indicators.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, spaceId: row.space_id, projectId: row.project_id,
        objectiveId: row.objective_id, name: row.name, unit: row.unit, baseline: Number(row.baseline),
        target: Number(row.target), direction: row.direction, frequency: row.frequency,
        periodType: row.period_type, verificationSource: row.verification_source,
        aliases: row.aliases ?? [], targetHistory: row.target_history ?? [],
        createdAt: row.created_at, updatedAt: row.updated_at,
      })),
      values: values.rows.map((row) => ({
        id: row.id, tenantId: row.tenant_id, spaceId: row.space_id, projectId: row.project_id,
        indicatorId: row.indicator_id, period: row.period, value: Number(row.value),
        sourceFile: row.source_file, sourceLocation: row.source_location,
        confidence: Number(row.confidence), status: row.status, reportHash: row.report_hash,
        createdAt: row.created_at, validatedAt: row.validated_at ?? undefined,
        validatedBy: row.validated_by ?? undefined, rejectionReason: row.rejection_reason ?? undefined,
        reviewNote: row.review_note ?? undefined,
      })),
      actions: actions.rows.map((row) => row.action_data as MealAuditAction),
      summaries: summaries.rows.map((row) => ({
        projectId: row.project_id, period: row.period, text: row.text, createdAt: row.created_at,
      })),
    };
  }

  const file = workspacePath(ctx);
  const state = !isTestProcess() && fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as MealWorkspaceState)
    : EMPTY_STATE();
  cache.set(key, state);
  loaded.add(key);
  return state;
}

export async function saveMealWorkspace(
  ctx: TenantSpaceContext,
  state: MealWorkspaceState
): Promise<void> {
  const key = scopeKey(ctx);
  if (isPgEnabled()) {
    await ensurePgSchema();
    const pool = getPgPool();
    if (!pool) throw new Error("Pool PostgreSQL indisponible.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of [
        "meal_indicator_values",
        "meal_indicators",
        "meal_objectives",
        "meal_projects",
        "meal_project_actions",
        "meal_project_summaries",
      ]) {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND space_id = $2`, [
          ctx.tenantId,
          ctx.spaceId,
        ]);
      }
      for (const project of state.projects) {
        await client.query(
          `INSERT INTO meal_projects
            (id, tenant_id, space_id, name, start_date, end_date, zone, donor, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [project.id, ctx.tenantId, ctx.spaceId, project.name, project.startDate, project.endDate,
            project.zone, project.donor, project.createdAt, project.updatedAt]
        );
      }
      for (const objective of state.objectives) {
        await client.query(
          `INSERT INTO meal_objectives (id, tenant_id, space_id, project_id, type, label, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [objective.id, ctx.tenantId, ctx.spaceId, objective.projectId, objective.type, objective.label, objective.createdAt]
        );
      }
      for (const indicator of state.indicators) {
        await client.query(
          `INSERT INTO meal_indicators
            (id, tenant_id, space_id, project_id, objective_id, name, unit, baseline, target,
             direction, frequency, period_type, verification_source, aliases, target_history,
             created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)`,
          [indicator.id, ctx.tenantId, ctx.spaceId, indicator.projectId, indicator.objectiveId,
            indicator.name, indicator.unit, indicator.baseline, indicator.target, indicator.direction,
            indicator.frequency, indicator.periodType, indicator.verificationSource,
            JSON.stringify(indicator.aliases), JSON.stringify(indicator.targetHistory),
            indicator.createdAt, indicator.updatedAt]
        );
      }
      for (const item of state.values) {
        await client.query(
          `INSERT INTO meal_indicator_values
            (id, tenant_id, space_id, project_id, indicator_id, period, value, source_file,
             source_location, confidence, status, report_hash, created_at, validated_at,
             validated_by, rejection_reason, review_note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [item.id, ctx.tenantId, ctx.spaceId, item.projectId, item.indicatorId, item.period,
            item.value, item.sourceFile, item.sourceLocation, item.confidence, item.status,
            item.reportHash, item.createdAt, item.validatedAt ?? null, item.validatedBy ?? null,
            item.rejectionReason ?? null, item.reviewNote ?? null]
        );
      }
      for (const action of state.actions) {
        await client.query(
          `INSERT INTO meal_project_actions
            (id, tenant_id, space_id, timestamp, reversible, reverted_at, action_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [action.id, ctx.tenantId, ctx.spaceId, action.timestamp, action.reversible,
            action.revertedAt ?? null, JSON.stringify(action)]
        );
      }
      for (const summary of state.summaries) {
        await client.query(
          `INSERT INTO meal_project_summaries (id, tenant_id, space_id, project_id, period, text, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newId("summary"), ctx.tenantId, ctx.spaceId, summary.projectId, summary.period,
            summary.text, summary.createdAt]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } else {
    if (!isTestProcess()) {
      const file = workspacePath(ctx);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
      fs.renameSync(temporary, file);
    }
    cache.set(key, state);
    loaded.add(key);
  }
}

export function calculateIndicatorProgress(
  indicator: MealIndicator,
  values: IndicatorValue[],
  project: MealProject,
  asOfPeriod: string,
  thresholds: { onTrackVariance: number; lateVariance: number }
): IndicatorProgress {
  const candidates = values
    .filter(
      (item) =>
        item.indicatorId === indicator.id &&
        item.status === "validated" &&
        item.period <= asOfPeriod
    )
    .sort((a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt));
  const currentValue = candidates[0] ?? null;
  const targetForPeriod = [...indicator.targetHistory]
    .filter((revision) => revision.effectiveAt <= `${asOfPeriod}-31`)
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]?.target ?? indicator.target;
  const meetsDirection =
    indicator.direction === "increase"
      ? (currentValue?.value ?? indicator.baseline) >= targetForPeriod
      : (currentValue?.value ?? indicator.baseline) <= targetForPeriod;

  const progressForValue = (value: number): number => {
    const denominator = targetForPeriod - indicator.baseline;
    if (denominator === 0) return meetsDirection ? 100 : 0;
    const ratio =
      indicator.direction === "increase"
        ? (value - indicator.baseline) / denominator
        : (indicator.baseline - value) / (indicator.baseline - targetForPeriod);
    return Number((ratio * 100).toFixed(2));
  };

  const [year, month] = asOfPeriod.split("-").map(Number);
  const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString();
  const elapsed = Math.min(
    1,
    Math.max(
      0,
      (Date.parse(periodEnd) - Date.parse(`${project.startDate}T00:00:00Z`)) /
        Math.max(
          1,
          Date.parse(`${project.endDate}T00:00:00Z`) -
            Date.parse(`${project.startDate}T00:00:00Z`)
        )
    )
  );
  const expectedPercent = Number(
    ((indicator.periodType === "monthly" ? 1 : elapsed) * 100).toFixed(2)
  );

  if (!currentValue) {
    return {
      indicator,
      targetAtPeriod: targetForPeriod,
      currentValue: null,
      actualPercent: null,
      expectedPercent,
      status: "no_data",
    };
  }

  const actualPercent = progressForValue(currentValue.value);
  const variance = actualPercent - expectedPercent;
  const status: ProgressStatus =
    variance >= -thresholds.onTrackVariance
      ? "on_track"
      : variance >= -thresholds.lateVariance
        ? "late"
        : "critical";
  return {
    indicator,
    targetAtPeriod: targetForPeriod,
    currentValue,
    actualPercent,
    expectedPercent,
    status,
  };
}

export function targetForPeriod(indicator: MealIndicator, period: string): number {
  const date = `${period}-31`;
  return (
    [...indicator.targetHistory]
      .filter((revision) => revision.effectiveAt <= date)
      .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0]?.target ?? indicator.target
  );
}

export function periodDate(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

export function isPlausibleIndicatorValue(indicator: MealIndicator, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (indicator.unit.trim() === "%") return value >= 0 && value <= 100;
  if (/person|ménage|menage|bénéficiaire|beneficiaire|enfant|cas|visite|nombre/i.test(indicator.unit)) {
    return value >= 0;
  }
  return true;
}

export function applyImportedReport(params: {
  state: MealWorkspaceState;
  project: MealProject;
  rows: ImportedReportRow[];
  mapping: Record<string, string>;
  period?: string;
  periodHeader?: string;
  fileName: string;
  reportHash: string;
  format: "xlsx" | "pdf";
  thresholds: {
    autoValidate: number;
    minimum: number;
    maxAbsoluteJump: number;
    maxRelativeJump: number;
  };
}): { inserted: number; skippedIdempotent: number; proposed: number } {
  const { state, project, rows, mapping, period, periodHeader, fileName, reportHash, format, thresholds } =
    params;
  let inserted = 0;
  let skippedIdempotent = 0;
  let proposed = 0;
  const indicatorById = new Map(
    state.indicators
      .filter((indicator) => indicator.projectId === project.id && indicator.spaceId === project.spaceId)
      .map((indicator) => [indicator.id, indicator])
  );
  const previousFor = (indicatorId: string, valuePeriod: string) =>
    state.values
      .filter(
        (value) =>
          value.indicatorId === indicatorId &&
          value.period < valuePeriod &&
          value.status === "validated"
      )
      .sort((a, b) => b.period.localeCompare(a.period))[0];

  for (const row of rows) {
    let valuePeriod = period;
    if (periodHeader && row.cells[periodHeader] !== undefined) {
      const periodValue = row.cells[periodHeader];
      if (periodValue instanceof Date && !Number.isNaN(periodValue.getTime())) {
        valuePeriod = periodValue.toISOString().slice(0, 7);
      } else {
        const text = String(periodValue ?? "").trim();
        const iso = /^(\d{4})-(\d{2})/.exec(text);
        const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
        valuePeriod = iso
          ? `${iso[1]}-${iso[2]}`
          : french
            ? `${french[3]}-${french[2].padStart(2, "0")}`
            : undefined;
      }
    }
    if (!valuePeriod || !periodDate(valuePeriod)) continue;

    for (const [header, indicatorId] of Object.entries(mapping)) {
      const rawValue = row.cells[header];
      if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") continue;
      const number =
        typeof rawValue === "number"
          ? rawValue
          : Number(String(rawValue).trim().replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(number)) continue;
      const indicator = indicatorById.get(indicatorId);
      if (!indicator) continue;
      const sourceLocation = row.addresses[header] ?? `${header} (ligne ${row.rowNumber})`;
      const duplicate = state.values.some(
        (value) =>
          value.indicatorId === indicatorId &&
          value.period === valuePeriod &&
          value.reportHash === reportHash &&
          value.sourceLocation === sourceLocation
      );
      if (duplicate) {
        skippedIdempotent += 1;
        continue;
      }
      const previous = previousFor(indicatorId, valuePeriod);
      const valueForSamePeriodExists = state.values.some(
        (value) =>
          value.indicatorId === indicatorId &&
          value.period === valuePeriod &&
          value.status === "validated" &&
          value.reportHash !== reportHash
      );
      let confidence = format === "pdf" ? 0.4 : 0.98;
      if (!isPlausibleIndicatorValue(indicator, number)) confidence = 0.2;
      if (valueForSamePeriodExists) confidence = Math.min(confidence, 0.55);
      if (
        previous &&
        (Math.abs(number - previous.value) > thresholds.maxAbsoluteJump ||
          (Math.abs(previous.value) > 0 &&
            Math.abs(number / previous.value) > thresholds.maxRelativeJump))
      ) {
        confidence = Math.min(confidence, 0.55);
      }
      const item: IndicatorValue = {
        id: `value-${Date.now()}-${createHash("sha1").update(`${Math.random()}`).digest("hex").slice(0, 8)}`,
        tenantId: project.tenantId,
        spaceId: project.spaceId,
        projectId: project.id,
        indicatorId,
        period: valuePeriod,
        value: number,
        sourceFile: fileName,
        sourceLocation,
        confidence,
        status:
          confidence >= thresholds.autoValidate && confidence >= thresholds.minimum
            ? "validated"
            : "proposed",
        reportHash,
        createdAt: new Date().toISOString(),
      };
      state.values.unshift(item);
      inserted += 1;
      if (item.status === "proposed") proposed += 1;
    }
  }
  return { inserted, skippedIdempotent, proposed };
}

export function stableReportHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
