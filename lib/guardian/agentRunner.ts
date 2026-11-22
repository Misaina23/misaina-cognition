import { Content, GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import {
  createScopedToolRuntime,
  GUARDIAN_TOOL_DECLARATIONS,
  type ScopedToolRuntime,
} from "./agentTools";
import { dispatchRunSummaryNotification } from "./notifier";
import { RunPseudonymizer } from "./pseudonymizer";
import { guardianRepo } from "./repository";
import type { ProjectRulesConfig } from "./rulesConfig";
import { executeDeterministicRun } from "./triggers";
import { saveQuarantineSnapshot } from "./diskStorage";
import type { Anomaly, DataRun, TenantSpaceContext } from "./types";

/**
 * Schéma Zod validant la décision structurée finale de l'agent LLM.
 */
export const AgentVerdictSchema = z.object({
  decision: z.enum(["completed", "awaiting_validation", "aborted_low_confidence"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(5),
  actionsTaken: z.array(z.string()).default([]),
});

export type AgentVerdict = z.infer<typeof AgentVerdictSchema>;

export interface GuardianAgentResult {
  run: DataRun;
  verdict: AgentVerdict;
  usedGemini: boolean;
}

/**
 * Lance le pipeline complet « Gardien de données » :
 * 1. Contrôle déterministe (si non déjà exécuté)
 * 2. Garde-fou volume anormal d'anomalies
 * 3. Agent autonome Gemini (ou planificateur local déterministe sans clé API) appelant les outils
 * 4. Notifications fin de run (UI/journal -> Telegram -> SMTP)
 */
export async function runGuardianAgent(
  ctx: TenantSpaceContext,
  options?: { sourceId?: string; trigger?: DataRun["trigger"]; existingRunId?: string }
): Promise<GuardianAgentResult> {
  const { config: rules } = guardianRepo.getProjectRules(ctx);
  const sources = guardianRepo.listSources(ctx);
  const sourceId = options?.sourceId || sources[0]?.id || "agent-run";

  let runId = options?.existingRunId;
  if (!runId) {
    const det = executeDeterministicRun(ctx, {
      sourceId,
      trigger: options?.trigger ?? "manual",
    });
    runId = det.run.id;
  }

  const run = guardianRepo.listRuns(ctx).find((r) => r.id === runId);
  if (!run) {
    throw new Error(`Run ${runId} introuvable dans cet espace.`);
  }

  const activeRecords = guardianRepo.listNormalizedRecords(ctx, { includeArchived: false });
  const openAnomalies = guardianRepo.listAnomalies(ctx, { status: "open" });

  // Garde-fou 1 : volume anormal d'anomalies -> arrêt immédiat & demande de validation humaine
  const anomalyRatio =
    activeRecords.length > 0 ? openAnomalies.length / activeRecords.length : 0;

  if (
    activeRecords.length >= 5 &&
    anomalyRatio > rules.guardrails.maxAbnormalAnomalyRatio
  ) {
    const firstRecId = openAnomalies[0]?.recordId || activeRecords[0]?.id || "none";
    const summaryText = `Arrêt préventif (garde-fou) : volume anormal d'anomalies (${openAnomalies.length} anomalies sur ${activeRecords.length} enregistrements, ratio ${(anomalyRatio * 100).toFixed(0)}% > seuil ${(rules.guardrails.maxAbnormalAnomalyRatio * 100).toFixed(0)}%). Aucune action automatique exécutée ; validation humaine requise.`;

    guardianRepo.addValidationItem(ctx, {
      id: `val-guard-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId,
      actionType: "review_batch",
      title: `Alerte volume anormal (${openAnomalies.length} anomalies)`,
      description: summaryText,
      primaryRecordId: firstRecId,
      confidence: 0.4,
      proposedPayload: { anomalyRatio, openCount: openAnomalies.length },
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    guardianRepo.addAgentAction(ctx, {
      id: `act-guard-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId,
      timestamp: new Date().toISOString(),
      toolName: "guardrail_abnormal_volume",
      inputs: { anomalyRatio, threshold: rules.guardrails.maxAbnormalAnomalyRatio },
      output: { aborted: true },
      decision: summaryText,
      confidence: 0.4,
      author: "agent",
      reversible: false,
      reverted: false,
    });

    const notif = await dispatchRunSummaryNotification(ctx, runId, summaryText);
    saveQuarantineSnapshot(ctx, runId, {
      reason: "guardrail_abnormal_volume",
      anomalyRatio,
      threshold: rules.guardrails.maxAbnormalAnomalyRatio,
      openAnomaliesCount: openAnomalies.length,
      createdAt: new Date().toISOString(),
    });
    const updated = guardianRepo.updateRun(ctx, runId, {
      status: "aborted_guardrail",
      finishedAt: new Date().toISOString(),
      pendingValidationsCount: 1,
      summaryText,
      notificationChannels: notif.channels,
    })!;

    return {
      run: updated,
      verdict: {
        decision: "aborted_low_confidence",
        confidence: 0.4,
        summary: summaryText,
        actionsTaken: ["guardrail_abnormal_volume"],
      },
      usedGemini: false,
    };
  }

  // Cas nominal propre : 0 anomalie ouverte
  if (openAnomalies.length === 0) {
    const cleanSummary = `Run ${runId} terminé sur ${activeRecords.length} enregistrements : aucune anomalie ouverte détectée.`;
    const notif = await dispatchRunSummaryNotification(ctx, runId, cleanSummary);
    const updated = guardianRepo.updateRun(ctx, runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      summaryText: cleanSummary,
      notificationChannels: notif.channels,
    })!;

    return {
      run: updated,
      verdict: {
        decision: "completed",
        confidence: 1,
        summary: cleanSummary,
        actionsTaken: [],
      },
      usedGemini: false,
    };
  }

  // Cas avec anomalies : exécution de l'agent LLM (ou fallback autonome) via les outils
  const pseudonymizer = new RunPseudonymizer();
  const runtime = createScopedToolRuntime({ ctx, runId, rules, pseudonymizer });

  let verdict: AgentVerdict | null = null;
  let usedGemini = false;
  let tokensUsed = 0;

  if (process.env.GEMINI_API_KEY) {
    try {
      const llmRun = await runGeminiToolLoop({
        runId,
        rules,
        runtime,
        openCount: openAnomalies.length,
        recordsCount: activeRecords.length,
      });
      verdict = llmRun.verdict;
      tokensUsed = llmRun.tokensUsed;
      usedGemini = true;
    } catch (err) {
      console.warn("Fallback autonome du Gardien (Gemini indisponible):", err);
    }
  }

  if (!verdict) {
    verdict = await runDeterministicAgentFallback({
      openAnomalies,
      runtime,
      rules,
      recordsCount: activeRecords.length,
    });
  }

  // Garde-fou 2 : confiance globale basse -> enregistre une demande de revue humaine
  if (verdict.confidence < rules.guardrails.minAgentConfidence) {
    await runtime.executeTool("request_validation", {
      actionType: "review_batch",
      title: "Confiance agent insuffisante — Validation humaine requise",
      description: verdict.summary,
      primaryRecordId: openAnomalies[0].recordId,
      confidence: verdict.confidence,
    });
    verdict.decision = "awaiting_validation";
  }

  if (!runtime.summaryWritten) {
    await runtime.executeTool("write_summary", {
      summaryText: verdict.summary,
      overallConfidence: verdict.confidence,
      needsHumanReview: runtime.pendingValidationsCount > 0,
    });
  }

  const estimatedCostUsd = Number(((tokensUsed / 1_000_000) * 0.15).toFixed(6));
  const finalStatus: DataRun["status"] =
    runtime.pendingValidationsCount > 0 || verdict.decision !== "completed"
      ? "awaiting_validation"
      : "completed";

  const blockingAnomalies = openAnomalies.filter((a) => a.severity === "bloquante");
  if (blockingAnomalies.length > 0) {
    saveQuarantineSnapshot(ctx, runId, {
      reason: "blocking_anomalies",
      count: blockingAnomalies.length,
      anomalies: blockingAnomalies.map((a) => ({
        id: a.id,
        recordId: a.recordId,
        category: a.category,
        ruleId: a.ruleId,
      })),
      createdAt: new Date().toISOString(),
    });
  }

  const updatedRun = guardianRepo.updateRun(ctx, runId, {
    status: finalStatus,
    finishedAt: new Date().toISOString(),
    autoActionsCount: runtime.autoActionsCount,
    pendingValidationsCount: runtime.pendingValidationsCount,
    tokensUsed,
    estimatedCostUsd,
    summaryText: runtime.summaryWritten || verdict.summary,
    notificationChannels: runtime.notificationChannels,
  })!;

  return { run: updatedRun, verdict, usedGemini };
}

/**
 * Boucle Tool Use multi-tours avec @google/genai.
 * L'agent choisit librement l'ordre des outils dans les limites de tokens et d'actions.
 */
async function runGeminiToolLoop(params: {
  runId: string;
  rules: ProjectRulesConfig;
  runtime: ScopedToolRuntime;
  openCount: number;
  recordsCount: number;
}): Promise<{ verdict: AgentVerdict; tokensUsed: number }> {
  const { runId, rules, runtime, openCount, recordsCount } = params;

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const systemInstruction = `Vous êtes l'agent autonome « Gardien de données » de Misaina Cognition.
Règles strictes :
- Vous n'avez accès qu'aux outils fournis ; toutes les données PII sont pseudonymisées.
- Décidez seul de l'ordre d'appel des outils (commencez généralement par list_anomalies, compare_records pour les doublons/quasi-doublons).
- Ne supprimez jamais : utilisez propose_merge (score >= ${rules.duplicateDetection.nearDuplicate.autoMergeThreshold} en auto, sinon validation humaine) ou request_validation pour les cas ambigus (outliers, coordonnées GPS hors zone d'intervention ou incohérentes avec la zone déclarée, champs vides bloquants).
- Terminez par write_summary en français clair (ce qui a été fait automatiquement vs ce qui attend validation).
- Respectez le budget maximal : ${rules.guardrails.maxActionsPerRun} actions et ${rules.guardrails.maxTokensPerRun} tokens.
- À la fin, répondez UNIQUEMENT en JSON conforme au schéma demandé.`;

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: `Run ${runId} démarré sur ${recordsCount} enregistrements actifs (${openCount} anomalie(s) détectée(s) par le moteur déterministe). Analysez les anomalies ambiguës, exécutez les actions sûres, demandez validation humaine si nécessaire et rédigez le résumé final.`,
        },
      ],
    },
  ];

  let totalTokens = 0;
  const maxTurns = 10;

  for (let turn = 0; turn < maxTurns; turn++) {
    if (totalTokens >= rules.guardrails.maxTokensPerRun) {
      throw new Error("Limite de tokens par run atteinte.");
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: GUARDIAN_TOOL_DECLARATIONS }],
      },
    });

    totalTokens += response.usageMetadata?.totalTokenCount ?? 450;

    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      contents.push(modelContent);
    }

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const responseParts = [];
      for (const call of functionCalls) {
        let toolResult: Record<string, unknown>;
        try {
          toolResult = await runtime.executeTool(call.name || "", call.args);
        } catch (err) {
          toolResult = {
            error: err instanceof Error ? err.message : "Erreur exécution outil",
          };
        }
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name || "",
            response: toolResult,
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    // L'agent a fini d'appeler les outils : demande une sortie JSON finale validée par schéma
    break;
  }

  // Demande finale structurée (JSON validé par Zod)
  const finalResp = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: [
      ...contents,
      {
        role: "user",
        parts: [
          {
            text: "Produisez le verdict final en JSON strict : decision, confidence, summary, actionsTaken.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: {
            type: Type.STRING,
            description: "completed | awaiting_validation | aborted_low_confidence",
          },
          confidence: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          actionsTaken: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["decision", "confidence", "summary"],
      },
    },
  });

  totalTokens += finalResp.usageMetadata?.totalTokenCount ?? 200;
  const rawJson = (finalResp.text ?? "{}").trim();
  const parsed = AgentVerdictSchema.parse(JSON.parse(rawJson));
  return { verdict: parsed, tokensUsed: totalTokens };
}

