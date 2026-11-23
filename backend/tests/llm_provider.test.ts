import assert from "node:assert/strict";
import { runGuardianAgent } from "../src/agent/agent";
import { askNaturalLanguageSpaceQuestion } from "../src/agent/nlq";
import { CsvConnector } from "../src/connectors/csv";
import { journalRepo } from "../src/journal";
import {
  createLlmProvider,
  GeminiProvider,
  MockProvider,
  setMockLlmHandler,
  type LLMProvider,
  type LlmChatParams,
} from "../src/llm/provider";
import { createUserSpace, getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

async function main() {
  const prevLlmProvider = process.env.LLM_PROVIDER;
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  const prevOpenAiKey = process.env.OPENAI_API_KEY;
  const prevAnthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    // 1. Sélection par LLM_PROVIDER=gemini sans GEMINI_API_KEY -> repli déterministe sûr
    process.env.LLM_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const fallbackProvider = createLlmProvider();
    assert.equal(fallbackProvider.providerName, "deterministic");
    assert.equal(fallbackProvider.modelName, "rules-fallback-v1");

    // 1b. Sélection de GeminiProvider via LLM_PROVIDER=gemini avec GEMINI_API_KEY
    process.env.LLM_PROVIDER = " Gemini ";
    process.env.GEMINI_API_KEY = "test-gemini-key-placeholder";
    const geminiProvider: LLMProvider = createLlmProvider();
    assert.ok(geminiProvider instanceof GeminiProvider);
    assert.equal(geminiProvider.providerName, "gemini");
    assert.equal(geminiProvider.modelName, "gemini-4-hydrogen");
    delete process.env.GEMINI_API_KEY;

    // 2. Sélection par LLM_PROVIDER=mock + vérification chat({ system, messages, tools, schema })
    const observedCalls: LlmChatParams[] = [];
    process.env.LLM_PROVIDER = "mock";

    const user = getPrincipalByIdOrHeader("u-1");
    const space = createUserSpace(
      resolveContextForUser(user).tenantId,
      user.id,
      "Espace Abstraction LLM"
    );
    const ctx = resolveContextForUser(user, space.id);

    const csv = new CsvConnector();
    const src = journalRepo.ensureSourceForType(ctx, "csv", "Source Mock LLM");
    await csv.ingest(
      {
        source: src,
        fileBuffer: Buffer.from(
          "id;full_name;telephone;age;montant;lat;lon;zone\n" +
            "M1;Aminata Diop;+221771110001;32;500;14.70;-17.44;Dakar\n" +
            "M2;Aminata Diop;+221771110001;32;500;14.70;-17.44;Dakar\n" +
            "M3;Cheikh Ndiaye;+221772220002;165;450;14.72;-17.46;Dakar\n",
          "utf8"
        ),
        fileName: "mock_llm.csv",
      },
      ctx
    );

    const activeRecs = journalRepo.listNormalizedRecords(ctx, { includeArchived: false });
    const recM1 = activeRecs.find((r) => r.externalId === "M1")!;
    const recM2 = activeRecs.find((r) => r.externalId === "M2")!;
    const recM3 = activeRecs.find((r) => r.externalId === "M3")!;

    setMockLlmHandler((params, idx) => {
      observedCalls.push(params);
      if (idx === 0) {
        return {
          text: "",
          toolCalls: [
            { id: "tc-1", name: "list_anomalies", args: { onlyOpen: true } },
            {
              id: "tc-2",
              name: "propose_merge",
              args: {
                primaryRecordId: recM1.id,
                secondaryRecordId: recM2.id,
                confidence: 0.99,
                reason: "Doublon exact détecté via MockProvider",
              },
            },
            {
              id: "tc-3",
              name: "request_validation",
              args: {
                actionType: "archive",
                title: "Âge aberrant M3",
                description: "Âge 165 ans hors plage",
                primaryRecordId: recM3.id,
                confidence: 0.85,
              },
            },
            {
              id: "tc-4",
              name: "write_summary",
              args: {
                summaryText: "Run MockProvider terminé : 1 fusion auto, 1 validation humaine.",
                overallConfidence: 0.93,
                needsHumanReview: true,
              },
            },
          ],
          usage: { inputTokens: 180, outputTokens: 90, totalTokens: 270, costUsd: 0, durationMs: 12 },
        };
      }
      if (idx === 1) {
        return {
          text: "Outils exécutés, prêt pour le verdict.",
          toolCalls: [],
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costUsd: 0, durationMs: 7 },
        };
      }
      return {
        text: JSON.stringify({
          decision: "awaiting_validation",
          confidence: 0.93,
          summary: "Run MockProvider terminé : 1 fusion auto, 1 validation humaine.",
          actionsTaken: ["list_anomalies", "propose_merge", "request_validation", "write_summary"],
        }),
        toolCalls: [],
        usage: { inputTokens: 90, outputTokens: 45, totalTokens: 135, costUsd: 0, durationMs: 9 },
      };
    });

    const res = await runGuardianAgent(ctx, { sourceId: src.id, trigger: "manual" });
    assert.equal(res.usedGemini, true);
    assert.equal(res.llmProvider, "mock");
    assert.equal(res.llmModel, "mock-llm-v1");
    assert.equal(res.verdict.decision, "awaiting_validation");
    assert.equal(res.run.llmCallsCount, 3);
    assert.equal(res.run.tokensUsed, 525);

    // Vérifier qu'aucune PII en clair n'est partie dans les messages initiaux et que les outils sont agnostiques
    assert.ok(observedCalls.length === 3);
    assert.ok((observedCalls[0].tools || []).length === 7);
    assert.ok(observedCalls[2].schema);
    const toolLoopMsgJson = JSON.stringify(observedCalls[1].messages);
    assert.equal(toolLoopMsgJson.includes("Aminata Diop"), false);
    assert.equal(toolLoopMsgJson.includes("+221771110001"), false);

    // Vérifier la journalisation de CHAQUE appel LLM dans agent_actions
    const llmActions = journalRepo
      .listAgentActions(ctx, res.run.id)
      .filter((a) => a.toolName === "llm_chat");
    assert.equal(llmActions.length, 3);
    for (const act of llmActions) {
      assert.equal(act.llmProvider, "mock");
      assert.equal(act.llmModel, "mock-llm-v1");
      assert.ok(typeof act.inputTokens === "number" && act.inputTokens > 0);
      assert.ok(typeof act.outputTokens === "number" && act.outputTokens > 0);
      assert.ok(typeof act.tokensUsed === "number" && act.tokensUsed > 0);
      assert.ok(typeof act.durationMs === "number" && act.durationMs >= 0);
    }

    // 3. Vérifier l'utilisation directe d'une instance MockProvider avec NLQ lecture seule
    setMockLlmHandler((_params, idx) => {
      if (idx === 0) {
        return {
          text: "",
          toolCalls: [{ id: "nlq-1", name: "query_space_data", args: { metric: "count_records" } }],
          usage: { inputTokens: 80, outputTokens: 30, totalTokens: 110, costUsd: 0, durationMs: 5 },
        };
      }
      return {
        text: "Il y a 2 enregistrements actifs dans cet espace.",
        toolCalls: [],
        usage: { inputTokens: 90, outputTokens: 25, totalTokens: 115, costUsd: 0, durationMs: 6 },
      };
    });
    const nlqRes = await askNaturalLanguageSpaceQuestion(ctx, "Combien d'enregistrements actifs ?");
    assert.equal(nlqRes.llmProvider, "mock");
    assert.equal(nlqRes.tokensUsed, 225);

    const nlqActions = journalRepo
      .listAgentActions(ctx, "nlq-query")
      .filter((a) => a.toolName === "llm_chat");
    assert.equal(nlqActions.length, 2);
    assert.equal(nlqActions[0].llmProvider, "mock");
    assert.ok((nlqActions[0].inputTokens || 0) > 0);
    assert.ok((nlqActions[0].outputTokens || 0) > 0);
    assert.ok((nlqActions[0].tokensUsed || 0) > 0);

    // 4. Vérifier que MockProvider sans handler fonctionne aussi de bout en bout (agent + NLQ)
    setMockLlmHandler(null);
    process.env.LLM_PROVIDER = " MOCK ";
    const defaultMockAgentRes = await runGuardianAgent(ctx, { sourceId: src.id, trigger: "manual" });
    assert.equal(defaultMockAgentRes.usedGemini, true);
    assert.equal(defaultMockAgentRes.llmProvider, "mock");
    assert.ok(defaultMockAgentRes.run.tokensUsed > 0);
    const defaultMockActions = journalRepo
      .listAgentActions(ctx, defaultMockAgentRes.run.id)
      .filter((a) => a.toolName === "llm_chat");
    assert.ok(defaultMockActions.length >= 2);
    assert.equal(defaultMockActions[0].llmProvider, "mock");

    // 4b. Un échec fournisseur est visible et le run continue avec les règles locales
    const unavailableProvider: LLMProvider = {
      providerName: "mock",
      modelName: "unavailable-provider",
      async chat() {
        throw new Error("provider temporarily unavailable");
      },
    };
    const failedLlmRes = await runGuardianAgent(ctx, {
      sourceId: src.id,
      trigger: "manual",
      llmProvider: unavailableProvider,
    });
    assert.equal(failedLlmRes.usedGemini, false);
    assert.equal(failedLlmRes.llmProvider, "deterministic");
    assert.equal(failedLlmRes.run.llmCallsCount, 1);
    assert.ok(failedLlmRes.run.summaryText?.includes("Le fournisseur LLM n’a pas répondu."));
    const fallbackAction = journalRepo
      .listAgentActions(ctx, failedLlmRes.run.id)
      .find((action) => action.toolName === "llm_fallback");
    assert.ok(fallbackAction);
    assert.equal(fallbackAction.output.reasonCode, "provider_unavailable");
    assert.equal(fallbackAction.output.fallback, "rules-fallback-v1");
    assert.ok(fallbackAction.decision.includes("validation"));

    const defaultNlqRes = await askNaturalLanguageSpaceQuestion(ctx, "Résumé de l'espace");
    assert.equal(defaultNlqRes.llmProvider, "mock");
    assert.ok(defaultNlqRes.tokensUsed > 0);

    // 5. Vérifier que MockProvider direct fonctionne avec chat({ system, messages, tools, schema })
    const directMock = new MockProvider(() => ({
      text: "{\"ok\":true}",
      toolCalls: [],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0, durationMs: 2 },
    }));
    const chatOut = await directMock.chat({
      system: "Test",
      messages: [{ role: "user", text: "Ping" }],
    });
    assert.equal(chatOut.text, "{\"ok\":true}");
    assert.equal(chatOut.usage.totalTokens, 15);
    assert.equal(chatOut.usage.durationMs, 2);

    console.log(
      `[backend/tests/llm_provider.test.ts] Abstraction LLMProvider.chat validée : ${llmActions.length} appels LLM journalisés dans agent_actions, MockProvider autonome & repli déterministe sans clé OK.`
    );
  } finally {
    setMockLlmHandler(null);
    if (prevLlmProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevLlmProvider;
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    if (prevOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpenAiKey;
    if (prevAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevAnthropicKey;
  }
}

void main();
