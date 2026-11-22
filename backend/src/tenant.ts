import type { TenantSpaceContext, UserSpace } from "./connectors/types";

export interface AuthPrincipal {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
}

export class TenantIsolationError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

export const DEFAULT_USERS: AuthPrincipal[] = [
  {
    id: "u-1",
    email: "dir.exec@misaina-corp.org",
    fullName: "Direction Exécutive",
    role: "ADMIN",
    department: "Direction Exécutive & Conseil",
  },
  {
    id: "u-3",
    email: "a.traore@misaina-corp.org",
    fullName: "Amadou Traoré",
    role: "USER",
    department: "Opérations Sahel - Dakar",
  },
];

export const tenantSpacesRegistry: UserSpace[] = [
  {
    id: "space-u1-global",
    tenantId: "tenant-direction-executive-conseil",
    name: "Espace Principal — Direction Exécutive",
    description: "Données opérationnelles principales de Direction Exécutive",
    ownerUserId: "u-1",
    memberUserIds: ["u-1"],
    createdAt: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "space-u3-sahel",
    tenantId: "tenant-operations-sahel-dakar",
    name: "Collecte Terrain Sahel — Dakar",
    description: "Enquêtes terrain et soumissions partenaires",
    ownerUserId: "u-3",
    memberUserIds: ["u-3"],
    createdAt: "2026-10-01T08:00:00.000Z",
  },
];

export function deriveTenantId(department?: string): string {
  const clean = (department || "default")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `tenant-${clean || "default"}`;
}

export function getPrincipalByIdOrHeader(userIdHeader?: string | null): AuthPrincipal {
  if (userIdHeader) {
    const found = DEFAULT_USERS.find((u) => u.id === userIdHeader);
    if (found) return found;
  }
  return DEFAULT_USERS[0];
}

export function listAuthorizedSpaces(user: AuthPrincipal): UserSpace[] {
  const tenantId = deriveTenantId(user.department);
  return tenantSpacesRegistry.filter(
    (s) =>
      s.tenantId === tenantId &&
      (s.ownerUserId === user.id || s.memberUserIds.includes(user.id))
  );
}

export function createUserSpace(
  tenantId: string,
  userId: string,
  name: string,
  description = ""
): UserSpace {
  const space: UserSpace = {
    id: `space-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId,
    name: name.trim(),
    description: description.trim(),
    ownerUserId: userId,
    memberUserIds: [userId],
    createdAt: new Date().toISOString(),
  };
  tenantSpacesRegistry.push(space);
  return space;
}

/**
 * Résout et valide côté serveur le couple (tenantId, spaceId) pour un utilisateur.
 * Lève TenantIsolationError (403) en cas de tentative d'accès inter-tenant ou inter-espace.
 */
export function resolveContextForUser(
  user: AuthPrincipal,
  requestedSpaceId?: string | null
): TenantSpaceContext {
  const tenantId = deriveTenantId(user.department);
  const authorized = listAuthorizedSpaces(user);

  if (requestedSpaceId) {
    const target = authorized.find((s) => s.id === requestedSpaceId);
    if (!target) {
      throw new TenantIsolationError(
        `Accès refusé à l'espace « ${requestedSpaceId} » pour le tenant « ${tenantId} ».`
      );
    }
    return { tenantId, spaceId: target.id, userId: user.id };
  }

  if (authorized.length === 0) {
    const created = createUserSpace(
      tenantId,
      user.id,
      `Espace Principal — ${user.fullName}`,
      "Espace isolé créé automatiquement"
    );
    return { tenantId, spaceId: created.id, userId: user.id };
  }

  return { tenantId, spaceId: authorized[0].id, userId: user.id };
}
