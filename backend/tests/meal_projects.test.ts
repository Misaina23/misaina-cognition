import assert from "node:assert/strict";
import {
  applyImportedReport,
  calculateIndicatorProgress,
  loadMealWorkspace,
  saveMealWorkspace,
  type IndicatorValue,
  type MealIndicator,
  type MealProject,
  type MealWorkspaceState,
} from "../src/mealProjects";

const thresholds = {
  onTrackVariance: 10,
  lateVariance: 25,
  autoValidate: 0.9,
  minimum: 0.5,
  maxAbsoluteJump: 50,
  maxRelativeJump: 3,
};

function indicator(overrides: Partial<MealIndicator> = {}): MealIndicator {
  return {
    id: "indicator-one",
    tenantId: "tenant-one",
    spaceId: "space-one",
    projectId: "project-one",
    objectiveId: "objective-one",
    name: "Ménages servis",
    unit: "ménages",
    baseline: 0,
    target: 100,
    direction: "increase",
    frequency: "monthly",
    periodType: "cumulative",
    verificationSource: "Registre terrain",
    aliases: [],
    targetHistory: [
      { target: 100, effectiveAt: "2026-01-01", changedAt: "2026-01-01", changedBy: "u", reason: "Initiale" },
      { target: 200, effectiveAt: "2026-07-01", changedAt: "2026-06-15", changedBy: "u", reason: "Révision" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function project(overrides: Partial<MealProject> = {}): MealProject {
  return {
    id: "project-one",
    tenantId: "tenant-one",
    spaceId: "space-one",
    name: "Projet test",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    zone: "Antananarivo",
    donor: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function value(overrides: Partial<IndicatorValue> = {}): IndicatorValue {
  return {
    id: "value-one",
    tenantId: "tenant-one",
    spaceId: "space-one",
    projectId: "project-one",
    indicatorId: "indicator-one",
    period: "2026-03",
    value: 50,
    sourceFile: "report.xlsx",
    sourceLocation: "C2",
    confidence: 0.98,
    status: "validated",
    reportHash: "report-hash",
    createdAt: "2026-03-10T00:00:00.000Z",
    ...overrides,
  };
}

async function main() {
  const projectData = project();
  const increase = indicator();
  const march = calculateIndicatorProgress(
    increase,
    [value()],
    projectData,
    "2026-03",
    thresholds
  );
  assert.equal(march.actualPercent, 50);
  assert.ok(march.expectedPercent > 23 && march.expectedPercent < 27);
  assert.equal(march.status, "on_track");
  assert.equal(march.targetAtPeriod, 100);

  const july = calculateIndicatorProgress(
    increase,
    [value({ period: "2026-07", value: 150 })],
    projectData,
    "2026-07",
    thresholds
  );
  assert.equal(july.actualPercent, 75);
  assert.equal(july.targetAtPeriod, 200);

  const decrease = calculateIndicatorProgress(
    indicator({
      baseline: 80,
      target: 20,
      direction: "decrease",
      targetHistory: [
        { target: 20, effectiveAt: "2026-01-01", changedAt: "2026-01-01", changedBy: "u", reason: "Initiale" },
      ],
    }),
    [value({ value: 50 })],
    projectData,
    "2026-03",
    thresholds
  );
  assert.equal(decrease.actualPercent, 50);

  const equalTargetIndicator = indicator({
    baseline: 5,
    target: 5,
    targetHistory: [
      { target: 5, effectiveAt: "2026-01-01", changedAt: "2026-01-01", changedBy: "u", reason: "Initiale" },
    ],
  });
  assert.equal(
    calculateIndicatorProgress(
      equalTargetIndicator,
      [value({ value: 5 })],
      projectData,
      "2026-03",
      thresholds
    ).actualPercent,
    100
  );
  assert.equal(
    calculateIndicatorProgress(
      equalTargetIndicator,
      [value({ value: 4 })],
      projectData,
      "2026-03",
      thresholds
    ).actualPercent,
    0
  );
  assert.equal(
    calculateIndicatorProgress(increase, [], projectData, "2026-03", thresholds).status,
    "no_data"
  );
  assert.equal(
    calculateIndicatorProgress(
      indicator({ periodType: "monthly" }),
      [value()],
      projectData,
      "2026-03",
      thresholds
    ).expectedPercent,
    100
  );

  const state: MealWorkspaceState = {
    projects: [projectData],
    objectives: [],
    indicators: [increase],
    values: [],
    actions: [],
    summaries: [],
  };
  const report = {
    state,
    project: projectData,
    rows: [
      {
        rowNumber: 2,
        cells: { Période: "2026-04", "Ménages servis": 42 },
        addresses: { "Ménages servis": "B2" },
      },
    ],
    mapping: { "Ménages servis": increase.id },
    periodHeader: "Période",
    fileName: "rapport.xlsx",
    reportHash: "same-report-hash",
    format: "xlsx" as const,
    thresholds,
  };
  const firstImport = applyImportedReport(report);
  assert.deepEqual(firstImport, { inserted: 1, skippedIdempotent: 0, proposed: 0 });
  assert.equal(state.values[0].sourceLocation, "B2");
  const duplicateImport = applyImportedReport(report);
  assert.deepEqual(duplicateImport, { inserted: 0, skippedIdempotent: 1, proposed: 0 });

  const pdfImport = applyImportedReport({
    ...report,
    rows: [{ rowNumber: 1, cells: { "Page 1, ligne 1: Ménages servis 42": 42 }, addresses: { "Page 1, ligne 1: Ménages servis 42": "Page 1, ligne 1" } }],
    mapping: { "Page 1, ligne 1: Ménages servis 42": increase.id },
    period: "2026-05",
    periodHeader: undefined,
    fileName: "rapport.pdf",
    reportHash: "pdf-report-hash",
    format: "pdf" as const,
  });
  assert.equal(pdfImport.proposed, 1);
  assert.equal(state.values[0].confidence, 0.4);
  assert.equal(state.values[0].status, "proposed");

  const spikeState: MealWorkspaceState = {
    ...state,
    values: [value({ period: "2026-03", value: 20 })],
  };
  const spike = applyImportedReport({
    ...report,
    state: spikeState,
    rows: [{ rowNumber: 2, cells: { "Ménages servis": 90 }, addresses: { "Ménages servis": "B2" } }],
    period: "2026-04",
    periodHeader: undefined,
    reportHash: "spike-report-hash",
  });
  assert.equal(spike.proposed, 1);
  assert.equal(spikeState.values[0].confidence, 0.55);

  const percentIndicator = indicator({
    id: "indicator-percent",
    unit: "%",
    baseline: 20,
    target: 100,
    targetHistory: [
      { target: 100, effectiveAt: "2026-01-01", changedAt: "2026-01-01", changedBy: "u", reason: "Initiale" },
    ],
  });
  const percentState: MealWorkspaceState = {
    projects: [projectData],
    objectives: [],
    indicators: [percentIndicator],
    values: [],
    actions: [],
    summaries: [],
  };
  const invalidPercent = applyImportedReport({
    ...report,
    state: percentState,
    rows: [{ rowNumber: 2, cells: { "Ménages servis": 101 }, addresses: { "Ménages servis": "B2" } }],
    mapping: { "Ménages servis": percentIndicator.id },
    period: "2026-04",
    periodHeader: undefined,
    reportHash: "invalid-percent-report",
  });
  assert.equal(invalidPercent.proposed, 1);
  assert.equal(percentState.values[0].confidence, 0.2);

  const isolatedContext = {
    tenantId: `meal-test-tenant-${Date.now()}`,
    spaceId: "space-a",
    userId: "test-user",
  };
  const otherTenantContext = { ...isolatedContext, tenantId: `${isolatedContext.tenantId}-other` };
  const scopedState = {
    projects: [project({ tenantId: isolatedContext.tenantId, spaceId: isolatedContext.spaceId })],
    objectives: [],
    indicators: [],
    values: [],
    actions: [],
    summaries: [],
  };
  await saveMealWorkspace(isolatedContext, scopedState);
  assert.equal((await loadMealWorkspace(isolatedContext)).projects.length, 1);
  assert.equal((await loadMealWorkspace(otherTenantContext)).projects.length, 0);

  console.log("[backend/tests/meal_projects.test.ts] Calculs, révisions de cible, import idempotent et isolation MEAL validés.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
