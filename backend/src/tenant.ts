import type { TenantSpaceContext, UserSpace } from "./connectors/types";

export type Permission =
  | "meal:read"
  | "meal:export"
  | "meal:run_agent"
  | "meal:ingest"
  | "meal:validate"
  | "meal:rollback"
  | "rules:edit"
  | "knowledge:read"
  | "knowledge:write"
  | "spaces:create"
  | "users:manage";

export const ALL_PERMISSIONS: Permission[] = [
  "meal:read",
  "meal:export",
  "meal:run_agent",
  "meal:ingest",
  "meal:validate",
  "meal:rollback",
  "rules:edit",
  "knowledge:read",
  "knowledge:write",
  "spaces:create",
  "users:manage",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "meal:read": "Consulter données & anomalies MEAL",
  "meal:export": "Exporter CSV propre & rapports .docx",
  "meal:run_agent": "Déclencher l'Agent IA & tâches planifiées",
  "meal:ingest": "Importer CSV/Excel/JSON & connecteurs",
  "meal:validate": "Approuver / rejeter les validations humaines",
  "meal:rollback": "Annuler une action agent (Rollback)",
  "rules:edit": "Modifier règles YAML & paramètres alertes",
  "knowledge:read": "Interroger la base RAG & preuves",
  "knowledge:write": "Indexer / supprimer documents RAG & exporter synthèses",
  "spaces:create": "Créer de nouveaux espaces isolés",
  "users:manage": "Valider comptes, gérer rôles & permissions",
};

export type AccountStatus = "active" | "pending" | "suspended" | "rejected";
export type UserRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "COORDINATEUR"
  | "ANALYSTE"
  | "LECTEUR"
  | "USER";

export const ROLE_PERMISSION_PRESETS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  ADMIN: [...ALL_PERMISSIONS],
  COORDINATEUR: [
    "meal:read",
    "meal:export",
    "meal:run_agent",
    "meal:ingest",
    "meal:validate",
    "meal:rollback",
    "rules:edit",
    "knowledge:read",
    "knowledge:write",
    "spaces:create",
  ],
  ANALYSTE: [
    "meal:read",
    "meal:export",
    "meal:run_agent",
    "meal:ingest",
    "knowledge:read",
    "knowledge:write",
  ],
  USER: [
    "meal:read",
    "meal:export",
    "meal:run_agent",
    "meal:ingest",
    "meal:validate",
    "meal:rollback",
    "rules:edit",
    "knowledge:read",
    "knowledge:write",
    "spaces:create",
  ],
  LECTEUR: ["meal:read", "knowledge:read"],
};

export interface AuthPrincipal {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
  status: AccountStatus;
  permissions: Permission[];
  createdAt: string;
  validatedBy?: string;
  validatedAt?: string;
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
    id: "u-saina",
    email: "andrianisaina23@gmail.com",
    fullName: "SAINA",
    role: "SUPER_ADMIN",
    department: "Direction Exécutive & Conseil",
    status: "active",
    permissions: [...ROLE_PERMISSION_PRESETS.SUPER_ADMIN],
    createdAt: "2026-10-01T08:00:00.000Z",
    validatedBy: "system",
    validatedAt: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "u-1",
    email: "dir.exec@misaina-corp.org",
    fullName: "Direction Exécutive",
    role: "ADMIN",
    department: "Direction Exécutive & Conseil",
    status: "active",
    permissions: [...ROLE_PERMISSION_PRESETS.ADMIN],
    createdAt: "2026-10-01T08:00:00.000Z",
    validatedBy: "system",
    validatedAt: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "u-3",
    email: "a.traore@misaina-corp.org",
    fullName: "Amadou Traoré",
    role: "USER",
    department: "Opérations Sahel - Dakar",
    status: "active",
    permissions: [...ROLE_PERMISSION_PRESETS.USER],
    createdAt: "2026-10-01T08:00:00.000Z",
    validatedBy: "system",
    validatedAt: "2026-10-01T08:00:00.000Z",
  },
];

export const usersRegistry: AuthPrincipal[] = DEFAULT_USERS.map((u) => ({
  ...u,
  permissions: [...u.permissions],
}));

export const tenantSpacesRegistry: UserSpace[] = [
  {
    id: "space-u1-global",
    tenantId: "tenant-direction-executive-conseil",
    name: "Espace Principal — Direction Exécutive",
    description: "Données opérationnelles principales de Direction Exécutive",
    ownerUserId: "u-1",
    memberUserIds: ["u-1", "u-saina"],
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
    const found = usersRegistry.find((u) => u.id === userIdHeader);
    if (found) return found;
  }
  return usersRegistry.find((u) => u.id === "u-1") || usersRegistry[0];
}

export function hasPermission(user: AuthPrincipal, permission: Permission): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export function requirePermission(user: AuthPrincipal, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new TenantIsolationError(
      `Permission insuffisante : « ${permission} » requise pour effectuer cette action.`
    );
  }
}

export function listAuthorizedSpaces(user: AuthPrincipal): UserSpace[] {
  if (user.role === "SUPER_ADMIN") {
    return tenantSpacesRegistry;
  }
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
    return { tenantId: target.tenantId, spaceId: target.id, userId: user.id };
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

  return { tenantId: authorized[0].tenantId, spaceId: authorized[0].id, userId: user.id };
}
