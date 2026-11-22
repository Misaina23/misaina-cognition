import assert from "node:assert/strict";
import { mockDb } from "../lib/server/mockDb";
import { resolveContextForUser } from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import { CsvConnector } from "../lib/guardian/connectors/index";
import { executeDeterministicRun } from "../lib/guardian/triggers";
import { runNightlyCheckAllSpaces } from "../lib/guardian/scheduler";

async function runTests() {
  console.log("=== TEST ÉTAPE 2 : Moteur déterministe YAML, Quasi-doublons & Déclencheurs ===");

  const user1 = mockDb.users[0]; // u-1
  const user3 = mockDb.users[2]; // u-3

  const ctxSpaceA = resolveContextForUser(user1, "space-u1-audit");
  const ctxU3 = resolveContextForUser(user3, "space-u3-sahel");

  // 1. Personnalisation des règles YAML pour ce projet uniquement
  const customYaml = `version: 1
projectName: "Enquête WASH Dakar"
requiredFields:
  - field: fullName
    severity: bloquante
    label: "Nom complet"
  - field: zone
    severity: a_verifier
    label: "Zone"
ranges:
  age:
    min: 0
    max: 105
    severity: bloquante
  amount:
    min: 0
    max: 10000
    severity: a_verifier
  recordedAt:
    minYear: 2020
    allowFutureDays: 1
    severity: mineure
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
  exactBusinessKeyFields:
    - fullName
    - phone
  exactSeverity: bloquante
  nearDuplicate:
    enabled: true
    autoMergeThreshold: 0.95
    reviewThreshold: 0.80
    severity: a_verifier
`;
  const savedRules = guardianRepo.setProjectRulesYaml(ctxSpaceA, customYaml);
  assert.equal(savedRules.config.projectName, "Enquête WASH Dakar");
  assert.throws(
    () => guardianRepo.setProjectRulesYaml(ctxSpaceA, "not: [valid: yaml"),
    "Un YAML malformé doit être rejeté"
  );
  console.log("[OK] Chargement et validation Zod du YAML projet validés.");

  // 2. Ingestion d'un CSV contenant des cas de test déterministes
  const csvConnector = new CsvConnector();
  const source = guardianRepo.ensureSourceForType(ctxSpaceA, "csv", "CSV Test Étape 2");
  const csvData = Buffer.from(
    "id;full_name;telephone;age;montant;date;lat;lon;zone\n" +
      "R1;Aminata Diallo;+221771112233;29;150;2026-10-12;14.6928;-17.4467;Dakar\n" +
      "R2;Aminata Diallo;00221771112233;29;150;2026-10-12;14.6928;-17.4467;Dakar\n" + // Doublon exact clé métier
      "R3;Aminta Dialo;+221771112233;29;150;2026-10-12;14.6928;-17.4467;Dakar\n" + // Quasi-doublon (faute de frappe + même tel)
      "R4;Moussa Koné;+221774445566;185;200;2026-10-12;14.7100;-17.4500;Thiès\n" + // Âge aberrant (185)
      "R5;;+221778889900;40;500;2026-10-12;14.7000;-17.4000;\n" + // Champs obligatoires vides (fullName + zone)
      "R6;Ibrahima Sow;+221779990011;35;500;2026-10-12;48.8566;2.3522;Paris\n", // GPS hors zone Sénégal
    "utf8"
  );

  const ingestRes = await csvConnector.ingest(
    { source, fileBuffer: csvData, fileName: "test_regles.csv" },
    ctxSpaceA
  );
  assert.equal(ingestRes.insertedCount, 6);

  // 3. Exécution du contrôle déterministe (déclencheur upload)
  const { run, anomaliesCount } = executeDeterministicRun(ctxSpaceA, {
    sourceId: source.id,
    trigger: "upload",
    recordsIngested: ingestRes.insertedCount,
  });

  assert.ok(run.id.startsWith("run-"));
  assert.equal(run.recordsProcessed, 6);
  assert.ok(anomaliesCount >= 6, `Au moins 6 anomalies attendues, reçu ${anomaliesCount}`);

  const anomalies = guardianRepo.listAnomalies(ctxSpaceA, { runId: run.id });
  const categories = new Set(anomalies.map((a) => a.category));
  assert.ok(categories.has("exact_duplicate"), "Doublon exact non détecté");
  assert.ok(categories.has("near_duplicate"), "Quasi-doublon non détecté");
  assert.ok(categories.has("outlier"), "Valeur aberrante (âge) non détectée");
  assert.ok(categories.has("missing_required"), "Champ obligatoire vide non détecté");
  assert.ok(categories.has("geo_out_of_bounds"), "GPS hors zone non détecté");
  console.log(
    `[OK] Moteur déterministe : ${anomalies.length} anomalies détectées (bloquante=${run.anomaliesBySeverity.bloquante}, a_verifier=${run.anomaliesBySeverity.a_verifier}, mineure=${run.anomaliesBySeverity.mineure}).`
  );

  // 4. Vérification tâche planifiée nocturne + isolation
  const nightly = runNightlyCheckAllSpaces();
  assert.ok(nightly.spacesChecked >= 1);
  assert.ok(nightly.runs.some((r) => r.trigger === "nightly_schedule" && r.spaceId === ctxSpaceA.spaceId));
  assert.equal(
    guardianRepo.listAnomalies(ctxU3).length,
    0,
    "Aucune anomalie de space-u1-audit ne doit fuir vers u-3"
  );
  console.log("[OK] Tâche nocturne & isolation des anomalies validées.");

  console.log("\nTous les tests de l'Étape 2 ont réussi !");
}

runTests().catch((err) => {
  console.error("Échec du test Étape 2:", err);
  process.exit(1);
});
