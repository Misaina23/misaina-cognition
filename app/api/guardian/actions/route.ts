import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";
import { rollbackAgentAction } from "@/lib/guardian/actionsService";

const RollbackSchema = z.object({
  actionId: z.string().min(1),
  spaceId: z.string().optional(),
});

/**
 * GET /api/guardian/actions
 * Retourne le journal `agent_actions` scopé par (tenantId, spaceId).
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = resolveRequestContext(req);
    const runId = req.nextUrl.searchParams.get("runId") || undefined;
    const actions = guardianRepo.listAgentActions(ctx, runId);

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      actions,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/guardian/actions
 * Annule (rollback) une action automatique ou humaine exécutée dans cet espace.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RollbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "actionId requis", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ctx } = resolveRequestContext(req, parsed.data.spaceId);
    const revertedAction = rollbackAgentAction(ctx, parsed.data.actionId);

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      revertedAction,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Erreur lors de l'annulation";
    return NextResponse.json({ message }, { status: 400 });
  }
}
