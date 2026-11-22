import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockDb } from "../lib/server/mockDb";
import {
  resolveContextForUser,
  TenantIsolationError,
} from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import { CsvConnector } from "../lib/guardian/connectors/index";
import { runGuardianAgent } from "../lib/guardian/agentRunner";
import { rollbackAgentAction } from "../lib/guardian/actionsService";

interface GroundTruthItem {
  externalId: string;
  rowNumber: number;
  errorType: string;
  expectedCategory: string;
  expectedRouting: "auto_action" | "human_validation";
  description: string;
}

interface GroundTruthFile {
  totalRows: number;
  totalErrors: number;
  errors: GroundTruthItem[];
}

/**
 * Script d'évaluation complet du Gardien de données sur 150 lignes (20 erreurs injectées).
 * Mesure : rappel (erreurs trouvées / 20), faux positifs, actions auto vs validation humaine,
 * validation coordonnées vs zone d'intervention, idempotence et isolation multitenant.
 */
async function evaluate() {
  console.log("=== ÉVALUATION DU GARDIEN DE DONNÉES (150 LIGNES / 20 ERREURS) ===\n");

  const dataDir = path.join(process.cwd(), "scripts", "data");
  const csvBuffer = fs.readFileSync(path.join(dataDir, "dataset_150.csv"));
  const truth: GroundTruthFile = JSON.parse(
    fs.readFileSync(path.join(dataDir, "verite_terrain.json"), "utf8")
  );

  // Création d'un espace dédié pour l'évaluation
  const user1 = mockDb.users[0];
  const user3 = mockDb.users[2];
  const evalSpace = guardianRepo.createSpace(
    resolveContextForUser(user1).tenantId,
    user1.id,
    "Espace Évaluation 150 lignes"
  );
  const ctx = resolveContextForUser(user1, evalSpace.id);
  const ctxOtherTenant = resolveContextForUser(user3, "space-u3-sahel");
  const ctxOtherSpaceSameTenant = resolveContextForUser(user1, "space-u1-audit");

  const csvConnector = new CsvConnector();
  const source = guardianRepo.ensureSourceForType(ctx, "csv", "Dataset 150 Évaluation");

  // 1. Première ingestion (150 lignes)
  const ingest1 = await csvConnector.ingest(
    { source, fileBuffer: csvBuffer, fileName: "dataset_150.csv" },
    ctx
  );
  assert.equal(ingest1.totalRead, 150);
  assert.equal(ingest1.insertedCount, 150);

  // 2. Exécution du Gardien autonome (moteur déterministe + agent)
  const agentRes = await runGuardianAgent(ctx, {
    sourceId: source.id,
    trigger: "upload",
    existingRunId: undefined,
  });

  const allRecords = guardianRepo.listNormalizedRecords(ctx, { includeArchived: true });
  const recordById = new Map(allRecords.map((r) => [r.id, r]));
  const anomalies = guardianRepo.listAnomalies(ctx, { runId: agentRes.run.id });
  const validations = guardianRepo.listValidations(ctx);
  const actions = guardianRepo.listAgentActions(ctx, agentRes.run.id);

  // 3. Calcul du rappel sur les 20 erreurs et des faux positifs
  const truthByKey = new Map(
    truth.errors.map((e) => [`${e.externalId}::${e.expectedCategory}`, e])
  );

  let foundErrors = 0;
  const matchedTruthKeys = new Set<string>();
  const falsePositives: Array<{ externalId: string; category: string; message: string }> = [];

  for (const anom of anomalies) {
    const rec = recordById.get(anom.recordId);
    const extId = rec?.externalId || "UNKNOWN";
    const key = `${extId}::${anom.category}`;
    if (truthByKey.has(key)) {
      if (!matchedTruthKeys.has(key)) {
        matchedTruthKeys.add(key);
        foundErrors += 1;
      }
    } else {
      falsePositives.push({
        externalId: extId,
        category: anom.category,
        message: anom.message,
      });
    }
  }

  const missedErrors = truth.errors.filter(
    (e) => !matchedTruthKeys.has(`${e.externalId}::${e.expectedCategory}`)
  );

  // Vérification spécifique : comparaison coordonnées GPS vs zone d'intervention
  const geoZoneMismatchAnoms = anomalies.filter((a) => a.ruleId === "geo_zone_mismatch");
  const geoValidations = validations.filter((v) =>
    v.title.includes("zone d'intervention")
  );

  console.log("--- 1. RÉSULTATS QUALITÉ & ROUTAGE ---");
  console.log(`Lignes ingérées           : ${ingest1.insertedCount} / 150`);
  console.log(`Erreurs trouvées sur 20   : ${foundErrors} / ${truth.totalErrors}`);
  console.log(`Faux positifs             : ${falsePositives.length}`);
  console.log(`Actions automatiques      : ${agentRes.run.autoActionsCount}`);
  console.log(`Envoyées à validation     : ${agentRes.run.pendingValidationsCount}`);
  console.log(
    `Écarts GPS/zone détectés  : ${geoZoneMismatchAnoms.length} (validations créées : ${geoValidations.length})`
  );
  console.log(`Lignes en base (0 suppr.) : ${allRecords.length}`);

  if (missedErrors.length > 0) {
    console.log("Erreurs manquées:", missedErrors);
  }
  if (falsePositives.length > 0) {
    console.log("Faux positifs détectés:", falsePositives);
  }

  assert.equal(foundErrors, 20, `Attendu 20/20 erreurs trouvées, obtenu ${foundErrors}/20`);
  assert.equal(
    falsePositives.length,
    0,
    `Attendu 0 faux positif, obtenu ${falsePositives.length}`
  );
  assert.equal(
    geoZoneMismatchAnoms.length,
    2,
    "Les 2 incohérences coordonnées vs zone d'intervention doivent être détectées"
  );
  assert.equal(
    geoValidations.length,
    4,
    "Les 4 anomalies GPS/zone d'intervention doivent être envoyées en validation humaine"
  );
  assert.equal(agentRes.run.autoActionsCount, 4, "Les 4 doublons exacts doivent être fusionnés automatiquement");
  assert.equal(
    agentRes.run.pendingValidationsCount,
    16,
    "Les 16 autres erreurs (quasi-doublons, âges, champs vides, GPS/zones) doivent aller en validation"
  );
  assert.equal(allRecords.length, 150, "Aucune suppression physique ne doit avoir lieu");

  // 4. Test d'idempotence : réingestion exacte du même fichier dataset_150.csv
  const ingest2 = await csvConnector.ingest(
    { source, fileBuffer: csvBuffer, fileName: "dataset_150.csv" },
    ctx
  );
  const recordsAfterReingest = guardianRepo.listNormalizedRecords(ctx, { includeArchived: true });
  console.log("\n--- 2. TEST D'IDEMPOTENCE ---");
  console.log(
    `2e ingestion même fichier : insérés=${ingest2.insertedCount}, ignorés=${ingest2.skippedIdempotentCount}, total=${recordsAfterReingest.length}`
  );
  assert.equal(ingest2.insertedCount, 0, "La 2e ingestion ne doit insérer aucun doublon");
  assert.equal(ingest2.skippedIdempotentCount, 150, "Les 150 lignes doivent être ignorées par idempotence");
  assert.equal(recordsAfterReingest.length, 150, "Le nombre total de lignes doit rester 150");

  // 5. Test d'isolation multitenant (tenant différent + autre espace du même tenant)
  console.log("\n--- 3. TEST D'ISOLATION MULTITENANT ---");
  assert.throws(
    () => resolveContextForUser(user3, evalSpace.id),
    TenantIsolationError,
    "Un autre tenant ne doit pas pouvoir résoudre cet espace"
  );
  assert.equal(guardianRepo.listNormalizedRecords(ctxOtherTenant, { includeArchived: true }).length, 0);
  assert.equal(guardianRepo.listAnomalies(ctxOtherTenant).length, 0);
  assert.equal(guardianRepo.listValidations(ctxOtherTenant).length, 0);
  assert.equal(guardianRepo.listAgentActions(ctxOtherTenant).length, 0);

  // Un autre espace du même tenant ne doit rien voir non plus
  const sameTenantOtherSpaceAnoms = guardianRepo
    .listAnomalies(ctxOtherSpaceSameTenant)
    .filter((a) => a.runId === agentRes.run.id);
  assert.equal(sameTenantOtherSpaceAnoms.length, 0);

  const anyReversibleAction = actions.find((a) => a.reversible);
  assert.ok(anyReversibleAction, "Au moins une action réversible attendue");
  assert.throws(
    () => rollbackAgentAction(ctxOtherTenant, anyReversibleAction.id),
    "Un autre tenant ne doit pas pouvoir annuler une action de cet espace"
  );
  console.log("[OK] Aucune fuite inter-tenant ni inter-espace détectée.");
  console.log("\nÉVALUATION ÉTAPE 5 RÉUSSIE : 20/20 erreurs, 0 faux positif, idempotence et isolation validées.");
}

evaluate().catch((err) => {
  console.error("Échec de l'évaluation:", err);
  process.exit(1);
});
