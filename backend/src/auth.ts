import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import {
  ALL_PERMISSIONS,
  createUserSpace,
  DEFAULT_USERS,
  deriveTenantId,
  ROLE_PERMISSION_PRESETS,
  tenantSpacesRegistry,
  TenantIsolationError,
  usersRegistry,
  type AuthPrincipal,
  type Permission,
  type UserRole,
} from "./tenant";
import { enqueuePgTask, isPgEnabled, upsertSpacePg, upsertUserPg } from "./pgStore";

export const SESSION_COOKIE_NAME = "gardien_session";
export const SESSION_TTL_SECONDS = 86400; // 24h

export class AuthUnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = "Authentification requise : session absente ou invalide.") {
    super(message);
    this.name = "AuthUnauthorizedError";
  }
}

export class AccountStatusError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "AccountStatusError";
  }
}

// Empreintes scrypt salées (sel_hex:hash_hex) — aucun mot de passe en clair stocké
const USER_PASSWORD_HASHES: Record<string, string> = {
  "u-saina":
    "db77bb564174366f553bfb35366eb99b:8f6db6ced243e2602e588748b2a12e04c6eb12ab6ab81b8388f2179fe990010c",
  "u-1":
    "7f2fec4e39e3de4672a2542841ee5c23:39afc0ce37c27f82f5890012856d09e66466e788cbb41abdeeed8ea9e30de237",
  "u-3":
    "2f4c531b30e3227b0816517196cfd4f5:8bdca9e418bdbd747331d441d8c9320bd431038d109f9c843ea5eef4144fd741",
};

let usersHydrated = false;

function isTestProcess(): boolean {
  return (
    process.env.GUARDIAN_DISABLE_DISK_STATE === "1" ||
    process.argv.some((arg) => /[/\\](tests|scripts)[/\\]|evaluate\.|idempotence\.test|isolation\.test/.test(arg))
  );
}

function getBackendRoot(): string {
  const cwd = process.cwd();
  return fs.existsSync(path.join(cwd, "config", "projects")) ? cwd : path.join(cwd, "backend");
}

function getUsersStateFilePath(): string {
  return path.join(getBackendRoot(), "data", "users-state.json");
}

export function getSeedUsersWithHashes(): Array<{
  user: AuthPrincipal;
  passwordHash: string;
}> {
  return DEFAULT_USERS.map((u) => ({
    user: { ...u, permissions: [...u.permissions] },
    passwordHash: USER_PASSWORD_HASHES[u.id] || "",
  }));
}

export function applyPgUsersSnapshot(
  rows: Array<{ user: AuthPrincipal; passwordHash: string }>
): void {
  usersHydrated = true;
  if (!Array.isArray(rows) || rows.length === 0) return;

  for (const row of rows) {
    const idx = usersRegistry.findIndex((u) => u.id === row.user.id);
    if (idx >= 0) {
      usersRegistry[idx] = row.user;
    } else {
      usersRegistry.push(row.user);
    }
    if (row.passwordHash && row.passwordHash.includes(":")) {
      USER_PASSWORD_HASHES[row.user.id] = row.passwordHash;
    }
  }
  for (const seed of DEFAULT_USERS) {
    if (!usersRegistry.some((u) => u.id === seed.id)) {
      usersRegistry.unshift({ ...seed, permissions: [...seed.permissions] });
    }
  }
}

export function ensureUsersHydrated(): void {
  if (usersHydrated) return;
  usersHydrated = true;
  if (isTestProcess() || isPgEnabled()) return;

  const filePath = getUsersStateFilePath();
  if (!fs.existsSync(filePath)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      users?: AuthPrincipal[];
      passwordHashes?: Record<string, string>;
    };
    if (Array.isArray(parsed.users)) {
      for (const savedUser of parsed.users) {
        const idx = usersRegistry.findIndex((u) => u.id === savedUser.id);
        if (idx >= 0) {
          usersRegistry[idx] = savedUser;
        } else {
          usersRegistry.push(savedUser);
        }
      }
      // Guarantee seeded Super Admin & default users exist with active status
      for (const seed of DEFAULT_USERS) {
        if (!usersRegistry.some((u) => u.id === seed.id)) {
          usersRegistry.unshift({ ...seed, permissions: [...seed.permissions] });
        }
      }
    }
    if (parsed.passwordHashes && typeof parsed.passwordHashes === "object") {
      for (const [id, hash] of Object.entries(parsed.passwordHashes)) {
        if (typeof hash === "string" && hash.includes(":")) {
          USER_PASSWORD_HASHES[id] = hash;
        }
      }
    }
  } catch (err) {
    console.error("Impossible de restaurer backend/data/users-state.json :", err);
  }
}

