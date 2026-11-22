import fs from "node:fs";
import path from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import chokidar, { type FSWatcher } from "chokidar";
import { guardianRepo } from "./repository";
import { executeDeterministicRun } from "./triggers";
import { runGuardianAgent } from "./agentRunner";
import { CsvConnector } from "./connectors/csvConnector";
import { ensureSpaceDirectories, moveInboxFile } from "./diskStorage";
import { mockDb } from "../server/mockDb";
import type { DataRun, TenantSpaceContext } from "./types";

const globalForScheduler = globalThis as unknown as {
  guardianCronTask?: ScheduledTask;
  guardianInboxWatcher?: FSWatcher;
  guardianProcessingFiles?: Set<string>;
};

/**
 * Exécute le contrôle nocturne sur l'ensemble des espaces (tenantId, spaceId) actifs.
 * Chaque espace reste strictement isolé dans son propre contexte d'exécution.
 */
export function runNightlyCheckAllSpaces(): {
  executedAt: string;
  spacesChecked: number;
  runs: DataRun[];
} {
  const contexts = guardianRepo.listAllSpaceContexts();
  const runs: DataRun[] = [];

  for (const ctx of contexts) {
    const activeRecords = guardianRepo.listNormalizedRecords(ctx, { includeArchived: false });
    if (activeRecords.length === 0) continue;

    const sources = guardianRepo.listSources(ctx);
    const primarySourceId = sources[0]?.id ?? "nightly-check";
    const { run } = executeDeterministicRun(ctx, {
      sourceId: primarySourceId,
      trigger: "nightly_schedule",
    });
    runs.push(run);
  }

  return {
    executedAt: new Date().toISOString(),
    spacesChecked: runs.length,
    runs,
  };
}

/**
 * Traite automatiquement un fichier CSV/Excel déposé dans data/inbox/<tenantId>/<spaceId>/.
 * Valide strictement le couple (tenantId, spaceId) contre les espaces existants.
 */
export async function processInboxFilePath(filePath: string): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  if (![".csv", ".xlsx", ".txt"].includes(ext)) return false;

  const inboxRoot = path.join(process.cwd(), "data", "inbox");
  const rel = path.relative(inboxRoot, filePath);
  const parts = rel.split(path.sep);
  if (parts.length < 3) return false;

  const [tenantSegment, spaceSegment] = parts;
  const matchedSpace = mockDb.userSpaces.find(
    (s) =>
      s.tenantId.replace(/[^a-zA-Z0-9._-]/g, "_") === tenantSegment &&
      s.id.replace(/[^a-zA-Z0-9._-]/g, "_") === spaceSegment
  );
  if (!matchedSpace) {
    return false;
  }

  const ctx: TenantSpaceContext = {
    tenantId: matchedSpace.tenantId,
    spaceId: matchedSpace.id,
    userId: matchedSpace.ownerUserId,
  };

  if (!globalForScheduler.guardianProcessingFiles) {
    globalForScheduler.guardianProcessingFiles = new Set();
  }
  if (globalForScheduler.guardianProcessingFiles.has(filePath)) return false;
  globalForScheduler.guardianProcessingFiles.add(filePath);

  try {
    if (!fs.existsSync(filePath)) return false;
    const buffer = fs.readFileSync(filePath);
    const csvConnector = new CsvConnector();
    const source = guardianRepo.ensureSourceForType(ctx, "csv", "Dépôt Inbox CSV/Excel");
    await csvConnector.ingest(
      { source, fileBuffer: buffer, fileName: path.basename(filePath) },
      ctx
    );
    await runGuardianAgent(ctx, { sourceId: source.id, trigger: "upload" });
    moveInboxFile(ctx, filePath, "archive");
    return true;
  } catch (err) {
    console.error("Erreur traitement inbox Gardien:", err);
    try {
      if (fs.existsSync(filePath)) {
        moveInboxFile(ctx, filePath, "quarantine");
      }
    } catch {
      // ignore move error
    }
    return false;
  } finally {
    globalForScheduler.guardianProcessingFiles.delete(filePath);
  }
}

/**
 * Démarre de façon idempotente :
 * 1) la tâche planifiée nocturne `node-cron` (02h00 UTC chaque nuit),
 * 2) le watcher `chokidar` sur `data/inbox/<tenantId>/<spaceId>/`.
 */
export function ensureNightlySchedulerStarted(): void {
  if (!globalForScheduler.guardianCronTask) {
    globalForScheduler.guardianCronTask = cron.schedule(
      "0 2 * * *",
      () => {
        try {
          runNightlyCheckAllSpaces();
        } catch (err) {
          console.error("Erreur tâche planifiée nocturne Gardien:", err);
        }
      },
      { timezone: "UTC" }
    );
  }

  if (!globalForScheduler.guardianInboxWatcher) {
    for (const ctx of guardianRepo.listAllSpaceContexts()) {
      ensureSpaceDirectories(ctx);
    }
    const inboxRoot = path.join(process.cwd(), "data", "inbox");
    fs.mkdirSync(inboxRoot, { recursive: true });

    const watcher = chokidar.watch(inboxRoot, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    });

    watcher.on("add", (filePath) => {
      void processInboxFilePath(filePath);
    });

    globalForScheduler.guardianInboxWatcher = watcher;
  }
}

/**
 * Arrête proprement le worker cron + watcher (utile en tests ou arrêt serveur).
 */
export async function stopGuardianWorker(): Promise<void> {
  if (globalForScheduler.guardianCronTask) {
    globalForScheduler.guardianCronTask.stop();
    globalForScheduler.guardianCronTask = undefined;
  }
  if (globalForScheduler.guardianInboxWatcher) {
    await globalForScheduler.guardianInboxWatcher.close();
    globalForScheduler.guardianInboxWatcher = undefined;
  }
}
