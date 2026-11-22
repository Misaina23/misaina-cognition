import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb } from "@/lib/server/mockDb";
import {
  deriveTenantId,
  ensureDefaultSpaceForUser,
  listAuthorizedSpaces,
} from "@/lib/guardian/tenantContext";
import { guardianRepo } from "@/lib/guardian/repository";

const CreateSpaceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(400).optional(),
});

/**
 * GET /api/guardian/spaces
 * Liste les espaces accessibles par l'utilisateur dans son tenant (isolation stricte).
 */
export async function GET(req: NextRequest) {
  const user = getAuthUser(req) || mockDb.users[0];
  ensureDefaultSpaceForUser(user);
  const spaces = listAuthorizedSpaces(user);

  return NextResponse.json({
    tenantId: deriveTenantId(user.department),
    userId: user.id,
    spaces,
  });
}

/**
 * POST /api/guardian/spaces
 * Crée un nouvel espace / projet isolé dans le tenant de l'utilisateur.
 */
export async function POST(req: NextRequest) {
  try {
    const user = getAuthUser(req) || mockDb.users[0];
    const body = await req.json();
    const parsed = CreateSpaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Données d'espace invalides", errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tenantId = deriveTenantId(user.department);
    const space = guardianRepo.createSpace(
      tenantId,
      user.id,
      parsed.data.name,
      parsed.data.description ?? ""
    );

    return NextResponse.json({ space }, { status: 201 });
  } catch (error) {
    console.error("Erreur création espace:", error);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
