import assert from "node:assert/strict";
import { runGuardianAgent } from "../src/agent/agent";
import { CsvConnector } from "../src/connectors/csv";
import { journalRepo, resolveValidationItem } from "../src/journal";
import { createLlmProvider } from "../src/llm/provider";
import { generateWeeklySpaceDocxBuffer } from "../src/reports/weeklyDocx";
import { runDeterministicControls, ProjectRulesSchema } from "../src/rules/engine";
import { createUserSpace, getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

async function main() {
  const user = getPrincipalByIdOrHeader("u-1");
  const space = createUserSpace(resolveContextForUser(user).tenantId, user.id, "Espace Ameliorations");
  const ctx = resolveContextForUser(user, space.id);

  // 1. Multi-LLM : abstraction sélectionnable par config
  const detProvider = createLlmProvider({ provider: "deterministic" });
  assert.equal(detProvider.providerName, "deterministic");
  assert.equal(detProvider.modelName, "rules-fallback-v1");

  // 2. Ingestion + Run + Observabilité (#4)
  const csv = new CsvConnector();
  const src = journalRepo.ensureSourceForType(ctx, "csv", "Source Feedback");
  const ingestion = await csv.ingest(
    {
      source: src,
      fileBuffer: Buffer.from(
        "id;full_name;telephone;age;montant;lat;lon;zone\n" +
          "F1;Moussa Diallo;+261770001101;30;400;-18.8792;47.5079;Antananarivo\n" +
          "F2;Moussa Dialo;+261770001102;30;400;-18.8792;47.5079;Antananarivo\n" +
          "F3;Awa Ndiaye;+261770002201;25;450;-18.88;47.51;Antananarivo\n" +
          "F4;Awa Ndiay;+261770002202;25;450;-18.88;47.51;Antananarivo\n" +
          "F5;Oumar Sow;+261770003301;40;500;-18.881;47.512;Antananarivo\n" +
          "F6;Oumar So;+261770003302;40;500;-18.881;47.512;Antananarivo\n" +
          "F7;Fatou Ba;+261770004401;29;500;-18.882;47.513;Antananarivo\n" +
          "F8;Ibrahima Fall;+261770005501;31;500;-18.883;47.514;Antananarivo\n" +
          "F9;Kadiatou Sy;+261770006601;33;500;-18.884;47.515;Antananarivo\n" +
          "F10;Cheikh Kane;+261770007701;35;500;-18.885;47.516;Antananarivo\n",
        "utf8"
      ),
      fileName: "feedback.csv",
    },
    ctx
  );

  const requiredQuestionRules = ProjectRulesSchema.parse({
    requiredFields: [{ field: "q_eau", severity: "bloquante", label: "Source d'eau" }],
  });
  const sampleRecord = ingestion.normalizedRecords[0];
  assert.ok(sampleRecord);
  const missingCustomAnswer = runDeterministicControls({
    ctx,
    runId: "custom-required-field-test",
    records: [
      {
        ...sampleRecord,
        extra: { ...sampleRecord.extra, q_eau: "   " },
      },
    ],
    rules: requiredQuestionRules,
  });
  assert.equal(missingCustomAnswer.anomalies.length, 1);
  assert.equal(missingCustomAnswer.anomalies[0].ruleId, "required_q_eau");

  const missingMultiSelectAnswer = runDeterministicControls({
    ctx,
    runId: "custom-required-empty-list-test",
    records: [
      {
        ...sampleRecord,
        extra: { ...sampleRecord.extra, q_eau: [] },
      },
    ],
    rules: requiredQuestionRules,
  });
  assert.equal(missingMultiSelectAnswer.anomalies.length, 1);

  const answeredCustomQuestion = runDeterministicControls({
    ctx,
    runId: "custom-required-field-answer-test",
    records: [
      {
        ...sampleRecord,
        extra: { ...sampleRecord.extra, q_eau: "forage" },
      },
    ],
    rules: requiredQuestionRules,
  });
  assert.equal(answeredCustomQuestion.anomalies.length, 0);

  const runRes = await runGuardianAgent(ctx, { sourceId: src.id, trigger: "upload" });
  assert.equal(typeof runRes.run.durationMs, "number");
  assert.equal(typeof runRes.run.llmCallsCount, "number");
  assert.ok(runRes.run.llmProvider);
  assert.ok(runRes.run.llmModel);

  // 3. Apprentissage des décisions humaines (> 60% de rejet -> suggestion sans auto-modif YAML)
  const yamlBefore = journalRepo.getProjectRules(ctx).rawYaml;
  const pending = journalRepo.listValidations(ctx, "pending");
  assert.ok(pending.length >= 3, "Au moins 3 quasi-doublons en attente requis");

  resolveValidationItem(ctx, pending[0].id, "rejected");
  resolveValidationItem(ctx, pending[1].id, "rejected");
  resolveValidationItem(ctx, pending[2].id, "approved");

  const stats = journalRepo.listRuleFeedback(ctx);
  const nearStat = stats.find((s) => s.ruleId === "near_duplicate_similarity");
  assert.ok(nearStat);
  assert.equal(nearStat.rejectedCount, 2);
  assert.equal(nearStat.approvedCount, 1);
  assert.ok(nearStat.rejectionRate > 0.6);

  const suggestions = journalRepo.getRuleThresholdSuggestions(ctx);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].ruleId, "near_duplicate_similarity");
  assert.equal(journalRepo.getProjectRules(ctx).rawYaml, yamlBefore, "Le YAML ne doit jamais être modifié automatiquement");

  // 4. Génération rapport hebdomadaire .docx
  const docx = await generateWeeklySpaceDocxBuffer(ctx);
  assert.ok(docx.buffer.length > 500);
  assert.equal(docx.buffer.subarray(0, 2).toString("utf8"), "PK");

  console.log(
    "[backend/tests/improvements.test.ts] Champs MEAL personnalisés, observabilité, apprentissage sans auto-modif YAML, Multi-LLM et .docx validés."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
