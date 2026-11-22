import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockDb } from "../lib/server/mockDb";
import { resolveContextForUser } from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import { CommCareConnector, CsvConnector, GenericConnector } from "../lib/guardian/connectors/index";

/**
 * Vérifie que la double ingestion d'un même fichier ou flux API est 100 % idempotente.
 */
async function main() {
  const user1 = mockDb.users[0];
  const space = guardianRepo.createSpace(
    resolveContextForUser(user1).tenantId,
    user1.id,
    "Espace Test Idempotence"
  );
  const ctx = resolveContextForUser(user1, space.id);

  // 1. Idempotence CSV (150 lignes)
  const csvBuffer = fs.readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "donnees_fictives.csv")
  );
  const csvSource = guardianRepo.ensureSourceForType(ctx, "csv", "CSV Idempotence");
  const csv = new CsvConnector();

  const r1 = await csv.ingest({ source: csvSource, fileBuffer: csvBuffer, fileName: "donnees_fictives.csv" }, ctx);
  const r2 = await csv.ingest({ source: csvSource, fileBuffer: csvBuffer, fileName: "donnees_fictives.csv" }, ctx);
  assert.equal(r1.insertedCount, 150);
  assert.equal(r2.insertedCount, 0);
  assert.equal(r2.skippedIdempotentCount, 150);

  // 2. Idempotence CommCare & Kobo/ODK
  const ccSource = guardianRepo.ensureSourceForType(ctx, "commcare", "CommCare Idempotence");
  const cc = new CommCareConnector();
  const ccPayload = [
    { id: "cc-1", received_on: "2026-11-01T10:00:00Z", form: { full_name: "Awa", zone: "Dakar" } },
  ];
  const cc1 = await cc.ingest({ source: ccSource, rawItems: ccPayload }, ctx);
  const cc2 = await cc.ingest({ source: ccSource, rawItems: ccPayload }, ctx);
  const cc3 = await cc.ingest(
    {
      source: ccSource,
      rawItems: [{ ...ccPayload[0], received_on: "2026-11-01T10:00:00Z" }],
    },
    ctx
  );
  assert.equal(cc1.insertedCount, 1);
  assert.equal(cc2.insertedCount, 0);
  assert.equal(cc3.insertedCount, 0);

  // Même payload exact (sans received_on pour contourner le curseur de date) -> ignoré par payloadHash
  const ccNoDate = [{ id: "cc-2", form: { full_name: "Binta", zone: "Dakar" } }];
  const cc4 = await cc.ingest({ source: ccSource, rawItems: ccNoDate }, ctx);
  const cc5 = await cc.ingest({ source: ccSource, rawItems: ccNoDate }, ctx);
  assert.equal(cc4.insertedCount, 1);
  assert.equal(cc5.insertedCount, 0);
  assert.equal(cc5.skippedIdempotentCount, 1);

  const genSource = guardianRepo.ensureSourceForType(ctx, "generic", "Kobo Idempotence", {
    format: "kobo",
  });
  const gen = new GenericConnector();
  const koboPayload = [{ _id: "kb-1", nom: "Moussa", zone: "Thiès" }];
  const g1 = await gen.ingest({ source: genSource, rawItems: koboPayload }, ctx);
  const g2 = await gen.ingest({ source: genSource, rawItems: koboPayload }, ctx);
  assert.equal(g1.insertedCount, 1);
  assert.equal(g2.insertedCount, 0);
  assert.equal(g2.skippedIdempotentCount, 1);

  console.log("[idempotence.test.ts] Idempotence CSV, CommCare et Kobo/ODK validée.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