export function persistUsersState(
  changedUsers?: AuthPrincipal[],
  changedSpaces?: (typeof tenantSpacesRegistry)[number][]
): void {
  if (isTestProcess()) return;

  if (isPgEnabled()) {
    const usersToSync =
      changedUsers && changedUsers.length > 0 ? changedUsers : usersRegistry;
    for (const u of usersToSync) {
      const hash = USER_PASSWORD_HASHES[u.id];
      if (hash) {
        enqueuePgTask((pool) => upsertUserPg(pool, u, hash));
      }
    }
    if (changedSpaces && changedSpaces.length > 0) {
      for (const sp of changedSpaces) {
        enqueuePgTask((pool) => upsertSpacePg(pool, sp));
      }
    }
    return;
  }

  try {
    const filePath = getUsersStateFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(
      tmpPath,
      JSON.stringify(
        {
          users: usersRegistry,
          passwordHashes: USER_PASSWORD_HASHES,
        },
        null,
        2
      ),
      { mode: 0o600, encoding: "utf8" }
    );
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error("Impossible de sauvegarder backend/data/users-state.json :", err);
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

let cachedRuntimeSecret: string | null = null;

function getJwtSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length >= 16) {
    return process.env.AUTH_SECRET.trim();
  }
  if (cachedRuntimeSecret) return cachedRuntimeSecret;

  if (!isTestProcess()) {
    try {
      const secretPath = path.join(getBackendRoot(), "data", ".session-secret");
      if (fs.existsSync(secretPath)) {
        const existing = fs.readFileSync(secretPath, "utf8").trim();
        if (existing.length >= 32) {
          cachedRuntimeSecret = existing;
          return cachedRuntimeSecret;
        }
      }
      fs.mkdirSync(path.dirname(secretPath), { recursive: true });
      const generated = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(secretPath, generated, { mode: 0o600, encoding: "utf8" });
      cachedRuntimeSecret = generated;
      return cachedRuntimeSecret;
    } catch {
      // Repli en mémoire si le système de fichiers est en lecture seule
    }
  }

  cachedRuntimeSecret = crypto.randomBytes(32).toString("hex");
  return cachedRuntimeSecret;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const mod = padded.length % 4;
  const normalized = mod === 0 ? padded : padded + "=".repeat(4 - mod);
  return Buffer.from(normalized, "base64");
}

export interface JwtClaims {
  sub: string;
  email: string;
  fullName: string;
  role: string;
  department: string;
  iat: number;
  exp: number;
}

export function signSessionJwt(
  user: AuthPrincipal,
  ttlSeconds = SESSION_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
      iat: now,
      exp: now + ttlSeconds,
    } satisfies JwtClaims)
  );
  const signingInput = `${header}.${payload}`;
  const sig = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signingInput)
    .digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export function verifySessionJwt(token: string): AuthPrincipal {
  ensureUsersHydrated();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthUnauthorizedError("Jeton de session malformé.");
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signingInput)
    .digest();
  const actualSig = base64UrlDecode(sigB64);

  if (
    actualSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(actualSig, expectedSig)
  ) {
    throw new AuthUnauthorizedError("Signature de session invalide.");
  }

  let claims: JwtClaims;
  try {
    claims = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as JwtClaims;
  } catch {
    throw new AuthUnauthorizedError("Contenu de session illisible.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (!claims.sub || !claims.exp || claims.exp <= now) {
    throw new AuthUnauthorizedError("Session expirée.");
  }

  const principal = usersRegistry.find((u) => u.id === claims.sub);
  if (!principal) {
    throw new AuthUnauthorizedError("Utilisateur associé à la session introuvable.");
  }
  if (principal.status !== "active") {
    throw new AuthUnauthorizedError("Compte non actif ou en attente de validation.");
  }
  return principal;
}

export function verifyUserCredentials(email: string, password: string): AuthPrincipal | null {
  ensureUsersHydrated();
  const normalizedEmail = email.trim().toLowerCase();
  const user = usersRegistry.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user) return null;

  const stored = USER_PASSWORD_HASHES[user.id];
  if (!stored) return null;
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return null;

  const derived = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  if (derived.length !== expected.length || !crypto.timingSafeEqual(derived, expected)) {
    return null;
  }

  if (user.status === "pending") {
    throw new AccountStatusError(
      "Compte en attente de validation par le Super Admin (SAINA) ou un administrateur."
    );
  }
  if (user.status === "rejected") {
    throw new AccountStatusError("Votre demande de création de compte a été refusée.");
  }
  if (user.status === "suspended") {
    throw new AccountStatusError("Ce compte a été suspendu par l'administration.");
  }

  return user;
}

