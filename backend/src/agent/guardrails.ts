import type { Anomaly, NormalizedRecord, TenantSpaceContext } from "../connectors/types";
import { journalRepo, saveQuarantineSnapshot } from "../journal";
import { dispatchRunSummaryNotification } from "../notify/index";
import type { ProjectRulesConfig } from "../rules/engine";

/**
 * Garde-fou 1 : détecte un volume anormal d'anomalies et stoppe toute action automatique.
 */
export async function checkAbnormalAnomalyVolumeGuardrail(params: {
  ctx: TenantSpaceContext;
  runId: string;
  activeRecords: NormalizedRecord[];
  openAnomalies: Anomaly[];
  rules: ProjectRulesConfig;
  startedMs?: number;
}) {
  const { ctx, runId, activeRecords, openAnomalies, rules, startedMs } = params;
  const ratio = activeRecords.length > 0 ? openAnomalies.length / activeRecords.length : 0;

  if (activeRecords.length >= 5 && ratio > rules.guardrails.maxAbnormalAnomalyRatio) {
    const firstRecId = openAnomalies[0]?.recordId || activeRecords[0]?.id || "none";
    const summaryText = `Arrêt préventif (garde-fou) : volume anormal d'anomalies (${openAnomalies.length} sur ${activeRecords.length}, ratio ${(ratio * 100).toFixed(0)}% > ${(rules.guardrails.maxAbnormalAnomalyRatio * 100).toFixed(0)}%).`;

    journalRepo.addValidationItem(ctx, {
      id: `val-guard-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId,
      actionType: "review_batch",
      title: `Alerte volume anormal (${openAnomalies.length} anomalies)`,
      description: summaryText,
      primaryRecordId: firstRecId,
      confidence: 0.4,
      proposedPayload: { ratio, openCount: openAnomalies.length },
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    journalRepo.addAgentAction(ctx, {
      id: `act-guard-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId,
      timestamp: new Date().toISOString(),
      toolName: "guardrail_abnormal_volume",
      inputs: { ratio, threshold: rules.guardrails.maxAbnormalAnomalyRatio },
      output: { aborted: true },
      decision: summaryText,
      confidence: 0.4,
      author: "agent",
      reversible: false,
      reverted: false,
    });

    saveQuarantineSnapshot(ctx, runId, { reason: "guardrail_abnormal_volume", ratio });
    const notif = await dispatchRunSummaryNotification(ctx, runId, summaryText);
    const updated = journalRepo.updateRun(ctx, runId, {
      status: "aborted_guardrail",
      finishedAt: new Date().toISOString(),
      durationMs: startedMs ? Date.now() - startedMs : 0,
      llmCallsCount: 0,
      llmProvider: "deterministic",
      llmModel: "guardrail-v1",
      pendingValidationsCount: 1,
      summaryText,
      notificationChannels: notif.channels,
    })!;

    return { aborted: true as const, run: updated, summaryText };
  }

  return { aborted: false as const };
}

export function classifySimilarityBand(
  score: number,
  autoMergeThreshold: number,
  reviewThreshold: number
): "auto_merge" | "human_validation" | "ignore" {
  if (score >= autoMergeThreshold) return "auto_merge";
  if (score >= reviewThreshold) return "human_validation";
  return "ignore";
}
