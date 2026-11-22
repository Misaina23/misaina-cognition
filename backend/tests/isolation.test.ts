import assert from "node:assert/strict";
import path from "node:path";
import { runGuardianAgent } from "../src/agent/agent";
import { CsvConnector } from "../src/connectors/csv";
import { getSpaceDiskDirs, journalRepo, rollbackAgentAction } from "../src/journal";
import {
  createUserSpace,
  getPrincipalByIdOrHeader,
  resolveContextForUser,
  TenantIsolationError,
} from "../src/tenant";
import { processInboxFilePath } from "../src/worker";

async function main() {
  const user1 = getPrincipalByIdOrHeader("u-1");
  const user3 = getPrincipalByIdOrHeader("u-3");
  const spaceA = createUserSpace(resolveContextForUser(user1).tenantId, user1.id, "Espace Isolé A");
  const ctxA = resolveContextForUser(user1, spaceA.id);
  const ctxU3 = resolveContextForUser(user3, "space-u3-sahel");

  const csv = new CsvConnector();
  const src = journalRepo.ensureSourceForType(ctxA, "csv", "Source Isolée");
  await csv.ingest(
    {
      source: src,
      fileBuffer: Buffer.from(
        "id;full_name;telephone;age;lat;lon;zone\n" +
          "I1;Fatou Sow;+221771112233;30;14.70;-17.44;Dakar\n" +
          "I2;Fatou Sow;00221771112233;30;14.70;-17.44;Dakar\n",
        "utf8"
      ),
      fileName: "isolation.csv",
    },
    ctxA
  );

  const res = await runGuardianAgent(ctxA, { sourceId: src.id, trigger: "upload" });
  const reversible = journalRepo.listAgentActions(ctxA, res.run.id).find((a) => a.reversible);
  assert.ok(reversible);

  assert.throws(() => resolveContextForUser(user3, spaceA.id), TenantIsolationError);
  assert.equal(journalRepo.listNormalizedRecords(ctxU3, { includeArchived: true }).length, 0);
  assert.equal(journalRepo.listAnomalies(ctxU3).length, 0);
  assert.equal(journalRepo.listValidations(ctxU3).length, 0);
  assert.equal(journalRepo.listAgentActions(ctxU3).length, 0);
  assert.throws(() => rollbackAgentAction(ctxU3, reversible.id));

  const dirsA = getSpaceDiskDirs(ctxA);
  const dirsU3 = getSpaceDiskDirs(ctxU3);
  assert.notEqual(dirsA.inboxDir, dirsU3.inboxDir);
  const badInbox = await processInboxFilePath(
    path.join(process.cwd(), "backend", "data", "inbox", "fake-tenant", "fake-space", "x.csv")
  );
  assert.equal(badInbox, false);

  console.log("[backend/tests/isolation.test.ts] Isolation multitenant strictement prouvée.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
