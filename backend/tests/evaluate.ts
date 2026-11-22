import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runGuardianAgent } from "../src/agent/agent";
import { CsvConnector } from "../src/connectors/csv";
import { journalRepo } from "../src/journal";
import { createUserSpace, getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

interface GroundTruthFile {
  totalRows: number;
  totalErrors: number;
  errors: Array<{ externalId: string; expectedCategory: string }>;
}

function getFixturesDir(): string {
  const cwd = process.cwd();
  const direct = path.join(cwd, "tests", "fixtures");
  if (fs.existsSync(direct)) return direct;
  return path.join(cwd, "backend", "tests", "fixtures");
}

async function main() {
  const fixturesDir = getFixturesDir();
  const csvBuffer = fs.readFileSync(path.join(fixturesDir, "donnees_fictives.csv"));
  const truth: GroundTruthFile = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "verite_terrain.json"), "utf8")
  );

  const user = getPrincipalByIdOrHeader("u-1");
  const baseCtx = resolveContextForUser(user);
  const evalSpace = createUserSpace(baseCtx.tenantId, user.id, "Espace Évaluation Backend");
  const ctx = resolveContextForUser(user, evalSpace.id);

  const connector = new CsvConnector();
  const source = journalRepo.ensureSourceForType(ctx, "csv", "Données Fictives 150");
  await connector.ingest({ source, fileBuffer: csvBuffer, fileName: "donnees_fictives.csv" }, ctx);

  const res = await runGuardianAgent(ctx, { sourceId: source.id, trigger: "upload" });
  const records = journalRepo.listNormalizedRecords(ctx, { includeArchived: true });
  const recById = new Map(records.map((r) => [r.id, r]));
  const anomalies = journalRepo.listAnomalies(ctx, { runId: res.run.id });

  const truthKeys = new Set(truth.errors.map((e) => `${e.externalId}::${e.expectedCategory}`));
  const foundKeys = new Set<string>();
  let falsePositives = 0;

  for (const a of anomalies) {
    const extId = recById.get(a.recordId)?.externalId || "";
    const k = `${extId}::${a.category}`;
    if (truthKeys.has(k)) foundKeys.add(k);
    else falsePositives += 1;
  }

  console.log(
    `[backend/tests/evaluate.ts] Erreurs=${foundKeys.size}/${truth.totalErrors}, FauxPositifs=${falsePositives}, Auto=${res.run.autoActionsCount}, Validation=${res.run.pendingValidationsCount}`
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
