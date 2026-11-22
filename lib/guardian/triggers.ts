import { mockDb } from "../server/mockDb";
import { guardianRepo } from "./repository";
import { runDeterministicControls } from "./rulesEngine";
import type { AnomalySeverity, DataRun, TenantSpaceContext } from "./types";

export interface TriggerRunOptions {
  sourceId: string;
  trigger: DataRun["trigger"];
  recordsIngested?: number;
  recordsSkippedIdempotent?: number;
}

/**
 * Exécute un cycle de contrôle déterministe identifié par un `runId` unique
 * sur un espace (tenantId, spaceId) isolé.
 */
export function executeDeterministicRun(
  ctx: TenantSpaceContext,
  options: TriggerRunOptions
): { run: DataRun; anomaliesCount: number } {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();

  const run: DataRun = guardianRepo.createRun(ctx, {
    id: runId,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    sourceId: options.sourceId,
    trigger: options.trigger,
    status: "running",
    startedAt,
    recordsIngested: options.recordsIngested ?? 0,
    recordsSkippedIdempotent: options.recordsSkippedIdempotent ?? 0,
    recordsProcessed: 0,
    duplicatesFound: 0,
    anomaliesBySeverity: {
      bloquante: 0,
      a_verifier: 0,
      mineure: 0,
    },
    autoActionsCount: 0,
    pendingValidationsCount: 0,
    tokensUsed: 0,
    estimatedCostUsd: 0,
  });

  try {
    const { config: rules } = guardianRepo.getProjectRules(ctx);
    const activeRecords = guardianRepo.listNormalizedRecords(ctx, {
      includeArchived: false,
    });

    const { anomalies, duplicatesCount } = runDeterministicControls({
      ctx,
      runId,
      records: activeRecords,
      rules,
    });

    guardianRepo.replaceOpenAnomalies(ctx, anomalies);

    const bySeverity: Record<AnomalySeverity, number> = {
      bloquante: 0,
      a_verifier: 0,
      mineure: 0,
    };
    for (const a of anomalies) {
      bySeverity[a.severity] += 1;
    }

    const finishedAt = new Date().toISOString();
    guardianRepo.updateRun(ctx, runId, {
      status: anomalies.length > 0 ? "awaiting_validation" : "completed",
      finishedAt,
      recordsProcessed: activeRecords.length,
      duplicatesFound: duplicatesCount,
      anomaliesBySeverity: bySeverity,
      summaryText:
        anomalies.length === 0
          ? `Contrôle déterministe terminé sur ${activeRecords.length} enregistrements : aucune anomalie détectée.`
          : `Contrôle déterministe sur ${activeRecords.length} enregistrements : ${anomalies.length} anomalie(s) (${bySeverity.bloquante} bloquante(s), ${bySeverity.a_verifier} à vérifier, ${bySeverity.mineure} mineure(s)).`,
    });

    mockDb.broadcastEvent({
      type: "guardian_run",
      documentId: runId,
      percent: 100,
      message: `Run ${runId} (${options.trigger}) : ${anomalies.length} anomalie(s) détectée(s)`,
    });

    return { run, anomaliesCount: anomalies.length };
  } catch (error) {
    guardianRepo.updateRun(ctx, runId, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      summaryText: error instanceof Error ? error.message : "Erreur lors du contrôle déterministe",
    });
    throw error;
  }
}