export function registerPendingAccount(input: {
  fullName: string;
  email: string;
  password: string;
  department: string;
  requestedRole?: "COORDINATEUR" | "ANALYSTE" | "LECTEUR";
}): AuthPrincipal {
  ensureUsersHydrated();
  const normalizedEmail = input.email.trim().toLowerCase();
  if (usersRegistry.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error("Un compte existe déjà avec cette adresse email.");
  }

  const role: UserRole = input.requestedRole || "LECTEUR";
  const id = `u-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const account: AuthPrincipal = {
    id,
    email: normalizedEmail,
    fullName: input.fullName.trim(),
    role,
    department: input.department.trim(),
    status: "pending",
    permissions: [...(ROLE_PERMISSION_PRESETS[role] || ROLE_PERMISSION_PRESETS.LECTEUR)],
    createdAt: new Date().toISOString(),
  };

  USER_PASSWORD_HASHES[id] = hashPassword(input.password);
  usersRegistry.push(account);
  persistUsersState([account]);
  return account;
}

export function createValidatedAccountByAdmin(
  caller: AuthPrincipal,
  input: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    role: UserRole;
    permissions?: Permission[];
    spaceIds?: string[];
  }
): AuthPrincipal {
  ensureUsersHydrated();
  if (input.role === "SUPER_ADMIN" && caller.role !== "SUPER_ADMIN") {
    throw new TenantIsolationError("Seul un Super Admin peut créer un autre Super Admin.");
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  if (usersRegistry.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error("Un compte existe déjà avec cette adresse email.");
  }

  const targetDept =
    caller.role === "SUPER_ADMIN" ? input.department.trim() : caller.department;
  const perms =
    input.permissions && input.permissions.length > 0
      ? input.permissions.filter((p): p is Permission => ALL_PERMISSIONS.includes(p))
      : [...(ROLE_PERMISSION_PRESETS[input.role] || ROLE_PERMISSION_PRESETS.ANALYSTE)];

  const id = `u-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const now = new Date().toISOString();
  const account: AuthPrincipal = {
    id,
    email: normalizedEmail,
    fullName: input.fullName.trim(),
    role: input.role,
    department: targetDept,
    status: "active",
    permissions: perms,
    createdAt: now,
    validatedBy: caller.email,
    validatedAt: now,
  };

  USER_PASSWORD_HASHES[id] = hashPassword(input.password);
  usersRegistry.push(account);
  const modifiedSpaces = assignUserToSpaces(account, input.spaceIds);
  persistUsersState([account], modifiedSpaces);
  return account;
}

export function assignUserToSpaces(
  user: AuthPrincipal,
  spaceIds?: string[]
): (typeof tenantSpacesRegistry)[number][] {
  const userTenant = deriveTenantId(user.department);
  const modified: (typeof tenantSpacesRegistry)[number][] = [];
  if (Array.isArray(spaceIds) && spaceIds.length > 0) {
    for (const sp of tenantSpacesRegistry) {
      const wantsMember = spaceIds.includes(sp.id);
      const isMember = sp.memberUserIds.includes(user.id);
      if (wantsMember && !isMember) {
        sp.memberUserIds.push(user.id);
        modified.push(sp);
      } else if (!wantsMember && isMember && sp.ownerUserId !== user.id) {
        sp.memberUserIds = sp.memberUserIds.filter((id) => id !== user.id);
        modified.push(sp);
      }
    }
    return modified;
  }

  // Ensure active non-super-admin users belong to at least one space in their tenant
  if (user.role !== "SUPER_ADMIN") {
    const existing = tenantSpacesRegistry.find((s) => s.tenantId === userTenant);
    if (existing) {
      if (!existing.memberUserIds.includes(user.id)) {
        existing.memberUserIds.push(user.id);
        modified.push(existing);
      }
    } else {
      const created = createUserSpace(
        userTenant,
        user.id,
        `Espace Principal — ${user.department}`,
        "Espace isolé attribué lors de la validation"
      );
      modified.push(created);
    }
  }
  return modified;
}

export function approveOrRejectPendingAccount(
  caller: AuthPrincipal,
  input: {
    userId: string;
    decision: "approve" | "reject";
    role?: UserRole;
    permissions?: Permission[];
    spaceIds?: string[];
  }
): AuthPrincipal {
  ensureUsersHydrated();
  const target = usersRegistry.find((u) => u.id === input.userId);
  if (!target) {
    throw new Error("Utilisateur introuvable.");
  }
  if (
    caller.role !== "SUPER_ADMIN" &&
    deriveTenantId(target.department) !== deriveTenantId(caller.department)
  ) {
    throw new TenantIsolationError("Accès refusé : utilisateur hors de votre organisation.");
  }
  if (input.role === "SUPER_ADMIN" && caller.role !== "SUPER_ADMIN") {
    throw new TenantIsolationError("Seul un Super Admin peut attribuer le rôle SUPER_ADMIN.");
  }

  const now = new Date().toISOString();
  target.validatedBy = caller.email;
  target.validatedAt = now;

  if (input.decision === "reject") {
    target.status = "rejected";
    persistUsersState([target]);
    return target;
  }

  const nextRole: UserRole = (input.role || target.role || "COORDINATEUR") as UserRole;
  target.role = nextRole;
  target.status = "active";
  target.permissions =
    input.permissions && input.permissions.length > 0
      ? input.permissions.filter((p): p is Permission => ALL_PERMISSIONS.includes(p))
      : [...(ROLE_PERMISSION_PRESETS[nextRole] || ROLE_PERMISSION_PRESETS.COORDINATEUR)];

  const modifiedSpaces = assignUserToSpaces(target, input.spaceIds);
  persistUsersState([target], modifiedSpaces);
  return target;
}

