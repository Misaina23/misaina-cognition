import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import cron, { type ScheduledTask } from "node-cron";
import { executeDeterministicRun, runGuardianAgent } from "./agent/agent";
import { CsvConnector } from "./connectors/csv";
import { ExcelConnector } from "./connectors/excel";
import type { DataRun, TenantSpaceContext } from "./connectors/types";
import { ensureSpaceDirectories, journalRepo, moveInboxFile } from "./journal";
import { tenantSpacesRegistry } from "./tenant";

let cronTask: ScheduledTask | undefined;
let inboxWatcher: FSWatcher | undefined;
const processingFiles = new Set<string>();

function getInboxRoot(): string {
  const cwd = process.cwd();
  const base = fs.existsSync(path.join(cwd, "config", "projects")) ? cwd : path.join(cwd, "backend");
  return path.join(base, "data", "inbox");
}

export function runNightlyCheckAllSpaces(): {
  executedAt: string;
  spacesChecked: number;
  runs: DataRun[];
} {
  const runs: DataRun[] = [];
  for (const ctx of journalRepo.listAllSpaceContexts()) {
    const active = journalRepo.listNormalizedRecords(ctx, { includeArchived: false });
    if (active.length === 0) continue;
    const sourceId = journalRepo.listSources(ctx)[0]?.id ?? "nightly-check";
    const { run } = executeDeterministicRun(ctx, { sourceId, trigger: "nightly_schedule" });
    runs.push(run);
  }
  return { executedAt: new Date().toISOString(), spacesChecked: runs.length, runs };
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
 * Démarre node-cron (tâche nocturne 02h00 UTC) + chokidar (surveillance inbox).
 */
export function startWorker() {
  if (!cronTask) {
    cronTask = cron.schedule(
      "0 2 * * *",
      () => {
        void journalRepo.ensureReady().then(() => {
          runNightlyCheckAllSpaces();
          return journalRepo.flushPg();
        });
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
  if (inboxWatcher) {
    await inboxWatcher.close();
    inboxWatcher = undefined;
  }
}
