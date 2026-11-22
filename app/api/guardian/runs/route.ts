import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";
import { executeDeterministicRun } from "@/lib/guardian/triggers";
import { runGuardianAgent } from "@/lib/guardian/agentRunner";
import { ensureNightlySchedulerStarted, runNightlyCheckAllSpaces } from "@/lib/guardian/scheduler";

const RunTriggerSchema = z.object({
  mode: z.enum(["agent", "deterministic", "manual", "nightly"]).default("agent"),
  spaceId: z.string().optional(),
  sourceId: z.string().optional(),
});

/**
 * GET /api/guardian/runs
 * Liste les runs et les anomalies détectées pour l'espace (tenantId, spaceId).
 */
export async function GET(req: NextRequest) {
  try {
    ensureNightlySchedulerStarted();
    const { ctx } = resolveRequestContext(req);
    const severity = req.nextUrl.searchParams.get("severity") as
      | "bloquante"
      | "a_verifier"
      | "mineure"
      | null;
    const status = req.nextUrl.searchParams.get("status") as
      | "open"
      | "auto_resolved"
      | "pending_validation"
      | "resolved"
      | "ignored"
      | null;

    const runs = guardianRepo.listRuns(ctx);
    const anomalies = guardianRepo.listAnomalies(ctx, {
      severity: severity || undefined,
      status: status || undefined,
    });

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runs,
      anomalies,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/guardian/runs
 * Déclenche un cycle complet (déterministe + agent autonome) ou la tâche nocturne.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RunTriggerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Paramètres invalides", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.mode === "nightly") {
      resolveRequestContext(req, parsed.data.spaceId);
      const summary = runNightlyCheckAllSpaces();
      return NextResponse.json(summary);
    }

    const { ctx } = resolveRequestContext(req, parsed.data.spaceId);
    const sources = guardianRepo.listSources(ctx);
    const sourceId = parsed.data.sourceId || sources[0]?.id || "manual-check";

    if (parsed.data.mode === "deterministic") {
      const { run, anomaliesCount } = executeDeterministicRun(ctx, {
        sourceId,
        trigger: "manual",
      });
      return NextResponse.json({
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        run,
        anomaliesCount,
      });
    }

    const agentRes = await runGuardianAgent(ctx, {
      sourceId,
      trigger: "manual",
    });

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      run: agentRes.run,
      verdict: agentRes.verdict,
      usedGemini: agentRes.usedGemini,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Erreur d'exécution";
    return NextResponse.json({ message }, { status: 400 });
  }
}