/**
 * Orchestrateur de repli sans clé Gemini : applique exactement les mêmes outils,
 * schémas Zod et garde-fous pour résoudre les doublons sûrs et escalader les cas ambigus.
 */
async function runDeterministicAgentFallback(params: {
  openAnomalies: Anomaly[];
  runtime: ScopedToolRuntime;
  rules: ProjectRulesConfig;
  recordsCount: number;
}): Promise<AgentVerdict> {
  const { openAnomalies, runtime, rules, recordsCount } = params;
  const actionsTaken: string[] = [];

  // 1. Liste les anomalies via l'outil officiel (pseudonymisé)
  await runtime.executeTool("list_anomalies", { onlyOpen: true });
  actionsTaken.push("list_anomalies");

  // 2. Traite les doublons et quasi-doublons avec compare_records -> propose_merge
  const duplicateAnomalies = openAnomalies.filter(
    (a) => a.category === "exact_duplicate" || a.category === "near_duplicate"
  );

  for (const anom of duplicateAnomalies) {
    if (runtime.totalActionsExecuted >= rules.guardrails.maxActionsPerRun - 2) break;
    if (!anom.relatedRecordId) continue;

    const comp = await runtime.executeTool("compare_records", {
      recordIdA: anom.relatedRecordId,
      recordIdB: anom.recordId,
    });
    actionsTaken.push("compare_records");

    const score = typeof comp.similarityScore === "number" ? comp.similarityScore : 0;
    const mergeRes = await runtime.executeTool("propose_merge", {
      primaryRecordId: anom.relatedRecordId,
      secondaryRecordId: anom.recordId,
      anomalyId: anom.id,
      confidence: score,
      reason: `Traitement ${anom.category === "exact_duplicate" ? "doublon exact" : "quasi-doublon"}`,
    });
    actionsTaken.push(`propose_merge:${String(mergeRes.status)}`);
  }

  // 3. Escalade les anomalies non-doublons bloquantes ou à vérifier vers la validation humaine
  const otherAnomalies = openAnomalies.filter(
    (a) =>
      a.category !== "exact_duplicate" &&
      a.category !== "near_duplicate" &&
      (a.severity === "bloquante" || a.severity === "a_verifier")
  );

  for (const anom of otherAnomalies) {
    if (runtime.totalActionsExecuted >= rules.guardrails.maxActionsPerRun - 1) break;
    const isGeo = anom.category === "geo_out_of_bounds";
    await runtime.executeTool("request_validation", {
      actionType: anom.severity === "bloquante" ? "archive" : "review_batch",
      title: isGeo
        ? `Validation GPS vs zone d'intervention (${anom.severity})`
        : `${anom.category} (${anom.severity})`,
      description: anom.message,
      primaryRecordId: anom.recordId,
      anomalyId: anom.id,
      confidence: 0.78,
    });
    actionsTaken.push(`request_validation:${anom.category}`);
  }

  const summary =
    `Analyse terminée sur ${recordsCount} enregistrements (${openAnomalies.length} anomalie(s) examinée(s)) : ` +
    `${runtime.autoActionsCount} action(s) automatique(s) réversible(s) exécutée(s), ` +
    `${runtime.pendingValidationsCount} élément(s) envoyé(s) en file de validation humaine.`;

  await runtime.executeTool("write_summary", {
    summaryText: summary,
    overallConfidence: 0.9,
    needsHumanReview: runtime.pendingValidationsCount > 0,
  });
  actionsTaken.push("write_summary");

  return AgentVerdictSchema.parse({
    decision: runtime.pendingValidationsCount > 0 ? "awaiting_validation" : "completed",
    confidence: 0.9,
    summary,
    actionsTaken,
  });
}
