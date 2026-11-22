import { FunctionDeclaration, Type } from "@google/genai";
import { z } from "zod";
import { executeReversibleArchive, executeReversibleMerge } from "./actionsService";
import { dispatchRunSummaryNotification } from "./notifier";
import { RunPseudonymizer } from "./pseudonymizer";
import { guardianRepo } from "./repository";
import type { ProjectRulesConfig } from "./rulesConfig";
import { computeRecordSimilarity } from "./similarity";
import type { TenantSpaceContext } from "./types";

/**
 * Schémas Zod validant les entrées de chaque outil appelé par l'agent LLM.
 * Aucun identifiant tenantId / spaceId n'est exposé : ils sont injectés côté serveur.
 */
export const ToolArgSchemas = {
  list_anomalies: z.object({
    severity: z.enum(["bloquante", "a_verifier", "mineure"]).optional(),
    onlyOpen: z.boolean().default(true),
  }),
  find_similar: z.object({
    recordId: z.string().min(1),
    minScore: z.number().min(0).max(1).default(0.7),
  }),
  compare_records: z.object({
    recordIdA: z.string().min(1),
    recordIdB: z.string().min(1),
  }),
  propose_merge: z.object({
    primaryRecordId: z.string().min(1),
    secondaryRecordId: z.string().min(1),
    anomalyId: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(3),
  }),
  archive_record: z.object({
    recordId: z.string().min(1),
    anomalyId: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(3),
  }),
  request_validation: z.object({
    actionType: z.enum(["merge", "archive", "review_batch"]),
    title: z.string().min(3),
    description: z.string().min(3),
    primaryRecordId: z.string().min(1),
    secondaryRecordId: z.string().optional(),
    anomalyId: z.string().optional(),
    confidence: z.number().min(0).max(1),
  }),
  write_summary: z.object({
    summaryText: z.string().min(5),
    overallConfidence: z.number().min(0).max(1),
    needsHumanReview: z.boolean().default(false),
  }),
};

/**
 * Déclarations des 7 outils exposés au modèle Gemini via Function Calling.
 */
