import http from "node:http";
import { checkPgHealth, closePgPool } from "./pgStore";
import { handleActionsRoute } from "./routes/actions";
import { handleRunsRoute } from "./routes/runs";
import { handleSourcesRoute, sendJson } from "./routes/sources";
import { startWorker, stopWorker } from "./worker";

const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

export function createGuardianServer() {
  return http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-User-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/health") {
      const health = await checkPgHealth();
      return sendJson(res, health.ok ? 200 : 503, {
        status: health.ok ? "ok" : "error",
        service: "gardien-donnees-backend",
        storage: health.storage,
      });
    }
    if (url.pathname.startsWith("/api/sources") || url.pathname.startsWith("/api/spaces")) {
      return handleSourcesRoute(req, res, url);
    }
    if (
      url.pathname.startsWith("/api/runs") ||
      url.pathname.startsWith("/api/rules") ||
      url.pathname.startsWith("/api/records")
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
  startWorker();
  const server = createGuardianServer();
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
