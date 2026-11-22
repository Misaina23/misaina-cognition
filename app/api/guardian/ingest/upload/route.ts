import { NextRequest, NextResponse } from "next/server";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";
import { ingestWithConnector } from "@/lib/guardian/connectors";
import { executeDeterministicRun } from "@/lib/guardian/triggers";
import { runGuardianAgent } from "@/lib/guardian/agentRunner";
import { ensureNightlySchedulerStarted } from "@/lib/guardian/scheduler";
import { saveRawUploadToArchive } from "@/lib/guardian/diskStorage";
import { mockDb } from "@/lib/server/mockDb";

/**
 * POST /api/guardian/ingest/upload
 * Ingestion d'un fichier CSV ou Excel (.xlsx) dans l'espace (tenantId, spaceId).
 * Détecte automatiquement l'encodage, le séparateur, conserve le brut immuable
 * et déclenche automatiquement le moteur de contrôle déterministe.
 */
export async function POST(req: NextRequest) {
  try {
    ensureNightlySchedulerStarted();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const requestedSpaceId = formData.get("spaceId") as string | null;
    const sourceIdParam = formData.get("sourceId") as string | null;
    const mappingRaw = formData.get("columnMapping") as string | null;

    if (!file) {
      return NextResponse.json({ message: "Fichier CSV ou Excel requis" }, { status: 400 });
    }

    const { user, ctx } = resolveRequestContext(req, requestedSpaceId);

    let columnMapping: Record<string, string> | undefined;
    if (mappingRaw && mappingRaw.trim()) {
      try {
        columnMapping = JSON.parse(mappingRaw);
      } catch {
        return NextResponse.json(
          { message: "columnMapping doit être un JSON valide" },
          { status: 400 }
        );
      }
    }

    const source =
      (sourceIdParam ? guardianRepo.getSource(ctx, sourceIdParam) : null) ||
      guardianRepo.ensureSourceForType(ctx, "csv", "Import CSV / Excel");

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Conserve une copie brute immuable dans data/archive/<tenantId>/<spaceId>/
    saveRawUploadToArchive(ctx, file.name, fileBuffer);

    const result = await ingestWithConnector(
      {
        source,
        fileBuffer,
        fileName: file.name,
        columnMapping,
      },
      ctx
    );

    // Déclenchement automatique : contrôle déterministe puis agent autonome Gardien
    const { run, anomaliesCount } = executeDeterministicRun(ctx, {
      sourceId: source.id,
      trigger: "upload",
      recordsIngested: result.insertedCount,
      recordsSkippedIdempotent: result.skippedIdempotentCount,
    });
    const agentRes = await runGuardianAgent(ctx, {
      sourceId: source.id,
      trigger: "upload",
      existingRunId: run.id,
    });

    mockDb.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      department: user.department,
      action: "DOC_UPLOAD",
      queryOrTarget: `Ingestion Gardien « ${file.name} » (${result.insertedCount} insérés, ${result.skippedIdempotentCount} ignorés) — Run ${agentRes.run.id} (${anomaliesCount} anomalies)`,
      dlpStatus: "CONFORME",
      sourcesCount: result.insertedCount,
      latencyMs: 95,
      hashSignature: `sha256-csv-${Date.now()}`,
    });

    mockDb.broadcastEvent({
      type: "guardian_ingest",
      documentId: source.id,
      percent: 100,
      message: `${result.insertedCount} lignes normalisées depuis ${file.name} (${anomaliesCount} anomalies détectées)`,
    });

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      fileName: file.name,
      sourceId: result.sourceId,
      sourceType: result.sourceType,
      totalRead: result.totalRead,
      insertedCount: result.insertedCount,
      skippedIdempotentCount: result.skippedIdempotentCount,
      detectedEncoding: result.detectedEncoding,
      detectedDelimiter: result.detectedDelimiter,
      runId: agentRes.run.id,
      anomaliesCount,
      anomaliesBySeverity: agentRes.run.anomaliesBySeverity,
      agentVerdict: agentRes.verdict,
      recordsPreview: result.normalizedRecords.slice(0, 5),
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Erreur lors de l'ingestion";
    return NextResponse.json({ message }, { status: 400 });
  }
}
