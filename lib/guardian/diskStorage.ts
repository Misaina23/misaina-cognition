import fs from "node:fs";
import path from "node:path";
import type { TenantSpaceContext } from "./types";

/**
 * Nettoie un segment de chemin pour prévenir toute traversée de répertoire.
 */
function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getBaseDataDir(): string {
  return path.join(process.cwd(), "data");
}

export function getSpaceDiskDirs(ctx: TenantSpaceContext): {
  inboxDir: string;
  archiveDir: string;
  quarantineDir: string;
} {
  const tenant = safeSegment(ctx.tenantId);
  const space = safeSegment(ctx.spaceId);
  const base = getBaseDataDir();
  return {
    inboxDir: path.join(base, "inbox", tenant, space),
    archiveDir: path.join(base, "archive", tenant, space),
    quarantineDir: path.join(base, "quarantine", tenant, space),
  };
}

/**
 * Initialise les dossiers inbox / archive / quarantine cloisonnés par (tenantId, spaceId).
 */
export function ensureSpaceDirectories(ctx: TenantSpaceContext): {
  inboxDir: string;
  archiveDir: string;
  quarantineDir: string;
} {
  const dirs = getSpaceDiskDirs(ctx);
  fs.mkdirSync(dirs.inboxDir, { recursive: true });
  fs.mkdirSync(dirs.archiveDir, { recursive: true });
  fs.mkdirSync(dirs.quarantineDir, { recursive: true });
  return dirs;
}

/**
 * Archive une copie immuable d'un fichier brut ingéré sans jamais l'altérer.
 */
export function saveRawUploadToArchive(
  ctx: TenantSpaceContext,
  fileName: string,
  buffer: Buffer | Uint8Array
): string {
  const { archiveDir } = ensureSpaceDirectories(ctx);
  const safeName = `${Date.now()}_${safeSegment(fileName)}`;
  const dest = path.join(archiveDir, safeName);
  fs.writeFileSync(dest, Buffer.from(buffer));
  return dest;
}

/**
 * Dépose un instantané JSON en quarantaine (ex. anomalies bloquantes ou arrêt par garde-fou)
 * sans supprimer la donnée source.
 */
export function saveQuarantineSnapshot(
  ctx: TenantSpaceContext,
  runId: string,
  payload: Record<string, unknown>
): string {
  const { quarantineDir } = ensureSpaceDirectories(ctx);
  const dest = path.join(quarantineDir, `${safeSegment(runId)}.json`);
  fs.writeFileSync(dest, JSON.stringify(payload, null, 2), "utf8");
  return dest;
}

/**
 * Déplace un fichier traité depuis inbox vers archive ou quarantine.
 */
export function moveInboxFile(
  ctx: TenantSpaceContext,
  sourcePath: string,
  target: "archive" | "quarantine"
): string {
  const dirs = ensureSpaceDirectories(ctx);
  const baseName = `${Date.now()}_${safeSegment(path.basename(sourcePath))}`;
  const dest = path.join(target === "archive" ? dirs.archiveDir : dirs.quarantineDir, baseName);
  fs.renameSync(sourcePath, dest);
  return dest;
}
