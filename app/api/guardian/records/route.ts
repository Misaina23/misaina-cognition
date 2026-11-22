import { NextRequest, NextResponse } from "next/server";
import { resolveRequestContext } from "@/lib/guardian/requestContext";
import { TenantIsolationError } from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";

/**
 * GET /api/guardian/records
 * Liste les enregistrements normalisés (et optionnellement le brut immuable)
 * uniquement pour le couple (tenantId, spaceId) de l'utilisateur.
 */
export async function GET(req: NextRequest) {
  try {
    const { ctx } = resolveRequestContext(req);
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
    const includeRaw = req.nextUrl.searchParams.get("includeRaw") === "true";
    const sourceId = req.nextUrl.searchParams.get("sourceId") || undefined;

    const records = guardianRepo.listNormalizedRecords(ctx, {
      includeArchived,
      sourceId,
    });
    const rawRecords = includeRaw ? guardianRepo.listRawRecords(ctx) : undefined;

    return NextResponse.json({
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      total: records.length,
      records,
      rawRecords,
    });
  } catch (error) {
    if (error instanceof TenantIsolationError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
