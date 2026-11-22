import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CommCareConnector } from "../src/connectors/commcare";
import { CsvConnector } from "../src/connectors/csv";
import { GenericConnector } from "../src/connectors/generic";
import { journalRepo } from "../src/journal";
import { createUserSpace, getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

function getFixturesDir(): string {
  const cwd = process.cwd();
  const direct = path.join(cwd, "tests", "fixtures");
  if (fs.existsSync(direct)) return direct;
  return path.join(cwd, "backend", "tests", "fixtures");
}

async function main() {
  const user = getPrincipalByIdOrHeader("u-1");
  const baseCtx = resolveContextForUser(user);
  const space = createUserSpace(baseCtx.tenantId, user.id, "Espace Idempotence Backend");
  const ctx = resolveContextForUser(user, space.id);

  const csvBuf = fs.readFileSync(path.join(getFixturesDir(), "donnees_fictives.csv"));
  const csvSrc = journalRepo.ensureSourceForType(ctx, "csv", "CSV Idempotence");
  const csv = new CsvConnector();
  const r1 = await csv.ingest({ source: csvSrc, fileBuffer: csvBuf, fileName: "donnees_fictives.csv" }, ctx);
  const r2 = await csv.ingest({ source: csvSrc, fileBuffer: csvBuf, fileName: "donnees_fictives.csv" }, ctx);
  assert.equal(r1.insertedCount, 150);
  assert.equal(r2.insertedCount, 0);
  assert.equal(r2.skippedIdempotentCount, 150);

  const ccSrc = journalRepo.ensureSourceForType(ctx, "commcare", "CommCare Idempotence");
  const cc = new CommCareConnector();
  const ccNoDate = [{ id: "cc-idemp-1", form: { full_name: "Awa", zone: "Dakar" } }];
  const c1 = await cc.ingest({ source: ccSrc, rawItems: ccNoDate }, ctx);
  const c2 = await cc.ingest({ source: ccSrc, rawItems: ccNoDate }, ctx);
  assert.equal(c1.insertedCount, 1);
  assert.equal(c2.insertedCount, 0);
  assert.equal(c2.skippedIdempotentCount, 1);

  const genSrc = journalRepo.ensureSourceForType(ctx, "generic", "Kobo Idempotence", { format: "kobo" });
  const gen = new GenericConnector();
  const kobo = [{ _id: "kb-1", nom: "Moussa", zone: "Thiès" }];
  const g1 = await gen.ingest({ source: genSrc, rawItems: kobo }, ctx);
  const g2 = await gen.ingest({ source: genSrc, rawItems: kobo }, ctx);
  assert.equal(g1.insertedCount, 1);
  assert.equal(g2.insertedCount, 0);
  assert.equal(g2.skippedIdempotentCount, 1);

  console.log("[backend/tests/idempotence.test.ts] Idempotence CSV, CommCare et Kobo/ODK validée.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
