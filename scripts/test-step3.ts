import assert from "node:assert/strict";
import { mockDb } from "../lib/server/mockDb";
import { resolveContextForUser } from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import { CsvConnector } from "../lib/guardian/connectors/index";
import { RunPseudonymizer } from "../lib/guardian/pseudonymizer";
import { runGuardianAgent } from "../lib/guardian/agentRunner";
import {
  resolveValidationItem,
  rollbackAgentAction,
} from "../lib/guardian/actionsService";

async function runTests() {
  console.log("=== TEST ÉTAPE 3 : Agent autonome, Pseudonymisation, Garde-fous & Rollback ===");

  const user1 = mockDb.users[0];
  const user3 = mockDb.users[2];
  const ctxSpace = guardianRepo.createSpace(
    resolveContextForUser(user1).tenantId,
    user1.id,
    "Espace Test Étape 3"
  );
  const ctx1 = resolveContextForUser(user1, ctxSpace.id);
  const ctxU3 = resolveContextForUser(user3, "space-u3-sahel");

  // S'assurer que le garde-fou volume anormal autorise un jeu de test contrôlé (ex: 70%)
  // puis on testera aussi le déclenchement du garde-fou à 30% !
  guardianRepo.setProjectRulesYaml(
    ctx1,
    `version: 1
projectName: "Test Agent Gardien"
requiredFields:
  - field: fullName
    severity: bloquante
  - field: zone
    severity: a_verifier
ranges:
  age:
    min: 0
    max: 110
    severity: bloquante
geoBounds:
  enabled: true
  zoneName: "Sénégal"
  minLat: 12.0
  maxLat: 16.8
  minLon: -17.6
  maxLon: -11.3
  rejectZeroZero: true
  severity: bloquante
duplicateDetection:
  exactBusinessKeyFields: [fullName, phone]
  exactSeverity: bloquante
  nearDuplicate:
    enabled: true
    autoMergeThreshold: 0.95
    reviewThreshold: 0.78
    severity: a_verifier
guardrails:
  maxAbnormalAnomalyRatio: 0.85
  maxActionsPerRun: 20
  maxTokensPerRun: 16000
  minAgentConfidence: 0.65
`
  );

  // 1. Ingestion de 8 lignes (1 doublon exact, 1 quasi-doublon intermédiaire, 1 GPS hors zone, 5 saines)
  const csv = new CsvConnector();
  const src = guardianRepo.ensureSourceForType(ctx1, "csv", "CSV Agent Test");
  const buffer = Buffer.from(
    "id;full_name;telephone;email;age;lat;lon;zone\n" +
      "A1;Aminata Diallo;+221771112233;aminata@org.sn;29;14.69;-17.44;Dakar\n" +
      "A2;Aminata Diallo;00221771112233;aminata@org.sn;29;14.69;-17.44;Dakar\n" + // Exact duplicate -> auto merge
      "A3;Fatou Ndiaye;+221772223344;fatou@org.sn;34;14.70;-17.45;Dakar\n" +
      "A4;Fatu Ndiay;+221772223345;other@org.sn;34;14.70;-17.45;Dakar\n" + // Near duplicate (~0.84) -> human validation
      "A5;Moussa Sow;+221773334455;moussa@org.sn;41;14.71;-17.42;Thiès\n" +
      "A6;Ibrahima Ba;+221774445566;ibrahima@org.sn;26;14.72;-17.41;Kaolack\n" +
      "A7;Mariama Sy;+221775556677;mariama@org.sn;38;14.73;-17.40;Saint-Louis\n" +
      "A8;Oumar Fall;+221776667788;oumar@org.sn;45;48.85;2.35;Paris\n", // GPS hors zone -> validation humaine
    "utf8"
  );
  await csv.ingest({ source: src, fileBuffer: buffer, fileName: "agent_test.csv" }, ctx1);

  // 2. Test pseudonymisation PII
  const pseudo = new RunPseudonymizer();
  const sampleRec = guardianRepo.listNormalizedRecords(ctx1)[0];
  const masked = pseudo.maskRecord(sampleRec);
  assert.ok(!String(masked.fullName).includes("Aminata"), "Le nom brut ne doit pas fuiter vers le LLM");
  assert.ok(!String(masked.phone).includes("771112233"), "Le téléphone brut ne doit pas fuiter");
  assert.ok(!String(masked.email).includes("aminata@"), "L'email brut ne doit pas fuiter");
  console.log("[OK] Pseudonymisation PII avant LLM validée.");

  // 3. Exécution du Gardien autonome
  const res = await runGuardianAgent(ctx1, { sourceId: src.id, trigger: "upload" });
  assert.ok(res.run.autoActionsCount >= 1, "Au moins 1 fusion automatique attendue pour le doublon exact");
  assert.ok(res.run.pendingValidationsCount >= 1, "Au moins 1 demande de validation humaine attendue");
  assert.ok(res.run.notificationChannels?.includes("ui_preview"));
  assert.ok(res.run.notificationChannels?.includes("agent_actions"));
  console.log(
    `[OK] Agent exécuté : auto=${res.run.autoActionsCount}, validation=${res.run.pendingValidationsCount}, canaux=${res.run.notificationChannels?.join(",")}`
  );

  // 4. Vérification aucune suppression : l'enregistrement fusionné est toujours présent avec status === 'merged'
  const allRecs = guardianRepo.listNormalizedRecords(ctx1, { includeArchived: true });
  assert.equal(allRecs.length, 8, "Aucun enregistrement ne doit être supprimé physiquement");
  const mergedRec = allRecs.find((r) => r.status === "merged");
  assert.ok(mergedRec, "Un doublon exact doit être marqué merged (restaurable)");

  // 5. Test Rollback depuis agent_actions
  const mergeAction = guardianRepo
    .listAgentActions(ctx1, res.run.id)
    .find((a) => a.toolName === "propose_merge" && a.reversible);
  assert.ok(mergeAction, "L'action propose_merge réversible doit être journalisée dans agent_actions");

  const reverted = rollbackAgentAction(ctx1, mergeAction.id);
  assert.equal(reverted.reverted, true);
  const restored = guardianRepo.getNormalizedRecord(ctx1, mergedRec.id);
  assert.equal(restored?.status, "active", "Le rollback doit restaurer l'enregistrement à active");
  console.log("[OK] Rollback exact d'une action de l'agent validé.");

  // 6. Test isolation des actions et validations
  assert.equal(guardianRepo.listAgentActions(ctxU3).length, 0);
  assert.equal(guardianRepo.listValidations(ctxU3).length, 0);
  assert.throws(
    () => rollbackAgentAction(ctxU3, mergeAction.id),
    "Un autre tenant ne doit pas pouvoir annuler une action d'un autre espace"
  );
  console.log("[OK] Isolation de agent_actions et validationQueue validée.");

  // 7. Test validation humaine (Approve / Reject)
  const pending = guardianRepo.listValidations(ctx1, "pending");
  assert.ok(pending.length >= 1);
  const valDecision = resolveValidationItem(ctx1, pending[0].id, "rejected");
  assert.equal(valDecision.item.status, "rejected");
  console.log("[OK] File de validation humaine (Valider/Rejeter) validée.");

  // 8. Test garde-fou volume anormal d'anomalies (abaisse le seuil à 0.10 -> arrêt immédiat)
  const rulesLowThreshold = guardianRepo.getProjectRules(ctx1).rawYaml.replace(
    "maxAbnormalAnomalyRatio: 0.85",
    "maxAbnormalAnomalyRatio: 0.10"
  );
  guardianRepo.setProjectRulesYaml(ctx1, rulesLowThreshold);
  const guardRes = await runGuardianAgent(ctx1, { sourceId: src.id, trigger: "manual" });
  assert.equal(guardRes.run.status, "aborted_guardrail");
  assert.equal(guardRes.verdict.decision, "aborted_low_confidence");
  console.log("[OK] Garde-fou volume anormal d'anomalies validé (arrêt + validation humaine).");

  console.log("\nTous les tests de l'Étape 3 ont réussi !");
}

runTests().catch((err) => {
  console.error("Échec du test Étape 3:", err);
  process.exit(1);
});
