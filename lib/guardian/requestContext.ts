import { NextRequest } from "next/server";
import { getAuthUser } from "../server/authHelper";
import { mockDb, UserRecord } from "../server/mockDb";
import type { TenantSpaceContext } from "./types";
import { resolveContextForUser } from "./tenantContext";

/**
 * Résout le contexte (tenantId, spaceId, userId) à partir d'une requête HTTP Next.js.
 * Lit le header `x-space-id` ou le query param `spaceId` et le valide côté serveur.
 */
export function resolveRequestContext(
  req: NextRequest,
  explicitSpaceId?: string | null
): { user: UserRecord; ctx: TenantSpaceContext } {
  const user = getAuthUser(req) || mockDb.users[0];
  const spaceIdFromRequest =
    explicitSpaceId ??
    req.headers.get("x-space-id") ??
    req.nextUrl.searchParams.get("spaceId");

  const ctx = resolveContextForUser(user, spaceIdFromRequest);
  return { user, ctx };
}
