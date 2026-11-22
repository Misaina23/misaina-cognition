import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  approveOrRejectPendingAccount,
  authenticateRequest,
  AuthUnauthorizedError,
  createValidatedAccountByAdmin,
  listManageableUsers,
  updateAccountPermissions,
} from "../auth";
import { journalRepo } from "../journal";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  requirePermission,
  ROLE_PERMISSION_PRESETS,
  tenantSpacesRegistry,
  TenantIsolationError,
  type Permission,
  type UserRole,
} from "../tenant";
import { readJsonBody, sendJson } from "./sources";

const PermissionEnum = z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]);
const RoleEnum = z.enum([
  "SUPER_ADMIN",
  "ADMIN",
  "COORDINATEUR",
  "ANALYSTE",
  "LECTEUR",
  "USER",
]);

const ApproveUserSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  role: RoleEnum.optional(),
  permissions: z.array(PermissionEnum).optional(),
  spaceIds: z.array(z.string()).optional(),
});

const UpdatePermissionsSchema = z.object({
  userId: z.string().min(1),
  role: RoleEnum.optional(),
  permissions: z.array(PermissionEnum).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  spaceIds: z.array(z.string()).optional(),
});

const AdminCreateUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  department: z.string().min(2),
  role: RoleEnum,
  permissions: z.array(PermissionEnum).optional(),
  spaceIds: z.array(z.string()).optional(),
});

export async function handleUsersRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();
    const caller = authenticateRequest(req);
    requirePermission(caller, "users:manage");

    if (url.pathname === "/api/users" && req.method === "GET") {
      const users = listManageableUsers(caller);
      const visibleSpaces =
        caller.role === "SUPER_ADMIN"
          ? tenantSpacesRegistry
          : tenantSpacesRegistry.filter((s) =>
              users.some((u) => u.id === s.ownerUserId || s.memberUserIds.includes(u.id))
            );
      return sendJson(res, 200, {
        users,
        spaces: visibleSpaces,
        availablePermissions: ALL_PERMISSIONS.map((code) => ({
          code,
          label: PERMISSION_LABELS[code],
        })),
        rolePresets: ROLE_PERMISSION_PRESETS,
      });
    }

    if (url.pathname === "/api/users" && req.method === "POST") {
      const body = AdminCreateUserSchema.parse(await readJsonBody(req));
      const created = createValidatedAccountByAdmin(caller, {
        ...body,
        role: body.role as UserRole,
        permissions: body.permissions as Permission[] | undefined,
      });
      await journalRepo.flushPg();
      return sendJson(res, 201, { user: created });
    }

    if (url.pathname === "/api/users/approve" && req.method === "POST") {
      const body = ApproveUserSchema.parse(await readJsonBody(req));
      const updated = approveOrRejectPendingAccount(caller, {
        ...body,
        role: body.role as UserRole | undefined,
        permissions: body.permissions as Permission[] | undefined,
      });
      await journalRepo.flushPg();
      return sendJson(res, 200, { user: updated });
    }

    if (url.pathname === "/api/users/permissions" && req.method === "PUT") {
      const body = UpdatePermissionsSchema.parse(await readJsonBody(req));
      const updated = updateAccountPermissions(caller, {
        ...body,
        role: body.role as UserRole | undefined,
        permissions: body.permissions as Permission[] | undefined,
      });
      await journalRepo.flushPg();
      return sendJson(res, 200, { user: updated });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) return sendJson(res, 401, { message: err.message });
    if (err instanceof TenantIsolationError) return sendJson(res, 403, { message: err.message });
    const msg = err instanceof Error ? err.message : "Erreur gestion utilisateurs";
    const status = msg.includes("existe déjà") ? 409 : 400;
    return sendJson(res, status, { message: msg });
  }
}
