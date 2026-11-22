import { Content, GoogleGenAI, Type } from "@google/genai";
import type { Anomaly, DataRun, TenantSpaceContext } from "../connectors/types";
import { journalRepo, saveQuarantineSnapshot } from "../journal";
import { dispatchRunSummaryNotification } from "../notify/index";
import { runDeterministicControls, type ProjectRulesConfig } from "../rules/engine";
import { checkAbnormalAnomalyVolumeGuardrail } from "./guardrails";
import { RunPseudonymizer } from "./pseudonymize";
import { AgentVerdictSchema, type AgentVerdict } from "./schemas";
import { createScopedToolRuntime, GUARDIAN_TOOL_DECLARATIONS } from "./tools";

export function executeDeterministicRun(
  ctx: TenantSpaceContext,
  options: {
    sourceId: string;
    trigger: DataRun["trigger"];
    recordsIngested?: number;
    recordsSkippedIdempotent?: number;
  }
): { run: DataRun; anomaliesCount: number } {
  const { config: rules } = journalRepo.getProjectRules(ctx);
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = new Date().toISOString();
  const activeRecords = journalRepo.listNormalizedRecords(ctx, { includeArchived: false });
  const { anomalies, duplicatesCount } = runDeterministicControls({
    ctx,
    runId,
    records: activeRecords,
    rules,
  });

  journalRepo.replaceOpenAnomalies(ctx, anomalies);
  const anomaliesBySeverity = { bloquante: 0, a_verifier: 0, mineure: 0 };
  for (const a of anomalies) anomaliesBySeverity[a.severity] += 1;

  const run: DataRun = journalRepo.createRun(ctx, {
    id: runId,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    sourceId: options.sourceId,
    trigger: options.trigger,
    status: "completed",
    startedAt,
    finishedAt: new Date().toISOString(),
    recordsIngested: options.recordsIngested ?? 0,
    recordsSkippedIdempotent: options.recordsSkippedIdempotent ?? 0,
    recordsProcessed: activeRecords.length,
    duplicatesFound: duplicatesCount,
    anomaliesBySeverity,
    autoActionsCount: 0,
    pendingValidationsCount: 0,
    tokensUsed: 0,
    estimatedCostUsd: 0,
  });

  return { run, anomaliesCount: anomalies.length };
}

