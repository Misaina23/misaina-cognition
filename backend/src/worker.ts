import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import cron, { type ScheduledTask } from "node-cron";
import { executeDeterministicRun, runGuardianAgent } from "./agent/agent";
import { CommCareConnector } from "./connectors/commcare";
import { CsvConnector } from "./connectors/csv";
import { ExcelConnector } from "./connectors/excel";
import { GenericConnector } from "./connectors/generic";
import type { DataRun, TenantSpaceContext } from "./connectors/types";
import { ensureSpaceDirectories, getInboxBaseDir, journalRepo, moveInboxFile } from "./journal";
import { tenantSpacesRegistry } from "./tenant";

let cronTask: ScheduledTask | undefined;
let pollTask: ScheduledTask | undefined;
let inboxWatcher: FSWatcher | undefined;
const processingFiles = new Set<string>();

function getInboxRoot(): string {
  return getInboxBaseDir();
}

export function runNightlyCheckAllSpaces(
  targetContexts?: TenantSpaceContext[]
): {
  executedAt: string;
  spacesChecked: number;
  runs: DataRun[];
} {
  const runs: DataRun[] = [];
  const contexts = targetContexts ?? journalRepo.listAllSpaceContexts();
  for (const ctx of contexts) {
    const active = journalRepo.listNormalizedRecords(ctx, { includeArchived: false });
    if (active.length === 0) continue;
    const sourceId = journalRepo.listSources(ctx)[0]?.id ?? "nightly-check";
    const { run } = executeDeterministicRun(ctx, { sourceId, trigger: "nightly_schedule" });
    runs.push(run);
  }
  return { executedAt: new Date().toISOString(), spacesChecked: runs.length, runs };
}

/**
 * Synchronisation autonome des connecteurs API (CommCare, Kobo, ODK) configurés avec endpointUrl.
 */
export async function pollApiSourcesAllSpaces(
  targetContexts?: TenantSpaceContext[]
): Promise<{
  polledAt: string;
  sourcesPolled: number;
  runsTriggered: number;
}> {
  await journalRepo.ensureReady();
  let sourcesPolled = 0;
  let runsTriggered = 0;

  const contexts = targetContexts ?? journalRepo.listAllSpaceContexts();
  for (const ctx of contexts) {
    for (const src of journalRepo.listSources(ctx)) {
      if (src.status !== "ACTIVE") continue;
      if (src.type !== "commcare" && src.type !== "generic") continue;
      if (src.type === "generic" && !src.endpointUrl) continue;
      if (
        src.type === "commcare" &&
        !src.endpointUrl &&
        (!process.env.COMMCARE_DOMAIN || !process.env.COMMCARE_USERNAME || !process.env.COMMCARE_API_KEY)
      ) {
        continue;
      }

      try {
        const connector = src.type === "commcare" ? new CommCareConnector() : new GenericConnector();
        const ingestRes = await connector.ingest({ source: src }, ctx);
        sourcesPolled += 1;
        if (ingestRes.insertedCount > 0) {
          await runGuardianAgent(ctx, { sourceId: src.id, trigger: "submission" });
          runsTriggered += 1;
        }
      } catch (err) {
        console.warn(`Échec synchro autonome source ${src.id}:`, err);
      }
    }
  }
  await journalRepo.flushPg();
  return { polledAt: new Date().toISOString(), sourcesPolled, runsTriggered };
}

export async function processInboxFilePath(filePath: string): Promise<boolean> {
  await journalRepo.ensureReady();
  const ext = path.extname(filePath).toLowerCase();
  if (![".csv", ".xlsx", ".txt"].includes(ext)) return false;

  const inboxRoot = getInboxRoot();
  const rel = path.relative(inboxRoot, filePath);
  const parts = rel.split(path.sep);
  if (parts.length < 3) return false;

  const [tenantSeg, spaceSeg] = parts;
  const space = tenantSpacesRegistry.find(
    (s) =>
      s.tenantId.replace(/[^a-zA-Z0-9._-]/g, "_") === tenantSeg &&
      s.id.replace(/[^a-zA-Z0-9._-]/g, "_") === spaceSeg
  );
  if (!space) return false;

  const ctx: TenantSpaceContext = {
    tenantId: space.tenantId,
    spaceId: space.id,
    userId: space.ownerUserId,
  };

  if (processingFiles.has(filePath)) return false;
  processingFiles.add(filePath);

  try {
    if (!fs.existsSync(filePath)) return false;
    const buffer = fs.readFileSync(filePath);
    const isExcel = ext === ".xlsx";
    const source = journalRepo.ensureSourceForType(
      ctx,
      isExcel ? "excel" : "csv",
      "Inbox Surveillance"
    );
    if (isExcel) {
      await new ExcelConnector().ingest({ source, fileBuffer: buffer, fileName: path.basename(filePath) }, ctx);
    } else {
      await new CsvConnector().ingest({ source, fileBuffer: buffer, fileName: path.basename(filePath) }, ctx);
    }
    await runGuardianAgent(ctx, { sourceId: source.id, trigger: "upload" });
    await journalRepo.flushPg();
    moveInboxFile(ctx, filePath, "archive");
    return true;
  } catch (err) {
    console.error("Erreur worker inbox:", err);
    try {
      if (fs.existsSync(filePath)) moveInboxFile(ctx, filePath, "quarantine");
    } catch {
      // ignore
    }
    return false;
  } finally {
    processingFiles.delete(filePath);
  }
}

/**
 * Démarre node-cron (tâche nocturne 02h00 UTC + polling MEAL API) et chokidar (surveillance inbox).
 */
export function startWorker() {
  if (!cronTask) {
    const rawSchedule = process.env.CRON_SCHEDULE?.trim() || "0 2 * * *";
    const nightlySchedule = cron.validate(rawSchedule) ? rawSchedule : "0 2 * * *";
    cronTask = cron.schedule(
      nightlySchedule,
      () => {
        void journalRepo.ensureReady().then(() => {
          runNightlyCheckAllSpaces();
          return journalRepo.flushPg();
        });
      },
      { timezone: "UTC" }
    );
  }

  if (!pollTask) {
    const pollSchedule = process.env.MEAL_POLL_CRON || "*/15 * * * *";
    pollTask = cron.schedule(
      pollSchedule,
      () => {
        void pollApiSourcesAllSpaces();
      },
      { timezone: "UTC" }
    );
  }

  if (!inboxWatcher) {
    for (const ctx of journalRepo.listAllSpaceContexts()) {
      ensureSpaceDirectories(ctx);
    }
    const inboxRoot = getInboxRoot();
    fs.mkdirSync(inboxRoot, { recursive: true });
    inboxWatcher = chokidar.watch(inboxRoot, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    });
    inboxWatcher.on("add", (filePath) => {
      void processInboxFilePath(filePath);
    });
  }
}

export async function stopWorker() {
  if (cronTask) {
    cronTask.stop();
    cronTask = undefined;
  }
  if (pollTask) {
    pollTask.stop();
    pollTask = undefined;
  }
  if (inboxWatcher) {
    await inboxWatcher.close();
    inboxWatcher = undefined;
  }
}
