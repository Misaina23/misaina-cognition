import crypto from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import net from "node:net";
import path from "node:path";
import { ZodError } from "zod";
import { AccountStatusError, AuthUnauthorizedError } from "./auth";
import { TenantIsolationError } from "./tenant";

function isTestProcess(): boolean {
  return (
    process.env.GUARDIAN_DISABLE_DISK_STATE === "1" ||
    process.argv.some((arg) =>
      /[/\\](tests|scripts)[/\\]|evaluate\.|idempotence\.test|isolation\.test/.test(arg)
    )
  );
}

function getBackendRoot(): string {
  const cwd = process.cwd();
  return fs.existsSync(path.join(cwd, "config", "projects")) ? cwd : path.join(cwd, "backend");
}

let cachedSealSecret: string | null = null;

/**
 * Retourne le secret HMAC-SHA256 pour le scellement cryptographique des citations RAG.
 * Priorité : CITATION_SEAL_SECRET (env) -> fichier local .seal-secret (mode 0600) -> CSPRNG éphémère en test.
 */
export function getCitationSealSecret(): string {
  const fromEnv = process.env.CITATION_SEAL_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    return fromEnv;
  }
  if (cachedSealSecret) return cachedSealSecret;

  if (!isTestProcess()) {
    try {
      const secretPath = path.join(getBackendRoot(), "data", ".seal-secret");
      if (fs.existsSync(secretPath)) {
        const existing = fs.readFileSync(secretPath, "utf8").trim();
        if (existing.length >= 32) {
          cachedSealSecret = existing;
          return cachedSealSecret;
        }
      }
      fs.mkdirSync(path.dirname(secretPath), { recursive: true });
      const generated = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(secretPath, generated, { mode: 0o600, encoding: "utf8" });
      cachedSealSecret = generated;
      return cachedSealSecret;
    } catch {
      // Fallback en mémoire si système de fichiers en lecture seule
    }
  }

  cachedSealSecret = crypto.randomBytes(32).toString("hex");
  return cachedSealSecret;
}

/**
 * Validation SSRF pour les endpoints externes des connecteurs (CommCare, Kobo, ODK, JSON).
 */
export function validateExternalEndpointUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("URL de connecteur invalide.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Seuls les protocoles HTTP et HTTPS sont autorisés pour les connecteurs.");
  }

  if (process.env.ALLOW_PRIVATE_ENDPOINTS === "1") {
    return parsed;
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "::"
  ) {
    throw new Error("Adresse réseau locale ou interne interdite pour un connecteur externe.");
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((n) => Number(n));
    const [a, b] = parts;
    const isPrivateV4 =
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
    if (isPrivateV4) {
      throw new Error("Plage IP privée ou métadonnées cloud interdite pour un connecteur externe.");
    }
  } else if (ipVersion === 6) {
    const lower = host.toLowerCase();
    if (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:169.254.") ||
      lower.startsWith("::ffff:192.168.")
    ) {
      throw new Error("Adresse IPv6 privée ou locale interdite pour un connecteur externe.");
    }
  }

  return parsed;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Limiteur de débit par fenêtre glissante en mémoire (protection brute-force et anti-spam).
 */
export class SlidingWindowRateLimiter {
  private buckets = new Map<string, number[]>();

  consume(key: string, maxRequests: number, windowMs: number): RateLimitDecision {
    const now = Date.now();
    const cutoff = now - windowMs;
    const prev = this.buckets.get(key) || [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= maxRequests) {
      const oldest = active[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.buckets.set(key, active);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    active.push(now);
    this.buckets.set(key, active);

    if (this.buckets.size > 5000) {
      for (const [k, list] of this.buckets.entries()) {
        if (list.length === 0 || list[list.length - 1] <= cutoff) {
          this.buckets.delete(k);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - active.length),
      retryAfterSeconds: 0,
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}

export const publicApiRateLimiter = new SlidingWindowRateLimiter();

export function getClientIpAddress(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function formatApiError(
  err: unknown,
  fallbackMessage = "Erreur de traitement de la requête"
): { status: number; message: string } {
  if (err instanceof AuthUnauthorizedError) {
    return { status: 401, message: err.message };
  }
  if (err instanceof AccountStatusError || err instanceof TenantIsolationError) {
    return { status: 403, message: err.message };
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const pathLabel = first?.path?.length ? `${first.path.join(".")} : ` : "";
    return {
      status: 400,
      message: first ? `Validation invalide (${pathLabel}${first.message}).` : "Paramètres invalides.",
    };
  }
  if (err instanceof SyntaxError) {
    return { status: 400, message: "Corps JSON malformé." };
  }
  const msg = err instanceof Error ? err.message : fallbackMessage;
  if (msg.includes("existe déjà")) {
    return { status: 409, message: msg };
  }
  return { status: 400, message: msg || fallbackMessage };
}