export async function runGuardianAgent(
  ctx: TenantSpaceContext,
  options?: { sourceId?: string; trigger?: DataRun["trigger"]; existingRunId?: string }
): Promise<{ run: DataRun; verdict: AgentVerdict; usedGemini: boolean }> {
  const { config: rules } = journalRepo.getProjectRules(ctx);
  const sources = journalRepo.listSources(ctx);
  const sourceId = options?.sourceId || sources[0]?.id || "agent-run";

  const runId =
    options?.existingRunId ||
    executeDeterministicRun(ctx, { sourceId, trigger: options?.trigger ?? "manual" }).run.id;

  const activeRecords = journalRepo.listNormalizedRecords(ctx, { includeArchived: false });
  const openAnomalies = journalRepo.listAnomalies(ctx, { status: "open" });

  const guard = await checkAbnormalAnomalyVolumeGuardrail({
    ctx,
    runId,
    activeRecords,
    openAnomalies,
    rules,
  });
  if (guard.aborted) {
    return {
      run: guard.run,
      verdict: {
        decision: "aborted_low_confidence",
        confidence: 0.4,
        summary: guard.summaryText,
        actionsTaken: ["guardrail_abnormal_volume"],
      },
      usedGemini: false,
    };
  }

  if (openAnomalies.length === 0) {
    const cleanSummary = `Run ${runId} terminé sur ${activeRecords.length} enregistrements : 0 anomalie.`;
    const notif = await dispatchRunSummaryNotification(ctx, runId, cleanSummary);
    const updated = journalRepo.updateRun(ctx, runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      summaryText: cleanSummary,
      notificationChannels: notif.channels,
    })!;
    return {
      run: updated,
      verdict: { decision: "completed", confidence: 1, summary: cleanSummary, actionsTaken: [] },
      usedGemini: false,
    };
  }

  const pseudonymizer = new RunPseudonymizer();
  const runtime = createScopedToolRuntime({ ctx, runId, rules, pseudonymizer });
  let verdict: AgentVerdict | null = null;
  let usedGemini = false;
  let tokensUsed = 0;

  if (process.env.GEMINI_API_KEY) {
    try {
      const llmRes = await runGeminiToolLoop({
        runId,
        rules,
        runtime,
        openCount: openAnomalies.length,
        recordsCount: activeRecords.length,
      });
      verdict = llmRes.verdict;
      tokensUsed = llmRes.tokensUsed;
      usedGemini = true;
    } catch {
      // Fallback autonome sûr
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

  const blocking = openAnomalies.filter((a) => a.severity === "bloquante");
  if (blocking.length > 0) {
    saveQuarantineSnapshot(ctx, runId, {
      reason: "blocking_anomalies",
      count: blocking.length,
      anomalies: blocking.map((a) => ({ id: a.id, recordId: a.recordId, ruleId: a.ruleId })),
    });
  }

  const updatedRun = journalRepo.updateRun(ctx, runId, {
    status: runtime.pendingValidationsCount > 0 ? "awaiting_validation" : "completed",
    finishedAt: new Date().toISOString(),
    autoActionsCount: runtime.autoActionsCount,
    pendingValidationsCount: runtime.pendingValidationsCount,
    tokensUsed,
    estimatedCostUsd: Number(((tokensUsed / 1_000_000) * 0.15).toFixed(6)),
    summaryText: runtime.summaryWritten || verdict.summary,
    notificationChannels: runtime.notificationChannels,
  })!;

  return { run: updatedRun, verdict, usedGemini };
}

async function runGeminiToolLoop(params: {
  runId: string;
  rules: ProjectRulesConfig;
  runtime: ReturnType<typeof createScopedToolRuntime>;
  openCount: number;
  recordsCount: number;
}): Promise<{ verdict: AgentVerdict; tokensUsed: number }> {
  const { runId, rules, runtime, openCount, recordsCount } = params;
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  const systemInstruction = `Agent autonome Gardien de données. Données PII pseudonymisées.
- Utilisez propose_merge (>= ${rules.duplicateDetection.nearDuplicate.autoMergeThreshold} auto, sinon validation) et request_validation pour outliers, champs vides et écarts GPS/zone d'intervention.
- Terminez par write_summary puis répondez uniquement en JSON.`;

  const contents: Content[] = [
    {
      role: "user",
      parts: [{ text: `Run ${runId} : ${recordsCount} enregistrements, ${openCount} anomalie(s).` }],
    },
  ];

  let totalTokens = 0;
  for (let turn = 0; turn < 10; turn++) {
    if (totalTokens >= rules.guardrails.maxTokensPerRun) throw new Error("Budget tokens dépassé.");
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
    if (modelContent) contents.push(modelContent);

    const calls = response.functionCalls;
    if (calls && calls.length > 0) {
      const responseParts = [];
      for (const call of calls) {
        let out: Record<string, unknown>;
        try {
          out = await runtime.executeTool(call.name || "", call.args);
        } catch (err) {
          out = { error: err instanceof Error ? err.message : "Erreur outil" };
        }
        responseParts.push({
          functionResponse: { id: call.id, name: call.name || "", response: out },
        });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }
    break;
  }

  const finalResp = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: [
      ...contents,
      { role: "user", parts: [{ text: "Verdict JSON strict : decision, confidence, summary, actionsTaken." }] },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          actionsTaken: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["decision", "confidence", "summary"],
      },
    },
  });
  totalTokens += finalResp.usageMetadata?.totalTokenCount ?? 200;
  return {
    verdict: AgentVerdictSchema.parse(JSON.parse((finalResp.text ?? "{}").trim())),
    tokensUsed: totalTokens,
  };
}

async function runDeterministicAgentFallback(params: {
  openAnomalies: Anomaly[];
  runtime: ReturnType<typeof createScopedToolRuntime>;
  rules: ProjectRulesConfig;
  recordsCount: number;
}): Promise<AgentVerdict> {
  const { openAnomalies, runtime, rules, recordsCount } = params;
  const actionsTaken: string[] = [];

  await runtime.executeTool("list_anomalies", { onlyOpen: true });
  actionsTaken.push("list_anomalies");

  for (const anom of openAnomalies.filter(
    (a) => a.category === "exact_duplicate" || a.category === "near_duplicate"
  )) {
    if (runtime.totalActionsExecuted >= rules.guardrails.maxActionsPerRun - 2) break;
    if (!anom.relatedRecordId) continue;
    const comp = await runtime.executeTool("compare_records", {
      recordIdA: anom.relatedRecordId,
      recordIdB: anom.recordId,
    });
    const score = typeof comp.similarityScore === "number" ? comp.similarityScore : 0;
    const mergeRes = await runtime.executeTool("propose_merge", {
      primaryRecordId: anom.relatedRecordId,
      secondaryRecordId: anom.recordId,
      anomalyId: anom.id,
      confidence: score,
      reason: `Traitement ${anom.category}`,
    });
    actionsTaken.push(`propose_merge:${String(mergeRes.status)}`);
  }

  for (const anom of openAnomalies.filter(
    (a) =>
      a.category !== "exact_duplicate" &&
      a.category !== "near_duplicate" &&
      (a.severity === "bloquante" || a.severity === "a_verifier")
  )) {
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

  const summary = `Analyse sur ${recordsCount} enregistrements (${openAnomalies.length} anomalie(s)) : ${runtime.autoActionsCount} action(s) auto, ${runtime.pendingValidationsCount} en validation humaine.`;
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
