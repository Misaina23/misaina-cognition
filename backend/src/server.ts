import http from "node:http";
import { journalRepo } from "./journal";
import { createLlmProvider } from "./llm/provider";
import { checkPgHealth, closePgPool } from "./pgStore";
import { knowledgeEngine } from "./rag/engine";
import { handleActionsRoute } from "./routes/actions";
import { handleAuthRoute } from "./routes/auth";
import { handleKnowledgeRoute } from "./routes/knowledge";
import { handleRunsRoute } from "./routes/runs";
import { handleSourcesRoute, sendJson } from "./routes/sources";
import { handleUsersRoute } from "./routes/users";
import { getClientIpAddress, publicApiRateLimiter } from "./security";
import { startWorker, stopWorker } from "./worker";

const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function getAllowedCorsOrigins(): string[] {
  const raw = [process.env.CORS_ORIGIN, process.env.FRONTEND_URL]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(",");
  const parsed = raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  return parsed.length > 0 ? Array.from(new Set(parsed)) : ["http://localhost:3000"];
}

function isOriginAllowed(requestOrigin: string, allowedOrigins: string[]): boolean {
  const normalized = normalizeOrigin(requestOrigin);
  if (allowedOrigins.includes("*")) return true;
  if (allowedOrigins.includes(normalized)) return true;
  if (allowedOrigins.includes("http://localhost:3000")) return true;

  for (const pattern of allowedOrigins) {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+")}$`
      );
      if (regex.test(normalized)) return true;
    }
    try {
      const reqUrl = new URL(normalized);
      const allowedUrl = new URL(pattern);
      if (
        reqUrl.protocol === allowedUrl.protocol &&
        allowedUrl.hostname.endsWith(".vercel.app") &&
        reqUrl.hostname.endsWith(".vercel.app")
      ) {
        const projectPrefix = allowedUrl.hostname.replace(/\.vercel\.app$/, "");
        if (
          reqUrl.hostname === allowedUrl.hostname ||
          reqUrl.hostname.startsWith(`${projectPrefix}-`)
        ) {
          return true;
        }
      }
    } catch {
      // ignore invalid URL pattern
    }
  }
  return false;
}

export function createGuardianServer() {
  return http.createServer(async (req, res) => {
    const allowedOrigins = getAllowedCorsOrigins();
    const requestOrigin = req.headers.origin;
    const allowOrigin =
      allowedOrigins.includes("*")
        ? "*"
        : requestOrigin && isOriginAllowed(requestOrigin, allowedOrigins)
          ? requestOrigin
          : allowedOrigins[0];

    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    if (allowOrigin !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Webhook-Secret,X-Requested-With"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Rate limiting sur endpoints publics et authentification
    const clientIp = getClientIpAddress(req);
    if (req.method === "POST") {
      let rateDecision: { allowed: boolean; retryAfterSeconds: number } | null = null;
      if (url.pathname === "/api/auth/login") {
        rateDecision = publicApiRateLimiter.consume(`login:${clientIp}`, 30, 5 * 60 * 1000);
      } else if (url.pathname === "/api/auth/register") {
        rateDecision = publicApiRateLimiter.consume(`register:${clientIp}`, 15, 10 * 60 * 1000);
      } else if (url.pathname === "/api/contact/enterprise") {
        rateDecision = publicApiRateLimiter.consume(`contact:${clientIp}`, 10, 10 * 60 * 1000);
      }
      if (rateDecision && !rateDecision.allowed) {
        res.setHeader("Retry-After", String(rateDecision.retryAfterSeconds));
        return sendJson(res, 429, {
          message: `Trop de tentatives. Veuillez réessayer dans ${rateDecision.retryAfterSeconds}s.`,
        });
      }
    }

    // CSRF protection on cookie-authenticated mutating requests
    const method = (req.method || "GET").toUpperCase();
    const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    const usesBearer =
      typeof req.headers.authorization === "string" &&
      req.headers.authorization.startsWith("Bearer ");
    const hasSessionCookie =
      typeof req.headers.cookie === "string" && req.headers.cookie.includes("gardien_session=");
    const isCsrfExempt =
      url.pathname === "/api/auth/login" ||
      url.pathname === "/api/auth/register" ||
      url.pathname === "/api/auth/logout" ||
      url.pathname === "/api/contact/enterprise" ||
      url.pathname.startsWith("/api/webhooks/ingest/");

    if (isMutating && hasSessionCookie && !usesBearer && !isCsrfExempt) {
      const hasCustomHeader = Boolean(req.headers["x-requested-with"]);
      const expectedHost = String(
        req.headers["x-forwarded-host"] || req.headers.host || ""
      )
        .split(",")[0]
        .trim()
        .toLowerCase();
      let originMatchesHost = false;
      if (requestOrigin && expectedHost) {
        try {
          originMatchesHost = new URL(requestOrigin).host.toLowerCase() === expectedHost;
        } catch {
          originMatchesHost = false;
        }
      }
      if (!hasCustomHeader && !originMatchesHost) {
        return sendJson(res, 403, {
          message: "Requête mutative refusée (vérification CSRF manquante).",
        });
      }
    }

    if (url.pathname === "/api/health") {
      const health = await checkPgHealth();
      const activeLlm = createLlmProvider();
      return sendJson(res, health.ok ? 200 : 503, {
        status: health.ok ? "ok" : "error",
        service: "misaina-meal-backend",
        storage: health.storage,
        llmProvider: activeLlm.providerName,
        llmModel: activeLlm.modelName,
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }
    if (url.pathname.startsWith("/api/auth")) {
      return handleAuthRoute(req, res, url);
    }
    if (url.pathname.startsWith("/api/users")) {
      return handleUsersRoute(req, res, url);
    }
    if (
      url.pathname.startsWith("/api/sources") ||
      url.pathname.startsWith("/api/spaces") ||
      url.pathname.startsWith("/api/webhooks")
    ) {
      return handleSourcesRoute(req, res, url);
    }
    if (
      url.pathname.startsWith("/api/runs") ||
      url.pathname.startsWith("/api/rules") ||
      url.pathname.startsWith("/api/records") ||
      url.pathname.startsWith("/api/evaluation") ||
      url.pathname.startsWith("/api/reports") ||
      url.pathname.startsWith("/api/query")
    ) {
      return handleRunsRoute(req, res, url);
    }
    if (url.pathname.startsWith("/api/actions") || url.pathname.startsWith("/api/validations")) {
      return handleActionsRoute(req, res, url);
    }
    if (url.pathname.startsWith("/api/knowledge") || url.pathname.startsWith("/api/contact")) {
      return handleKnowledgeRoute(req, res, url);
    }

    return sendJson(res, 404, { message: "Route API introuvable" });
  });
}

if (require.main === module) {
  const server = createGuardianServer();
  void Promise.all([journalRepo.ensureReady(), knowledgeEngine.ensureReady()])
    .catch((err) => {
      console.error("Erreur hydratation initiale du journal :", err);
    })
    .finally(() => {
      startWorker();
    });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend Gardien de données démarré sur http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    await stopWorker();
    server.close(async () => {
      await closePgPool();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
