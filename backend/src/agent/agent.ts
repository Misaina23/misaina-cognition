import type { Anomaly, DataRun, TenantSpaceContext } from "../connectors/types";
import { journalRepo, saveQuarantineSnapshot } from "../journal";
import { createLlmProvider, type LlmMessage, type LlmProvider } from "../llm/provider";
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
  const startedMs = Date.now();
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
    durationMs: Date.now() - startedMs,
    recordsIngested: options.recordsIngested ?? 0,
    recordsSkippedIdempotent: options.recordsSkippedIdempotent ?? 0,
    recordsProcessed: activeRecords.length,
    duplicatesFound: duplicatesCount,
    anomaliesBySeverity,
    autoActionsCount: 0,
    pendingValidationsCount: 0,
    llmCallsCount: 0,
    llmProvider: "deterministic",
    llmModel: "rules-fallback-v1",
    tokensUsed: 0,
    estimatedCostUsd: 0,
  });

  return { run, anomaliesCount: anomalies.length };
}

export async function runGuardianAgent(
  ctx: TenantSpaceContext,
  options?: {
    sourceId?: string;
    trigger?: DataRun["trigger"];
    existingRunId?: string;
    llmProvider?: LlmProvider;
  }
): Promise<{ run: DataRun; verdict: AgentVerdict; usedGemini: boolean; llmProvider: string; llmModel: string }> {
  const startedMs = Date.now();
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
    startedMs,
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
      llmProvider: "deterministic",
      llmModel: "guardrail-v1",
    };
  }

  if (openAnomalies.length === 0) {
    const cleanSummary = `Run ${runId} terminé sur ${activeRecords.length} enregistrements : 0 anomalie.`;
    const notif = await dispatchRunSummaryNotification(ctx, runId, cleanSummary);
    const updated = journalRepo.updateRun(ctx, runId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      llmCallsCount: 0,
      llmProvider: "deterministic",
      llmModel: "rules-fallback-v1",
      summaryText: cleanSummary,
      notificationChannels: notif.channels,
    })!;
    return {
      run: updated,
      verdict: { decision: "completed", confidence: 1, summary: cleanSummary, actionsTaken: [] },
      usedGemini: false,
      llmProvider: "deterministic",
      llmModel: "rules-fallback-v1",
    };
  }

  const pseudonymizer = new RunPseudonymizer();
  const runtime = createScopedToolRuntime({ ctx, runId, rules, pseudonymizer });
  const provider = options?.llmProvider ?? createLlmProvider();

  let verdict: AgentVerdict | null = null;
  let usedLlm = false;
  let tokensUsed = 0;
  let estimatedCostUsd = 0;
  let llmCallsCount = 0;
  let usedProviderName: string = "deterministic";
  let usedModelName = "rules-fallback-v1";
  let fallbackNotice: string | undefined;

  if (provider.providerName !== "deterministic") {
    try {
      const llmRes = await runLlmToolLoop({
        ctx,
        provider,
        runId,
        rules,
        runtime,
        openCount: openAnomalies.length,
        recordsCount: activeRecords.length,
        onCallAttempt: () => {
          llmCallsCount += 1;
        },
      });
      verdict = llmRes.verdict;
      tokensUsed = llmRes.tokensUsed;
      estimatedCostUsd = llmRes.costUsd;
      usedProviderName = provider.providerName;
      usedModelName = provider.modelName;
      usedLlm = true;
    } catch (err) {
      const errorText = err instanceof Error ? err.message.toLowerCase() : "";
      const reasonCode = /budget|token/.test(errorText)
        ? "budget_exceeded"
        : /429|resource_exhausted|rate.?limit/.test(errorText)
          ? "rate_limited"
          : /timeout|timed out|etimedout/.test(errorText)
            ? "timeout"
            : "provider_unavailable";
      fallbackNotice =
        reasonCode === "budget_exceeded"
          ? "Le budget de traitement LLM a été atteint."
          : reasonCode === "rate_limited"
            ? "Le fournisseur LLM a limité les requêtes."
            : reasonCode === "timeout"
              ? "Le fournisseur LLM n’a pas répondu dans le délai prévu."
              : "Le fournisseur LLM n’a pas répondu.";
      journalRepo.addAgentAction(ctx, {
        id: `act-llm-fallback-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runId,
        timestamp: new Date().toISOString(),
        toolName: "llm_fallback",
        inputs: { llmProvider: provider.providerName, llmModel: provider.modelName },
        output: { reasonCode, fallback: "rules-fallback-v1" },
        decision: `${fallbackNotice} Repli sur les règles locales; les cas ambigus restent soumis à validation.`,
        confidence: 1,
        author: "agent",
        llmProvider: provider.providerName,
        llmModel: provider.modelName,
        reversible: false,
        reverted: false,
      });
      usedProviderName = "deterministic";
      usedModelName = "rules-fallback-v1";
    }
  }

  if (!verdict) {
    verdict = await runDeterministicAgentFallback({
      openAnomalies,
      runtime,
      rules,
      recordsCount: activeRecords.length,
      fallbackNotice,
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
    durationMs: Date.now() - startedMs,
    autoActionsCount: runtime.autoActionsCount,
    pendingValidationsCount: runtime.pendingValidationsCount,
    llmCallsCount,
    llmProvider: usedProviderName,
    llmModel: usedModelName,
    tokensUsed,
    estimatedCostUsd,
    summaryText: runtime.summaryWritten || verdict.summary,
    notificationChannels: runtime.notificationChannels,
  })!;

  return {
    run: updatedRun,
    verdict,
    usedGemini: usedLlm,
    llmProvider: usedProviderName,
    llmModel: usedModelName,
  };
}

function recordLlmCallAction(params: {
  ctx: TenantSpaceContext;
  runId: string;
  provider: LlmProvider;
  phase: "tool_loop" | "final_verdict";
  turn: number;
  messagesCount: number;
  toolsCount: number;
  response: Awaited<ReturnType<LlmProvider["chat"]>>;
  durationMs: number;
}): void {
  const { ctx, runId, provider, phase, turn, messagesCount, toolsCount, response, durationMs } =
    params;
  const effectiveDurationMs = response.usage.durationMs || durationMs;
  journalRepo.addAgentAction(ctx, {
    id: `act-llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "llm_chat",
    inputs: { phase, turn, messagesCount, toolsCount },
    output: {
      llmProvider: provider.providerName,
      llmModel: provider.modelName,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      costUsd: response.usage.costUsd,
      durationMs: effectiveDurationMs,
      toolCallsCount: response.toolCalls.length,
      toolCallNames: response.toolCalls.map((c) => c.name),
    },
    decision: `Appel LLM ${provider.providerName}/${provider.modelName} (${phase}) — ${response.usage.totalTokens} tokens, ${effectiveDurationMs} ms`,
    confidence: 1,
    author: "agent",
    llmProvider: provider.providerName,
    llmModel: provider.modelName,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    tokensUsed: response.usage.totalTokens,
    durationMs: effectiveDurationMs,
    reversible: false,
    reverted: false,
  });
}

async function runLlmToolLoop(params: {
  ctx: TenantSpaceContext;
  provider: LlmProvider;
  runId: string;
  rules: ProjectRulesConfig;
  runtime: ReturnType<typeof createScopedToolRuntime>;
  openCount: number;
  recordsCount: number;
  onCallAttempt: () => void;
}): Promise<{ verdict: AgentVerdict; tokensUsed: number; costUsd: number }> {
  const { ctx, provider, runId, rules, runtime, openCount, recordsCount, onCallAttempt } = params;

  const system = `Agent autonome Gardien de données (MEAL). Données PII pseudonymisées.
- Utilisez list_anomalies puis compare_records et propose_merge (>= ${rules.duplicateDetection.nearDuplicate.autoMergeThreshold} auto, sinon validation) et request_validation pour cas ambigus, âges aberrants, copier-coller enquêteur et écarts GPS/zone d'intervention.
- Rédigez un message de vérification clair destiné au superviseur terrain pour les cas ambigus dans write_summary, puis répondez uniquement en JSON.`;

  const messages: LlmMessage[] = [
    {
      role: "user",
      text: `Run ${runId} : ${recordsCount} enregistrements, ${openCount} anomalie(s).`,
    },
  ];

  let totalTokens = 0;
  let totalCostUsd = 0;
  let llmCallsCount = 0;

  for (let turn = 0; turn < 10; turn++) {
    if (totalTokens >= rules.guardrails.maxTokensPerRun) throw new Error("Budget tokens dépassé.");
    const callStartMs = Date.now();
    llmCallsCount += 1;
    onCallAttempt();
    const response = await provider.chat({
      system,
      messages,
      tools: GUARDIAN_TOOL_DECLARATIONS,
    });
    const callDurationMs = Date.now() - callStartMs;
    totalTokens += response.usage.totalTokens;
    totalCostUsd += response.usage.costUsd;

    recordLlmCallAction({
      ctx,
      runId,
      provider,
      phase: "tool_loop",
      turn,
      messagesCount: messages.length,
      toolsCount: GUARDIAN_TOOL_DECLARATIONS.length,
      response,
      durationMs: callDurationMs,
    });

    if (response.toolCalls.length > 0) {
      messages.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        let out: Record<string, unknown>;
        try {
          out = await runtime.executeTool(call.name, call.args);
        } catch (err) {
          out = { error: err instanceof Error ? err.message : "Erreur outil" };
        }
        messages.push({
          role: "tool",
          toolResult: { callId: call.id, name: call.name, response: out },
        });
      }
      continue;
    }
    if (response.text) {
      messages.push({ role: "assistant", text: response.text });
    }
    break;
  }

  const verdictSchema = {
    type: "object",
    properties: {
      decision: { type: "string" },
      confidence: { type: "number" },
      summary: { type: "string" },
      actionsTaken: { type: "array", items: { type: "string" } },
    },
    required: ["decision", "confidence", "summary"],
  };

  const verdictStartMs = Date.now();
  llmCallsCount += 1;
  onCallAttempt();
  const finalResp = await provider.chat({
    system: "Répondez uniquement avec un objet JSON strict valide.",
    messages: [
      ...messages,
      { role: "user", text: "Verdict JSON strict : decision, confidence, summary, actionsTaken." },
    ],
    schema: verdictSchema,
  });
  const verdictDurationMs = Date.now() - verdictStartMs;
  totalTokens += finalResp.usage.totalTokens;
  totalCostUsd += finalResp.usage.costUsd;

  recordLlmCallAction({
    ctx,
    runId,
    provider,
    phase: "final_verdict",
    turn: llmCallsCount,
    messagesCount: messages.length + 1,
    toolsCount: 0,
    response: finalResp,
    durationMs: verdictDurationMs,
  });

  const cleanedJsonText = (finalResp.text || "{}")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return {
    verdict: AgentVerdictSchema.parse(JSON.parse(cleanedJsonText || "{}")),
    tokensUsed: totalTokens,
    costUsd: Number(totalCostUsd.toFixed(6)),
  };
}