export const GUARDIAN_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_anomalies",
    description: "Liste les anomalies détectées dans l'espace courant (données pseudonymisées).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        severity: {
          type: Type.STRING,
          description: "Filtre optionnel : bloquante, a_verifier ou mineure",
        },
        onlyOpen: {
          type: Type.BOOLEAN,
          description: "Si true, ne retourne que les anomalies ouvertes",
        },
      },
    },
  },
  {
    name: "find_similar",
    description: "Recherche les enregistrements similaires à un recordId dans l'espace courant.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recordId: { type: Type.STRING, description: "Identifiant de l'enregistrement cible" },
        minScore: { type: Type.NUMBER, description: "Score minimal de similarité (0 à 1)" },
      },
      required: ["recordId"],
    },
  },
  {
    name: "compare_records",
    description: "Compare deux enregistrements (pseudonymisés) et fournit le score de similarité.",
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
    description:
      "Fusionne deux doublons de manière réversible si le score dépasse le seuil automatique, sinon envoie vers la validation humaine.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        primaryRecordId: { type: Type.STRING },
        secondaryRecordId: { type: Type.STRING },
        anomalyId: { type: Type.STRING },
        confidence: { type: Type.NUMBER, description: "Confiance de l'agent entre 0 et 1" },
        reason: { type: Type.STRING },
      },
      required: ["primaryRecordId", "secondaryRecordId", "confidence", "reason"],
    },
  },
  {
    name: "archive_record",
    description:
      "Archive un enregistrement irrémédiablement erroné ou doublon sans jamais le supprimer physiquement.",
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
    description: "Place une décision ambiguë dans la file d'attente de validation humaine.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        actionType: { type: Type.STRING, description: "merge | archive | review_batch" },
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
    description: "Rédige et diffuse le résumé final de fin de run (UI + Telegram/SMTP si configurés).",
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

/**
 * Construit le runtime d'outils strictement lié au contexte serveur (ctx, runId).
 * Aucun paramètre de tool call ne peut contourner le filtre (tenantId, spaceId).
 */
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
        throw new Error(
          `Garde-fou atteint : limite de ${rules.guardrails.maxActionsPerRun} actions par run dépassée.`
        );
      }
      runtime.totalActionsExecuted += 1;

      const { autoMergeThreshold, reviewThreshold } = rules.duplicateDetection.nearDuplicate;
      const minConfidence = rules.guardrails.minAgentConfidence;

      switch (name) {
        case "list_anomalies": {
          const args = ToolArgSchemas.list_anomalies.parse(rawArgs || {});
          const items = guardianRepo.listAnomalies(ctx, {
            severity: args.severity,
            status: args.onlyOpen ? "open" : undefined,
          });
          const output = {
            count: items.length,
            anomalies: items.slice(0, 30).map((a) => pseudonymizer.maskAnomaly(a)),
          };
          guardianRepo.addAgentAction(ctx, {
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
          return output;
        }

        case "find_similar": {
          const args = ToolArgSchemas.find_similar.parse(rawArgs || {});
          const target = guardianRepo.getNormalizedRecord(ctx, args.recordId);
          if (!target) return { error: "Enregistrement introuvable dans cet espace" };

          const allActive = guardianRepo.listNormalizedRecords(ctx, { includeArchived: false });
          const matches = allActive
            .filter((r) => r.id !== target.id)
            .map((r) => ({
              record: pseudonymizer.maskRecord(r),
              ...computeRecordSimilarity(target, r),
            }))
            .filter((m) => m.score >= args.minScore)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

          guardianRepo.addAgentAction(ctx, {
            id: `act-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            timestamp: new Date().toISOString(),
            toolName: "find_similar",
            inputs: args,
            output: { matchesCount: matches.length },
            decision: `Recherche de similarité pour ${target.externalId} (${matches.length} candidat(s))`,
            confidence: 1,
            author: "agent",
            reversible: false,
            reverted: false,
          });
          return { target: pseudonymizer.maskRecord(target), matches };
        }

        case "compare_records": {
          const args = ToolArgSchemas.compare_records.parse(rawArgs || {});
          const recA = guardianRepo.getNormalizedRecord(ctx, args.recordIdA);
          const recB = guardianRepo.getNormalizedRecord(ctx, args.recordIdB);
          if (!recA || !recB) {
            return { error: "Un des enregistrements est introuvable dans cet espace." };
          }

          const sim = computeRecordSimilarity(recA, recB);
          const band =
            sim.score >= autoMergeThreshold
              ? "auto_merge"
              : sim.score >= reviewThreshold
                ? "human_validation"
                : "ignore";

          const output = {
            recordA: pseudonymizer.maskRecord(recA),
            recordB: pseudonymizer.maskRecord(recB),
            similarityScore: sim.score,
            reason: sim.reason,
            recommendedBand: band,
            thresholds: { autoMergeThreshold, reviewThreshold },
          };

          guardianRepo.addAgentAction(ctx, {
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
          return output;
        }

        case "propose_merge": {
          const args = ToolArgSchemas.propose_merge.parse(rawArgs || {});
          const primary = guardianRepo.getNormalizedRecord(ctx, args.primaryRecordId);
          const secondary = guardianRepo.getNormalizedRecord(ctx, args.secondaryRecordId);
          if (!primary || !secondary) {
            return { status: "error", message: "Enregistrement introuvable dans cet espace." };
          }
          if (primary.status !== "active" || secondary.status !== "active") {
            return { status: "skipped", message: "L'un des enregistrements n'est plus actif." };
          }

          const { score, reason } = computeRecordSimilarity(primary, secondary);
          const effectiveConfidence = Math.min(args.confidence, score);

          // Zone inférieure au seuil de revue -> ignorée
          if (score < reviewThreshold) {
            if (args.anomalyId) {
              guardianRepo.updateAnomaly(ctx, args.anomalyId, { status: "ignored" });
            }
            return {
              status: "ignored",
              similarityScore: score,
              message: `Score (${score}) sous le seuil minimal (${reviewThreshold}) : fusion ignorée.`,
            };
          }

          // Zone très élevée ET confiance suffisante -> fusion automatique réversible
          if (score >= autoMergeThreshold && effectiveConfidence >= minConfidence) {
            const res = executeReversibleMerge({
              ctx,
              runId,
              primaryRecordId: primary.id,
              secondaryRecordId: secondary.id,
              anomalyId: args.anomalyId,
              confidence: effectiveConfidence,
              author: "agent",
              reason: `${args.reason} (${reason}, score=${score})`,
            });
            runtime.autoActionsCount += 1;
            return {
              status: "auto_merged",
              actionId: res.action.id,
              similarityScore: score,
              reversible: true,
            };
          }

          // Zone intermédiaire ou confiance basse -> file de validation humaine obligatoire
          const valItem = guardianRepo.addValidationItem(ctx, {
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
            confidence: effectiveConfidence,
            proposedPayload: { similarityScore: score },
            status: "pending",
            createdAt: new Date().toISOString(),
          });

          if (args.anomalyId) {
            guardianRepo.updateAnomaly(ctx, args.anomalyId, { status: "pending_validation" });
          }
          runtime.pendingValidationsCount += 1;

          guardianRepo.addAgentAction(ctx, {
            id: `act-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            timestamp: new Date().toISOString(),
            toolName: "request_validation",
            inputs: args,
            output: { validationId: valItem.id, similarityScore: score },
            decision: `Redirection vers validation humaine (zone intermédiaire, score=${score})`,
            confidence: effectiveConfidence,
            author: "agent",
            reversible: false,
            reverted: false,
          });

          return {
            status: "pending_validation",
            validationId: valItem.id,
            similarityScore: score,
          };
        }

        case "archive_record": {
          const args = ToolArgSchemas.archive_record.parse(rawArgs || {});
          const rec = guardianRepo.getNormalizedRecord(ctx, args.recordId);
          if (!rec || rec.status !== "active") {
            return { status: "skipped", message: "Enregistrement introuvable ou déjà archivé." };
          }

          if (args.confidence < minConfidence) {
            return runtime.executeTool("request_validation", {
              actionType: "archive",
              title: `Archivage à confirmer : ${rec.externalId}`,
              description: `${args.reason} (confiance ${Math.round(args.confidence * 100)}% < seuil ${Math.round(minConfidence * 100)}%).`,
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
          return {
            status: "archived",
            actionId: res.action.id,
            reversible: true,
          };
        }

        case "request_validation": {
          const args = ToolArgSchemas.request_validation.parse(rawArgs || {});
          const valItem = guardianRepo.addValidationItem(ctx, {
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
            guardianRepo.updateAnomaly(ctx, args.anomalyId, { status: "pending_validation" });
          }
          runtime.pendingValidationsCount += 1;

          guardianRepo.addAgentAction(ctx, {
            id: `act-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            timestamp: new Date().toISOString(),
            toolName: "request_validation",
            inputs: args,
            output: { validationId: valItem.id },
            decision: `Demande de validation humaine : ${args.title}`,
            confidence: args.confidence,
            author: "agent",
            reversible: false,
            reverted: false,
          });

          return { status: "pending_validation", validationId: valItem.id };
        }

        case "write_summary": {
          const args = ToolArgSchemas.write_summary.parse(rawArgs || {});
          runtime.summaryWritten = args.summaryText;

          const notif = await dispatchRunSummaryNotification(ctx, runId, args.summaryText);
          runtime.notificationChannels = notif.channels;

          guardianRepo.addAgentAction(ctx, {
            id: `act-${Date.now()}-${runtime.totalActionsExecuted}`,
            tenantId: ctx.tenantId,
            spaceId: ctx.spaceId,
            runId,
            timestamp: new Date().toISOString(),
            toolName: "write_summary",
            inputs: args,
            output: { channels: notif.channels, telegramSent: notif.telegramSent, emailSent: notif.emailSent },
            decision: "Résumé de fin de run rédigé et diffusé",
            confidence: args.overallConfidence,
            author: "agent",
            reversible: false,
            reverted: false,
          });

          return {
            status: "summary_written",
            channels: notif.channels,
          };
        }

        default:
          throw new Error(`Outil inconnu : ${name}`);
      }
    },
  };

  return runtime;
}
