import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockDb } from "../lib/server/mockDb";
import { resolveContextForUser } from "../lib/guardian/tenantContext";
import { guardianRepo } from "../lib/guardian/repository";
import { CsvConnector } from "../lib/guardian/connectors/index";
import { runGuardianAgent } from "../lib/guardian/agentRunner";

interface GroundTruthItem {
  externalId: string;
  expectedCategory: string;
}

interface GroundTruthFile {
  totalRows: number;
  totalErrors: number;
  errors: GroundTruthItem[];
}

/**
 * Évaluation sur tests/fixtures/donnees_fictives.csv + verite_terrain.json.
 */
async function main() {
  const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
  const csvBuffer = fs.readFileSync(path.join(fixturesDir, "donnees_fictives.csv"));
  const truth: GroundTruthFile = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "verite_terrain.json"), "utf8")
  );

  const user1 = mockDb.users[0];
  const space = guardianRepo.createSpace(
    resolveContextForUser(user1).tenantId,
    user1.id,
    "Espace Evaluate Fixtures"
  );
  const ctx = resolveContextForUser(user1, space.id);
  const connector = new CsvConnector();
  const source = guardianRepo.ensureSourceForType(ctx, "csv", "Fixtures CSV");

  await connector.ingest({ source, fileBuffer: csvBuffer, fileName: "donnees_fictives.csv" }, ctx);
  const res = await runGuardianAgent(ctx, { sourceId: source.id, trigger: "upload" });

  const records = guardianRepo.listNormalizedRecords(ctx, { includeArchived: true });
  const recById = new Map(records.map((r) => [r.id, r]));
  const anomalies = guardianRepo.listAnomalies(ctx, { runId: res.run.id });

  const truthKeys = new Set(truth.errors.map((e) => `${e.externalId}::${e.expectedCategory}`));
  const foundKeys = new Set<string>();
  let falsePositives = 0;

  for (const a of anomalies) {
    const extId = recById.get(a.recordId)?.externalId || "";
    const k = `${extId}::${a.category}`;
    if (truthKeys.has(k)) {
      foundKeys.add(k);
    } else {
      falsePositives += 1;
    }
  }

  console.log(
    `[evaluate.ts] Trouvées=${foundKeys.size}/${truth.totalErrors}, FauxPositifs=${falsePositives}, Auto=${res.run.autoActionsCount}, Validation=${res.run.pendingValidationsCount}`
  );
  assert.equal(foundKeys.size, 20);
  assert.equal(falsePositives, 0);
  assert.equal(res.run.autoActionsCount, 4);
  assert.equal(res.run.pendingValidationsCount, 16);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
