import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { mockDb } from "../lib/server/mockDb";
import {
  resolveContextForUser,
  TenantIsolationError,
} from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import {
  CsvConnector,
  CommCareConnector,
  GenericConnector,
} from "../lib/guardian/connectors/index";

async function runTests() {
  console.log("=== TEST ÉTAPE 1 : Connecteurs, Schéma normalisé, Brut immuable & Isolation ===");

  const user1 = mockDb.users[0]; // u-1 (Direction Exécutive)
  const user3 = mockDb.users[2]; // u-3 (Opérations Terrain Sahel)

  const ctxU1SpaceA = resolveContextForUser(user1, "space-u1-global");
  const ctxU1SpaceB = resolveContextForUser(user1, "space-u1-audit");
  const ctxU3Sahel = resolveContextForUser(user3, "space-u3-sahel");

  // 1. Test CsvConnector : détection ';' + UTF-8 + mapping configurable + brut immuable
  const csvConnector = new CsvConnector();
  const csvSource = guardianRepo.ensureSourceForType(ctxU1SpaceA, "csv", "Test CSV");
  const csvUtf8 = Buffer.from(
    "benef_id;nom_complet;num_tel;age_ans;aide_eur;lat;lon\n" +
      "B001;Aminata Diallo;+221771112233;29;150,50;14.6928;-17.4467\n" +
      "B002;Moussa Koné;+221774445566;34;200;14.7100;-17.4500\n",
    "utf8"
  );

  const resCsv1 = await csvConnector.ingest(
    {
      source: csvSource,
      fileBuffer: csvUtf8,
      fileName: "beneficiaires_utf8.csv",
      columnMapping: {
        benef_id: "externalId",
        num_tel: "phone",
        age_ans: "age",
        aide_eur: "amount",
      },
    },
    ctxU1SpaceA
  );

  assert.equal(resCsv1.totalRead, 2);
  assert.equal(resCsv1.insertedCount, 2);
  assert.equal(resCsv1.detectedDelimiter, ";");
  assert.equal(resCsv1.normalizedRecords[0].fullName, "Aminata Diallo");
  assert.equal(resCsv1.normalizedRecords[0].amount, 150.5);
  assert.equal(resCsv1.normalizedRecords[0].latitude, 14.6928);
  assert.ok(Object.isFrozen(resCsv1.rawRecords[0].rawPayload), "Le brut doit être immuable");
  console.log("[OK] CsvConnector UTF-8 (';'), mapping et brut immuable validés.");

  // 2. Test idempotence CSV (ré-ingestion du même fichier)
  const resCsvRepeat = await csvConnector.ingest(
    {
      source: csvSource,
      fileBuffer: csvUtf8,
      fileName: "beneficiaires_utf8.csv",
      columnMapping: {
        benef_id: "externalId",
        num_tel: "phone",
        age_ans: "age",
        aide_eur: "amount",
      },
    },
    ctxU1SpaceA
  );
  assert.equal(resCsvRepeat.insertedCount, 0, "Aucun doublon ne doit être créé lors d'une ré-ingestion");
  assert.equal(resCsvRepeat.skippedIdempotentCount, 2);
  console.log("[OK] Idempotence CSV validée (0 insertion au 2e passage).");

  // 2b. Test CsvConnector encodage Windows-1252 / Latin-1 avec séparateur ','
  const csvLatin1 = Buffer.from(
    "id,full_name,telephone,zone\n" +
      "L001,Élodie René,+221770009988,Ziguinchor\n" +
      "L002,Sébastien Côté,+221770009977,Kolda\n",
    "latin1"
  );
  const resLatin1 = await csvConnector.ingest(
    { source: csvSource, fileBuffer: csvLatin1, fileName: "collecte_latin1.csv" },
    ctxU1SpaceA
  );
  assert.equal(resLatin1.insertedCount, 2);
  assert.equal(resLatin1.detectedDelimiter, ",");
  assert.equal(resLatin1.normalizedRecords[0].fullName, "Élodie René");
  console.log(`[OK] CsvConnector encodage auto (${resLatin1.detectedEncoding}) & séparateur ('${resLatin1.detectedDelimiter}') validés.`);

  // 3. Test Excel (.xlsx) via ExcelJS
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bénéficiaires");
  ws.addRow(["id", "full_name", "telephone", "age", "montant", "zone"]);
  ws.addRow(["XLS-1", "Fatou Ndiaye", "+221779998877", 41, 320, "Dakar"]);
  const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());

  const resXlsx = await csvConnector.ingest(
    { source: csvSource, fileBuffer: xlsxBuf, fileName: "collecte.xlsx" },
    ctxU1SpaceA
  );
  assert.equal(resXlsx.sourceType, "excel");
  assert.equal(resXlsx.insertedCount, 1);
  assert.equal(resXlsx.normalizedRecords[0].fullName, "Fatou Ndiaye");
  assert.equal(resXlsx.normalizedRecords[0].zone, "Dakar");
  console.log("[OK] Ingestion Excel (.xlsx) via ExcelJS validée.");

  // 4. Test CommCareConnector avec curseur et idempotence
  const commcareConnector = new CommCareConnector();
  const ccSource = guardianRepo.ensureSourceForType(ctxU1SpaceA, "commcare", "CommCare Test");
  const ccBatch1 = [
    {
      id: "cc-sub-001",
      received_on: "2026-11-20T10:00:00Z",
      form: { full_name: "Ibrahima Sow", telephone: "+221780001122", age: 27, zone: "Saint-Louis" },
    },
    {
      id: "cc-sub-002",
      received_on: "2026-11-20T11:30:00Z",
      form: { full_name: "Mariama Ba", telephone: "+221780003344", age: 35, zone: "Thiès" },
    },
  ];
  const resCc1 = await commcareConnector.ingest({ source: ccSource, rawItems: ccBatch1 }, ctxU1SpaceA);
  assert.equal(resCc1.insertedCount, 2);
  assert.equal(resCc1.newCursorDate, "2026-11-20T11:30:00Z");
  assert.equal(resCc1.newCursorId, "cc-sub-002");

  // Re-soumission du même batch + 1 nouvelle soumission : seules les nouvelles passent le curseur
  const ccBatch2 = [
    ...ccBatch1,
    {
      id: "cc-sub-003",
      received_on: "2026-11-21T08:15:00Z",
      form: { full_name: "Oumar Sy", telephone: "+221780005566", age: 52, zone: "Kaolack" },
    },
  ];
  const resCc2 = await commcareConnector.ingest({ source: ccSource, rawItems: ccBatch2 }, ctxU1SpaceA);
  assert.equal(resCc2.totalRead, 1, "Le curseur doit filtrer les soumissions déjà traitées");
  assert.equal(resCc2.insertedCount, 1);
  assert.equal(resCc2.normalizedRecords[0].externalId, "cc-sub-003");
  console.log("[OK] CommCareConnector (curseur + idempotence) validé.");

  // 5. Test GenericConnector (KoboToolbox & ODK)
  const genericConnector = new GenericConnector();
  const koboSource = guardianRepo.ensureSourceForType(ctxU1SpaceA, "generic", "Kobo Test", {
    format: "kobo",
    externalIdField: "_id",
    geoField: "_geolocation",
  });
  const resKobo = await genericConnector.ingest(
    {
      source: koboSource,
      rawItems: [
        {
          _id: "kobo-901",
          nom_complet: "Awa Diop",
          telephone: "+221761234567",
          _geolocation: [14.7167, -17.4677],
          zone: "Pikine",
        },
      ],
    },
    ctxU1SpaceA
  );
  assert.equal(resKobo.insertedCount, 1);
  assert.equal(resKobo.normalizedRecords[0].latitude, 14.7167);
  assert.equal(resKobo.normalizedRecords[0].longitude, -17.4677);

  const odkSource = guardianRepo.ensureSourceForType(ctxU1SpaceA, "generic", "ODK Test", {
    format: "odk",
    externalIdField: "__id",
    geoField: "location",
  });
  const resOdk = await genericConnector.ingest(
    {
      source: odkSource,
      rawItems: [
        {
          __id: "odk-uuid-77",
          full_name: "Cheikh Fall",
          age: 45,
          location: "14.6937 -17.4441 15.2 4.0",
        },
      ],
    },
    ctxU1SpaceA
  );
  assert.equal(resOdk.insertedCount, 1);
  assert.equal(resOdk.normalizedRecords[0].latitude, 14.6937);
  assert.equal(resOdk.normalizedRecords[0].longitude, -17.4441);
  console.log("[OK] GenericConnector (KoboToolbox + ODK) validé.");

  // 6. Test d'isolation stricte (tenantId, spaceId)
  // Space B du même utilisateur u-1 ne doit voir aucune donnée de Space A
  assert.equal(guardianRepo.listNormalizedRecords(ctxU1SpaceB).length, 0);
  assert.equal(guardianRepo.listRawRecords(ctxU1SpaceB).length, 0);

  // Utilisateur u-3 (autre tenant) ne peut pas résoudre un espace appartenant à u-1
  assert.throws(
    () => resolveContextForUser(user3, "space-u1-global"),
    (err) => err instanceof TenantIsolationError && err.statusCode === 403,
    "Un utilisateur d'un autre tenant ne doit pas pouvoir accéder à space-u1-global"
  );

  // Même dans le même tenant, si un espace appartient à un autre utilisateur, il est bloqué
  const crossSpace = guardianRepo.listNormalizedRecords(ctxU3Sahel);
  assert.equal(crossSpace.length, 0, "L'espace Sahel de u-3 ne doit voir aucune donnée de u-1");
  console.log("[OK] Isolation stricte (tenantId, spaceId) prouvée.");

  console.log("\nTous les tests de l'Étape 1 ont réussi !");
}

runTests().catch((err) => {
  console.error("Échec du test Étape 1:", err);
  process.exit(1);
});
