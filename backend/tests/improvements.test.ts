import assert from "node:assert/strict";
import { runGuardianAgent } from "../src/agent/agent";
import { CsvConnector } from "../src/connectors/csv";
import { journalRepo, resolveValidationItem } from "../src/journal";
import { createLlmProvider } from "../src/llm/provider";
import { generateWeeklySpaceDocxBuffer } from "../src/reports/weeklyDocx";
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
  await csv.ingest(
    {
      source: src,
      fileBuffer: Buffer.from(
        "id;full_name;telephone;age;montant;lat;lon;zone\n" +
          "F1;Moussa Diallo;+221770001101;30;400;14.70;-17.44;Dakar\n" +
          "F2;Moussa Dialo;+221770001102;30;400;14.70;-17.44;Dakar\n" +
          "F3;Awa Ndiaye;+221770002201;25;450;14.71;-17.45;Dakar\n" +
          "F4;Awa Ndiay;+221770002202;25;450;14.71;-17.45;Dakar\n" +
          "F5;Oumar Sow;+221770003301;40;500;14.72;-17.46;Dakar\n" +
          "F6;Oumar So;+221770003302;40;500;14.72;-17.46;Dakar\n" +
          "F7;Fatou Ba;+221770004401;29;500;14.73;-17.47;Dakar\n" +
          "F8;Ibrahima Fall;+221770005501;31;500;14.74;-17.48;Dakar\n" +
          "F9;Kadiatou Sy;+221770006601;33;500;14.75;-17.49;Dakar\n" +
          "F10;Cheikh Kane;+221770007701;35;500;14.76;-17.43;Dakar\n",
        "utf8"
      ),
      fileName: "feedback.csv",
    },
    ctx
  );

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
    "[backend/tests/improvements.test.ts] Observabilité, apprentissage >60% sans auto-modif YAML, Multi-LLM et .docx validés."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
