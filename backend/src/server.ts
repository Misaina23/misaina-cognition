import http from "node:http";
import { journalRepo } from "./journal";
import { createLlmProvider } from "./llm/provider";
import { checkPgHealth, closePgPool } from "./pgStore";
import { handleActionsRoute } from "./routes/actions";
import { handleAuthRoute } from "./routes/auth";
import { handleRunsRoute } from "./routes/runs";
import { handleSourcesRoute, sendJson } from "./routes/sources";
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

export function createGuardianServer() {
  return http.createServer(async (req, res) => {
    const allowedOrigins = getAllowedCorsOrigins();
    const requestOrigin = req.headers.origin;
    const normalizedRequestOrigin = requestOrigin ? normalizeOrigin(requestOrigin) : "";
    const allowOrigin =
      allowedOrigins.includes("*")
        ? "*"
        : normalizedRequestOrigin && allowedOrigins.includes(normalizedRequestOrigin)
          ? requestOrigin!
          : normalizedRequestOrigin && allowedOrigins.includes("http://localhost:3000")
            ? requestOrigin!
            : allowedOrigins[0];

    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    if (allowOrigin !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
      const health = await checkPgHealth();
      const activeLlm = createLlmProvider();
      return sendJson(res, health.ok ? 200 : 503, {
        status: health.ok ? "ok" : "error",
        service: "misaina-meal-backend",
        storage: health.storage,
        llmProvider: activeLlm.providerName,
        llmModel: activeLlm.modelName,
      });
    }
    if (url.pathname.startsWith("/api/auth")) {
      return handleAuthRoute(req, res, url);
    }
    if (url.pathname.startsWith("/api/sources") || url.pathname.startsWith("/api/spaces")) {
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

    return sendJson(res, 404, { message: "Route API introuvable" });
  });
}

if (require.main === module) {
  const server = createGuardianServer();
  void journalRepo
    .ensureReady()
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