async function runDeterministicAgentFallback(params: {
  openAnomalies: Anomaly[];
  runtime: ReturnType<typeof createScopedToolRuntime>;
  rules: ProjectRulesConfig;
  recordsCount: number;
  fallbackNotice?: string;
}): Promise<AgentVerdict> {
  const { openAnomalies, runtime, rules, recordsCount, fallbackNotice } = params;
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
    const isCopyPaste = anom.category === "enumerator_copy_paste";
    await runtime.executeTool("request_validation", {
      actionType: anom.severity === "bloquante" ? "archive" : "review_batch",
      title: isGeo
        ? `Validation GPS vs zone d'intervention (${anom.severity})`
        : isCopyPaste
          ? `Contrôle MEAL : suspicion copier-coller enquêteur (${anom.severity})`
          : `${anom.category} (${anom.severity})`,
      description: anom.message,
      primaryRecordId: anom.recordId,
      anomalyId: anom.id,
      confidence: 0.78,
    });
    actionsTaken.push(`request_validation:${anom.category}`);
  }

  const countBySev = { bloquante: 0, a_verifier: 0, mineure: 0 };
  for (const a of openAnomalies) countBySev[a.severity] += 1;

  const verificationTargets = openAnomalies
    .filter((a) => a.severity === "bloquante" || a.severity === "a_verifier")
    .slice(0, 4)
    .map((a) => `- [${a.severity.toUpperCase()}] ${a.message}`)
    .join("\n");

  const summary = [
    `Contrôle MEAL sur ${recordsCount} enregistrements (${openAnomalies.length} anomalie(s) : ${countBySev.bloquante} bloquante(s), ${countBySev.a_verifier} à vérifier, ${countBySev.mineure} mineure(s)).`,
    fallbackNotice
      ? `Surveillance : ${fallbackNotice} Contrôle poursuivi par règles locales; aucun cas ambigu n'est validé automatiquement sans seuil suffisant.`
      : "",
    `Actions : ${runtime.autoActionsCount} action(s) automatique(s) réversible(s), ${runtime.pendingValidationsCount} dossier(s) en validation humaine.`,
    verificationTargets
      ? `\nMessage de vérification terrain (à confirmer par le superviseur) :\n${verificationTargets}\nMerci de vérifier les fiches concernées et de confirmer ou rejeter dans la file de validation avant clôture.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

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
