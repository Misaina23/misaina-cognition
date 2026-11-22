import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";

const UpdateRulesSchema = z.object({
  spaceId: z.string().optional(),
  yaml: z.string().min(10),
});

/**
 * GET /api/guardian/rules
 * Retourne les règles YAML configurées pour le projet/espace (tenantId, spaceId).
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = resolveRequestContext(req);
    const rules = guardianRepo.getProjectRules(ctx);
    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      rawYaml: rules.rawYaml,
      config: rules.config,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * PUT /api/guardian/rules
 * Valide et enregistre le fichier YAML de règles métier pour cet espace.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpdateRulesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Contenu YAML requis", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { ctx } = resolveRequestContext(req, parsed.data.spaceId);
    const saved = guardianRepo.setProjectRulesYaml(ctx, parsed.data.yaml);

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      rawYaml: saved.rawYaml,
      config: saved.config,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "YAML invalide";
    return NextResponse.json({ message }, { status: 400 });
  }
}
