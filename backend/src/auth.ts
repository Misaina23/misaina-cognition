import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { DEFAULT_USERS, type AuthPrincipal } from "./tenant";

export const SESSION_COOKIE_NAME = "gardien_session";
export const SESSION_TTL_SECONDS = 86400; // 24h

export class AuthUnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message = "Authentification requise : session absente ou invalide.") {
    super(message);
    this.name = "AuthUnauthorizedError";
  }
}

// Empreintes scrypt salées (sel_hex:hash_hex) — aucun mot de passe en clair stocké
const USER_PASSWORD_HASHES: Record<string, string> = {
  "u-1":
    "7f2fec4e39e3de4672a2542841ee5c23:39afc0ce37c27f82f5890012856d09e66466e788cbb41abdeeed8ea9e30de237",
  "u-3":
    "2f4c531b30e3227b0816517196cfd4f5:8bdca9e418bdbd747331d441d8c9320bd431038d109f9c843ea5eef4144fd741",
};

let cachedRuntimeSecret: string | null = null;

function getJwtSecret(): string {
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim().length >= 16) {
    return process.env.AUTH_SECRET.trim();
  }
  if (cachedRuntimeSecret) return cachedRuntimeSecret;

  const isTest =
    process.env.GUARDIAN_DISABLE_DISK_STATE === "1" ||
    process.argv.some((arg) => /[/\\](tests|scripts)[/\\]/.test(arg));

  if (!isTest) {
    try {
      const cwd = process.cwd();
      const base = fs.existsSync(path.join(cwd, "config", "projects"))
        ? cwd
        : path.join(cwd, "backend");
      const secretPath = path.join(base, "data", ".session-secret");
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

  const principal = DEFAULT_USERS.find((u) => u.id === claims.sub);
  if (!principal) {
    throw new AuthUnauthorizedError("Utilisateur associé à la session introuvable.");
  }
  return principal;
}

export function verifyUserCredentials(email: string, password: string): AuthPrincipal | null {
  const normalizedEmail = email.trim().toLowerCase();
  const user = DEFAULT_USERS.find((u) => u.email.toLowerCase() === normalizedEmail);
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
  return user;
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
