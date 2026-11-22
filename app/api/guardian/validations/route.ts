import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";
import { resolveValidationItem } from "@/lib/guardian/actionsService";

const DecideValidationSchema = z.object({
  validationId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  spaceId: z.string().optional(),
});

/**
 * GET /api/guardian/validations
 * Liste les demandes en attente de validation humaine (ou déjà décidées) pour (tenantId, spaceId).
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = resolveRequestContext(req);
    const status = req.nextUrl.searchParams.get("status") as
      | "pending"
      | "approved"
      | "rejected"
      | null;
    const items = guardianRepo.listValidations(ctx, status || undefined);

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      validations: items,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/guardian/validations
 * Valide ou rejette une proposition de l'agent depuis la file d'attente humaine.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = DecideValidationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Paramètres invalides", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ctx } = resolveRequestContext(req, parsed.data.spaceId);
    const result = resolveValidationItem(
      ctx,
      parsed.data.validationId,
      parsed.data.decision
    );

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      ...result,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Erreur de validation";
    return NextResponse.json({ message }, { status: 400 });
  }
}
