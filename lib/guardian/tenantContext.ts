import { mockDb, UserRecord } from "../server/mockDb";
import type { TenantSpaceContext, UserSpace } from "./types";

/**
 * Erreur levée lorsqu'une tentative d'accès inter-tenant ou inter-espace est détectée.
 */
export class TenantIsolationError extends Error {
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/**
 * Dérive un identifiant de tenant déterministe et normalisé depuis le département / organisation de l'utilisateur.
 */
export function deriveTenantId(department?: string): string {
  const raw = (department || "organisation-defaut")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Correspondance explicite avec les tenants pré-initialisés de mockDb
  if (raw === "direction-executive-conseil") return "tenant-direction-executive-conseil";
  if (raw === "securite-conformite-numerique") return "tenant-securite-conformite-numerique";
  if (raw === "operations-terrain-urgence") return "tenant-operations-terrain-urgence";
  if (raw === "finance-bailleurs-internationaux") return "tenant-finance-bailleurs-internationaux";

  return `tenant-${raw || "default"}`;
}

/**
 * Retourne tous les espaces accessibles par un utilisateur dans son tenant.
 */
export function listAuthorizedSpaces(user: UserRecord): UserSpace[] {
  const tenantId = deriveTenantId(user.department);
  return mockDb.userSpaces.filter(
    (s) =>
      s.tenantId === tenantId &&
      (s.ownerUserId === user.id || s.memberUserIds.includes(user.id))
  );
}

/**
 * Crée un espace par défaut pour un utilisateur nouvellement inscrit s'il n'en possède aucun.
 */
export function ensureDefaultSpaceForUser(user: UserRecord): UserSpace {
  const existing = listAuthorizedSpaces(user);
  if (existing.length > 0) return existing[0];

  const tenantId = deriveTenantId(user.department);
  const space: UserSpace = {
    id: `space-${user.id}-default`,
    tenantId,
    name: `Espace Personnel — ${user.fullName}`,
    description: `Espace de surveillance des données (${user.department})`,
    ownerUserId: user.id,
    memberUserIds: [user.id],
    createdAt: new Date().toISOString(),
  };
  mockDb.userSpaces.push(space);

  // Crée une source CSV par défaut dans cet espace
  mockDb.guardianSources.push({
    id: `src-${space.id}-csv`,
    tenantId,
    spaceId: space.id,
    name: "Import CSV / Excel Personnel",
    type: "csv",
    status: "ACTIVE",
    recordsCount: 0,
    createdAt: new Date().toISOString(),
  });

  return space;
}

/**
 * Résout et valide strictement le couple (tenantId, spaceId) côté serveur pour un utilisateur donné.
 * Ne fait jamais confiance à un tenantId envoyé par le client et refuse tout spaceId hors périmètre.
 */
export function resolveContextForUser(
  user: UserRecord,
  requestedSpaceId?: string | null
): TenantSpaceContext {
  const tenantId = deriveTenantId(user.department);
  const authorizedSpaces = listAuthorizedSpaces(user);

  if (requestedSpaceId && requestedSpaceId.trim().length > 0) {
    const match = authorizedSpaces.find((s) => s.id === requestedSpaceId.trim());
    if (!match) {
      throw new TenantIsolationError(
        `Accès refusé : l'espace « ${requestedSpaceId} » n'appartient pas au périmètre autorisé (${tenantId} / ${user.id}).`
      );
    }
    return {
      tenantId: match.tenantId,
      spaceId: match.id,
      userId: user.id,
    };
  }

  const defaultSpace = authorizedSpaces[0] ?? ensureDefaultSpaceForUser(user);
  return {
    tenantId: defaultSpace.tenantId,
    spaceId: defaultSpace.id,
    userId: user.id,
  };
}
