import { FunctionDeclaration, Type } from "@google/genai";
import type { TenantSpaceContext } from "../connectors/types";
import { executeReversibleArchive, executeReversibleMerge, journalRepo } from "../journal";
import { dispatchRunSummaryNotification } from "../notify/index";
import { computeRecordSimilarity } from "../rules/dedupe";
import type { ProjectRulesConfig } from "../rules/engine";
import { classifySimilarityBand } from "./guardrails";
import { RunPseudonymizer } from "./pseudonymize";
import { ToolArgSchemas } from "./schemas";

export const GUARDIAN_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_anomalies",
    description: "Liste les anomalies détectées dans l'espace courant (données pseudonymisées).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        severity: { type: Type.STRING },
        onlyOpen: { type: Type.BOOLEAN },
      },
    },
  },
  {
    name: "find_similar",
    description: "Recherche les enregistrements similaires dans l'espace courant.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recordId: { type: Type.STRING },
        minScore: { type: Type.NUMBER },
      },
      required: ["recordId"],
    },
  },
  {
    name: "compare_records",
    description: "Compare deux enregistrements pseudonymisés.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recordIdA: { type: Type.STRING },
        recordIdB: { type: Type.STRING },
      },
      required: ["recordIdA", "recordIdB"],
    },
  },
  {
    name: "propose_merge",
    description: "Fusionne de manière réversible ou envoie vers la validation humaine selon les seuils.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        primaryRecordId: { type: Type.STRING },
        secondaryRecordId: { type: Type.STRING },
        anomalyId: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
        reason: { type: Type.STRING },
      },
      required: ["primaryRecordId", "secondaryRecordId", "confidence", "reason"],
    },
  },
  {
    name: "archive_record",
    description: "Archive un enregistrement sans jamais le supprimer physiquement.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recordId: { type: Type.STRING },
        anomalyId: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
        reason: { type: Type.STRING },
      },
      required: ["recordId", "confidence", "reason"],
    },
  },
  {
    name: "request_validation",
    description: "Ajoute un cas ambigu (ou écart GPS/zone d'intervention) en file de validation humaine.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        actionType: { type: Type.STRING },
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        primaryRecordId: { type: Type.STRING },
        secondaryRecordId: { type: Type.STRING },
        anomalyId: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
      },
      required: ["actionType", "title", "description", "primaryRecordId", "confidence"],
    },
  },
  {
    name: "write_summary",
    description: "Rédige et diffuse le résumé final du run.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summaryText: { type: Type.STRING },
        overallConfidence: { type: Type.NUMBER },
        needsHumanReview: { type: Type.BOOLEAN },
      },
      required: ["summaryText", "overallConfidence"],
    },
  },
];

export interface ScopedToolRuntime {
  autoActionsCount: number;
  pendingValidationsCount: number;
  totalActionsExecuted: number;
  summaryWritten: string | null;
  notificationChannels: string[];
  executeTool: (name: string, rawArgs: unknown) => Promise<Record<string, unknown>>;
}