export function updateAccountPermissions(
  caller: AuthPrincipal,
  input: {
    userId: string;
    role?: UserRole;
    permissions?: Permission[];
    status?: "active" | "suspended";
    spaceIds?: string[];
  }
): AuthPrincipal {
  ensureUsersHydrated();
  const target = usersRegistry.find((u) => u.id === input.userId);
  if (!target) {
    throw new Error("Utilisateur introuvable.");
  }
  if (
    caller.role !== "SUPER_ADMIN" &&
    deriveTenantId(target.department) !== deriveTenantId(caller.department)
  ) {
    throw new TenantIsolationError("Accès refusé : utilisateur hors de votre organisation.");
  }
  if (target.role === "SUPER_ADMIN" && caller.role !== "SUPER_ADMIN") {
    throw new TenantIsolationError("Seul un Super Admin peut modifier un compte Super Admin.");
  }
  if (input.role === "SUPER_ADMIN" && caller.role !== "SUPER_ADMIN") {
    throw new TenantIsolationError("Seul un Super Admin peut attribuer le rôle SUPER_ADMIN.");
  }

  if (target.id === caller.id && input.status === "suspended") {
    throw new Error("Impossible de suspendre votre propre compte actif.");
  }
  if (
    target.role === "SUPER_ADMIN" &&
    (input.status === "suspended" || (input.role && input.role !== "SUPER_ADMIN"))
  ) {
    const otherActiveSuperAdmins = usersRegistry.filter(
      (u) => u.id !== target.id && u.role === "SUPER_ADMIN" && u.status === "active"
    );
    if (otherActiveSuperAdmins.length === 0) {
      throw new Error("Au moins un Super Admin actif doit rester configuré.");
    }
  }

  if (input.role) {
    target.role = input.role;
    if (!input.permissions) {
      target.permissions = [
        ...(ROLE_PERMISSION_PRESETS[input.role] || ROLE_PERMISSION_PRESETS.LECTEUR),
      ];
    }
  }
  if (Array.isArray(input.permissions)) {
    target.permissions = input.permissions.filter((p): p is Permission =>
      ALL_PERMISSIONS.includes(p)
    );
  }
  if (input.status) {
    target.status = input.status;
  }
  let modifiedSpaces: (typeof tenantSpacesRegistry)[number][] = [];
  if (Array.isArray(input.spaceIds)) {
    modifiedSpaces = assignUserToSpaces(target, input.spaceIds);
  }

  persistUsersState([target], modifiedSpaces);
  return target;
}

export function listManageableUsers(caller: AuthPrincipal): AuthPrincipal[] {
  ensureUsersHydrated();
  if (caller.role === "SUPER_ADMIN") {
    return usersRegistry.map((u) => ({ ...u, permissions: [...u.permissions] }));
  }
  const callerTenant = deriveTenantId(caller.department);
  return usersRegistry
    .filter((u) => deriveTenantId(u.department) === callerTenant)
    .map((u) => ({ ...u, permissions: [...u.permissions] }));
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function extractSessionToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const rawCookie = Array.isArray(req.headers.cookie)
    ? req.headers.cookie.join("; ")
    : req.headers.cookie;
  const cookies = parseCookies(rawCookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

export function authenticateRequest(req: IncomingMessage): AuthPrincipal {
  const token = extractSessionToken(req);
  if (!token) {
    throw new AuthUnauthorizedError(
      "Authentification requise : aucune session signée (cookie ou Bearer JWT)."
    );
  }
  return verifySessionJwt(token);
}

export function isHttpsRequest(req?: IncomingMessage): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (!req) return false;
  const proto = req.headers["x-forwarded-proto"];
  if (typeof proto === "string" && proto.split(",")[0].trim().toLowerCase() === "https") {
    return true;
  }
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.startsWith("https://")) {
    return true;
  }
  return false;
}

export function buildSessionCookieHeader(
  token: string,
  maxAgeSeconds = SESSION_TTL_SECONDS,
  req?: IncomingMessage
): string {
  const secure = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    secure ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookieHeader(req?: IncomingMessage): string {
  const secure = isHttpsRequest(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    secure ? "SameSite=None" : "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
