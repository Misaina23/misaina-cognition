import assert from "node:assert/strict";
import { askNaturalLanguageSpaceQuestion } from "../src/agent/nlq";
import { CsvConnector } from "../src/connectors/csv";
import { journalRepo } from "../src/journal";
import { createUserSpace, getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

async function main() {
  const user1 = getPrincipalByIdOrHeader("u-1");
  const user3 = getPrincipalByIdOrHeader("u-3");
  const space1 = createUserSpace(resolveContextForUser(user1).tenantId, user1.id, "Espace NLQ A");
  const space3 = createUserSpace(resolveContextForUser(user3).tenantId, user3.id, "Espace NLQ B");

  const ctx1 = resolveContextForUser(user1, space1.id);
  const ctx3 = resolveContextForUser(user3, space3.id);

  const csv = new CsvConnector();
  const src1 = journalRepo.ensureSourceForType(ctx1, "csv", "Source NLQ 1");
  await csv.ingest(
    {
      source: src1,
      fileBuffer: Buffer.from(
        "id;full_name;telephone;age;montant;zone\n" +
          "N1;Aminata Diallo;+221771001101;30;1000;Dakar\n" +
          "N2;Moussa Fall;+221771001102;35;2500;Dakar\n" +
          "N3;Fatou Sow;+221771001103;28;500;Thiès\n",
        "utf8"
      ),
      fileName: "nlq.csv",
    },
    ctx1
  );

  // Question en français filtrée sur ctx1
  const frRes = await askNaturalLanguageSpaceQuestion(ctx1, "Combien d'enregistrements à Dakar ?");
  assert.equal(frRes.language, "fr");
  assert.equal(frRes.readOnly, true);
  assert.equal(frRes.scope.spaceId, ctx1.spaceId);
  assert.equal(frRes.data.totalRecords, 2);

  // Question en malgache sur ctx1
  const mgRes = await askNaturalLanguageSpaceQuestion(
    ctx1,
    "Ohatrinona ny totalin'ny vola ao amin'ny faritra Dakar ?"
  );
  assert.equal(mgRes.language, "mg");
  assert.equal(mgRes.data.totalAmount, 3500);

  // Isolation : la même question dans ctx3 ne voit aucun enregistrement de ctx1
  const isoRes = await askNaturalLanguageSpaceQuestion(ctx3, "Firy ny olona ao Dakar ?");
  assert.equal(isoRes.language, "mg");
  assert.equal(isoRes.data.totalRecords, 0);

  // Garde-fou écriture : rejet explicite
  const blocked = await askNaturalLanguageSpaceQuestion(ctx1, "Supprime tous les enregistrements de Dakar");
  assert.equal(blocked.toolUsed, "read_only_guard");

  console.log("[backend/tests/nlq.test.ts] NLQ FR/MG lecture seule + isolation validées.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