export function createScopedToolRuntime(params: {
  ctx: TenantSpaceContext;
  runId: string;
  rules: ProjectRulesConfig;
  pseudonymizer: RunPseudonymizer;
}): ScopedToolRuntime {
  const { ctx, runId, rules, pseudonymizer } = params;

  const runtime: ScopedToolRuntime = {
    autoActionsCount: 0,
    pendingValidationsCount: 0,
    totalActionsExecuted: 0,
    summaryWritten: null,
    notificationChannels: [],

    async executeTool(name: string, rawArgs: unknown): Promise<Record<string, unknown>> {
      if (runtime.totalActionsExecuted >= rules.guardrails.maxActionsPerRun) {
        throw new Error(`Limite de ${rules.guardrails.maxActionsPerRun} actions par run dépassée.`);
      }
      runtime.totalActionsExecuted += 1;

      const { autoMergeThreshold, reviewThreshold } = rules.duplicateDetection.nearDuplicate;
      const minConfidence = rules.guardrails.minAgentConfidence;

      switch (name) {
        case "list_anomalies": {
          const args = ToolArgSchemas.list_anomalies.parse(rawArgs || {});
          const items = journalRepo.listAnomalies(ctx, {
            severity: args.severity,
            status: args.onlyOpen ? "open" : undefined,
          });
          journalRepo.addAgentAction(ctx, {
            id: `act-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            timestamp: new Date().toISOString(),
            toolName: "list_anomalies",
            inputs: args,
            output: { count: items.length },
            decision: `Consultation de ${items.length} anomalie(s)`,
            confidence: 1,
            author: "agent",
            reversible: false,
            reverted: false,
          });
          return {
            count: items.length,
            anomalies: items.slice(0, 30).map((a) => pseudonymizer.maskAnomaly(a)),
          };
        }

        case "find_similar": {
          const args = ToolArgSchemas.find_similar.parse(rawArgs || {});
          const target = journalRepo.getNormalizedRecord(ctx, args.recordId);
          if (!target) return { error: "Enregistrement introuvable." };
          const matches = journalRepo
            .listNormalizedRecords(ctx, { includeArchived: false })
            .filter((r) => r.id !== target.id)
            .map((r) => ({ record: pseudonymizer.maskRecord(r), ...computeRecordSimilarity(target, r) }))
            .filter((m) => m.score >= args.minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
          return { target: pseudonymizer.maskRecord(target), matches };
        }

        case "compare_records": {
          const args = ToolArgSchemas.compare_records.parse(rawArgs || {});
          const recA = journalRepo.getNormalizedRecord(ctx, args.recordIdA);
          const recB = journalRepo.getNormalizedRecord(ctx, args.recordIdB);
          if (!recA || !recB) return { error: "Enregistrement introuvable." };
          const sim = computeRecordSimilarity(recA, recB);
          const band = classifySimilarityBand(sim.score, autoMergeThreshold, reviewThreshold);
          journalRepo.addAgentAction(ctx, {
            id: `act-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            timestamp: new Date().toISOString(),
            toolName: "compare_records",
            inputs: args,
            output: { similarityScore: sim.score, recommendedBand: band },
            decision: `Comparaison ${recA.externalId} vs ${recB.externalId} : score=${sim.score} (${band})`,
            confidence: sim.score,
            author: "agent",
            reversible: false,
            reverted: false,
          });
          return {
            recordA: pseudonymizer.maskRecord(recA),
            recordB: pseudonymizer.maskRecord(recB),
            similarityScore: sim.score,
            reason: sim.reason,
            recommendedBand: band,
          };
        }

        case "propose_merge": {
          const args = ToolArgSchemas.propose_merge.parse(rawArgs || {});
          const primary = journalRepo.getNormalizedRecord(ctx, args.primaryRecordId);
          const secondary = journalRepo.getNormalizedRecord(ctx, args.secondaryRecordId);
          if (!primary || !secondary) return { status: "error" };
          if (primary.status !== "active" || secondary.status !== "active") {
            return { status: "skipped" };
          }
          const { score, reason } = computeRecordSimilarity(primary, secondary);
          const effConf = Math.min(args.confidence, score);
          const band = classifySimilarityBand(score, autoMergeThreshold, reviewThreshold);

          if (band === "ignore") {
            if (args.anomalyId) journalRepo.updateAnomaly(ctx, args.anomalyId, { status: "ignored" });
            return { status: "ignored", similarityScore: score };
          }

          if (band === "auto_merge" && effConf >= minConfidence) {
            const res = executeReversibleMerge({
              ctx,
              runId,
              primaryRecordId: primary.id,
              secondaryRecordId: secondary.id,
              anomalyId: args.anomalyId,
              confidence: effConf,
              author: "agent",
              reason: `${args.reason} (${reason}, score=${score})`,
            });
            runtime.autoActionsCount += 1;
            return { status: "auto_merged", actionId: res.action.id, similarityScore: score };
          }

          const val = journalRepo.addValidationItem(ctx, {
            id: `val-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            anomalyId: args.anomalyId,
            actionType: "merge",
            title: `Fusion proposée : ${secondary.externalId} -> ${primary.externalId}`,
            description: `${args.reason} — Similarité ${Math.round(score * 100)}% (${reason}).`,
            primaryRecordId: primary.id,
            secondaryRecordId: secondary.id,
            confidence: effConf,
            proposedPayload: { similarityScore: score },
            status: "pending",
            createdAt: new Date().toISOString(),
          });
          if (args.anomalyId) {
            journalRepo.updateAnomaly(ctx, args.anomalyId, { status: "pending_validation" });
          }
          runtime.pendingValidationsCount += 1;
          return { status: "pending_validation", validationId: val.id, similarityScore: score };
        }

        case "archive_record": {
          const args = ToolArgSchemas.archive_record.parse(rawArgs || {});
          const rec = journalRepo.getNormalizedRecord(ctx, args.recordId);
          if (!rec || rec.status !== "active") return { status: "skipped" };
          if (args.confidence < minConfidence) {
            return runtime.executeTool("request_validation", {
              actionType: "archive",
              title: `Archivage à confirmer : ${rec.externalId}`,
              description: args.reason,
              primaryRecordId: rec.id,
              anomalyId: args.anomalyId,
              confidence: args.confidence,
            });
          }
          const res = executeReversibleArchive({
            ctx,
            runId,
            recordId: rec.id,
            anomalyId: args.anomalyId,
            confidence: args.confidence,
            author: "agent",
            reason: args.reason,
          });
          runtime.autoActionsCount += 1;
          return { status: "archived", actionId: res.action.id };
        }

        case "request_validation": {
          const args = ToolArgSchemas.request_validation.parse(rawArgs || {});
          const val = journalRepo.addValidationItem(ctx, {
            id: `val-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            anomalyId: args.anomalyId,
            actionType: args.actionType,
            title: args.title,
            description: args.description,
            primaryRecordId: args.primaryRecordId,
            secondaryRecordId: args.secondaryRecordId,
            confidence: args.confidence,
            proposedPayload: {},
            status: "pending",
            createdAt: new Date().toISOString(),
          });
          if (args.anomalyId) {
            journalRepo.updateAnomaly(ctx, args.anomalyId, { status: "pending_validation" });
          }
          runtime.pendingValidationsCount += 1;
          return { status: "pending_validation", validationId: val.id };
        }

        case "write_summary": {
          const args = ToolArgSchemas.write_summary.parse(rawArgs || {});
          runtime.summaryWritten = args.summaryText;
          const notif = await dispatchRunSummaryNotification(ctx, runId, args.summaryText);
          runtime.notificationChannels = notif.channels;
          return { status: "summary_written", channels: notif.channels };
        }

        default:
          throw new Error(`Outil inconnu : ${name}`);
      }
    },
  };

  return runtime;
}
