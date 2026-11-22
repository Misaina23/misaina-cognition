import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";
import { ingestWithConnector } from "@/lib/guardian/connectors";
import { executeDeterministicRun } from "@/lib/guardian/triggers";
import { runGuardianAgent } from "@/lib/guardian/agentRunner";
import { ensureNightlySchedulerStarted } from "@/lib/guardian/scheduler";
import { mockDb } from "@/lib/server/mockDb";

const ConnectorPayloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("register"),
    spaceId: z.string().optional(),
    id: z.string().optional(),
    name: z.string().min(2),
    type: z.enum(["csv", "excel", "commcare", "generic"]),
    format: z.enum(["json", "kobo", "odk"]).optional(),
    endpointUrl: z.string().url().optional(),
    authTokenEnvName: z.string().optional(),
    recordsPath: z.string().optional(),
    externalIdField: z.string().optional(),
    geoField: z.string().optional(),
    columnMapping: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    action: z.literal("ingest"),
    spaceId: z.string().optional(),
    sourceId: z.string(),
    rawItems: z.array(z.record(z.string(), z.unknown())).optional(),
    columnMapping: z.record(z.string(), z.string()).optional(),
    limit: z.number().int().positive().max(1000).optional(),
  }),
]);

/**
 * GET /api/guardian/connectors
 * Retourne les sources connectées uniquement pour le couple (tenantId, spaceId) autorisé.
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = resolveRequestContext(req);
    const sources = guardianRepo.listSources(ctx);
    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      sources,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/guardian/connectors
 * Enregistre un connecteur ou lance une ingestion via SourceConnector.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ConnectorPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Requête invalide", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { user, ctx } = resolveRequestContext(req, parsed.data.spaceId);

    if (parsed.data.action === "register") {
      const source = guardianRepo.upsertSource(ctx, {
        id: parsed.data.id || `src-${ctx.spaceId}-${Date.now()}`,
        name: parsed.data.name,
        type: parsed.data.type,
        format: parsed.data.format,
        endpointUrl: parsed.data.endpointUrl,
        authTokenEnvName: parsed.data.authTokenEnvName,
        recordsPath: parsed.data.recordsPath,
        externalIdField: parsed.data.externalIdField,
        geoField: parsed.data.geoField,
        columnMapping: parsed.data.columnMapping,
        status: "ACTIVE",
      });

      return NextResponse.json({ source }, { status: 201 });
    }

    // action === "ingest"
    const source = guardianRepo.getSource(ctx, parsed.data.sourceId);
    if (!source) {
      return NextResponse.json(
        { message: "Source introuvable dans cet espace" },
        { status: 404 }
      );
    }

    const result = await ingestWithConnector(
      {
        source,
        rawItems: parsed.data.rawItems,
        columnMapping: parsed.data.columnMapping,
        limit: parsed.data.limit,
      },
      ctx
    );

    ensureNightlySchedulerStarted();

    // Déclenchement automatique lors d'une nouvelle soumission (contrôle + agent)
    let runSummary: { runId: string; anomaliesCount: number; autoActionsCount: number; pendingValidationsCount: number } | null = null;
    if (result.insertedCount > 0) {
      const { run, anomaliesCount } = executeDeterministicRun(ctx, {
        sourceId: source.id,
        trigger: "submission",
        recordsIngested: result.insertedCount,
        recordsSkippedIdempotent: result.skippedIdempotentCount,
      });
      const agentRes = await runGuardianAgent(ctx, {
        sourceId: source.id,
        trigger: "submission",
        existingRunId: run.id,
      });
      runSummary = {
        runId: agentRes.run.id,
        anomaliesCount,
        autoActionsCount: agentRes.run.autoActionsCount,
        pendingValidationsCount: agentRes.run.pendingValidationsCount,
      };
    }

    mockDb.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      department: user.department,
      action: "CONNECTOR_SYNC",
      queryOrTarget: `Ingestion ${source.name} (${result.insertedCount} insérés, ${result.skippedIdempotentCount} ignorés)`,
      dlpStatus: "CONFORME",
      sourcesCount: result.insertedCount,
      latencyMs: 120,
      hashSignature: `sha256-ingest-${Date.now()}`,
    });

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      result: {
        sourceId: result.sourceId,
        sourceType: result.sourceType,
        totalRead: result.totalRead,
        insertedCount: result.insertedCount,
        skippedIdempotentCount: result.skippedIdempotentCount,
        newCursorDate: result.newCursorDate,
        newCursorId: result.newCursorId,
        runId: runSummary?.runId,
        anomaliesCount: runSummary?.anomaliesCount ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Erreur lors de l'ingestion";
    return NextResponse.json({ message }, { status: 400 });
  }
}
