import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockDb } from "../lib/server/mockDb";
import { resolveContextForUser, TenantIsolationError } from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import { CsvConnector } from "../lib/guardian/connectors/index";
import { runGuardianAgent } from "../lib/guardian/agentRunner";
import { rollbackAgentAction } from "../lib/guardian/actionsService";
import { getSpaceDiskDirs } from "../lib/guardian/diskStorage";
import { processInboxFilePath } from "../lib/guardian/scheduler";

/**
 * Prouve qu'aucun tenant ou espace ne peut lire, ingérer ou modifier les données d'un autre.
 */
async function main() {
  const user1 = mockDb.users[0];
  const user3 = mockDb.users[2];

  const spaceA = guardianRepo.createSpace(
    resolveContextForUser(user1).tenantId,
    user1.id,
    "Espace Isolé A"
  );
  const ctxA = resolveContextForUser(user1, spaceA.id);
  const ctxU3 = resolveContextForUser(user3, "space-u3-sahel");

  // Ingestion dans Espace A
  const csv = new CsvConnector();
  const srcA = guardianRepo.ensureSourceForType(ctxA, "csv", "Source Isolée A");
  await csv.ingest(
    {
      source: srcA,
      fileBuffer: Buffer.from(
        "id;full_name;telephone;age;lat;lon;zone\n" +
          "X1;Fatou Sow;+221771112233;30;14.70;-17.44;Dakar\n" +
          "X2;Fatou Sow;00221771112233;30;14.70;-17.44;Dakar\n",
        "utf8"
      ),
      fileName: "isolation.csv",
    },
    ctxA
  );
  const agentRes = await runGuardianAgent(ctxA, { sourceId: srcA.id, trigger: "upload" });
  const reversibleAction = guardianRepo
    .listAgentActions(ctxA, agentRes.run.id)
    .find((a) => a.reversible);
  assert.ok(reversibleAction);

  // 1. User 3 ne peut pas résoudre spaceA
  assert.throws(() => resolveContextForUser(user3, spaceA.id), TenantIsolationError);

  // 2. User 3 ne voit ni enregistrements, ni anomalies, ni validations, ni actions de spaceA
  assert.equal(guardianRepo.listNormalizedRecords(ctxU3, { includeArchived: true }).length, 0);
  assert.equal(guardianRepo.listAnomalies(ctxU3).length, 0);
  assert.equal(guardianRepo.listValidations(ctxU3).length, 0);
  assert.equal(guardianRepo.listAgentActions(ctxU3).length, 0);

  // 3. User 3 ne peut pas annuler une action de spaceA
  assert.throws(() => rollbackAgentAction(ctxU3, reversibleAction.id));

  // 4. Vérifie le cloisonnement disque data/inbox/<tenantId>/<spaceId> et rejet de chemin invalide
  const dirsA = getSpaceDiskDirs(ctxA);
  const dirsU3 = getSpaceDiskDirs(ctxU3);
  assert.notEqual(dirsA.inboxDir, dirsU3.inboxDir);
  assert.ok(dirsA.inboxDir.includes(spaceA.id));
  const bogusProcessed = await processInboxFilePath(
    path.join(process.cwd(), "data", "inbox", "fake-tenant", "fake-space", "hack.csv")
  );
  assert.equal(bogusProcessed, false);

  // Nettoyage éventuel des dossiers créés dans data/
  fs.rmSync(path.join(process.cwd(), "data", "quarantine", ctxA.tenantId, ctxA.spaceId), {
    recursive: true,
    force: true,
  });

  console.log("[isolation.test.ts] Isolation multitenant (mémoire, API, rollback et disque) prouvée.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
