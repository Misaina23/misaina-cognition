import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { executeDeterministicRun, runGuardianAgent } from "../agent/agent";
import { journalRepo } from "../journal";
import { TenantIsolationError } from "../tenant";
import { runNightlyCheckAllSpaces } from "../worker";
import { readJsonBody, resolveHttpContext, sendJson } from "./sources";

const TriggerRunSchema = z.object({
  spaceId: z.string().optional(),
  sourceId: z.string().optional(),
  mode: z.enum(["agent", "deterministic", "nightly"]).default("agent"),
});

export async function handleRunsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    if (url.pathname === "/api/rules") {
      if (req.method === "GET") {
        const { ctx } = resolveHttpContext(req, url);
        const rules = journalRepo.getProjectRules(ctx);
        return sendJson(res, 200, { tenantId: ctx.tenantId, spaceId: ctx.spaceId, ...rules });
      }
      if (req.method === "PUT") {
        const body = (await readJsonBody(req)) as { spaceId?: string; yaml?: string };
        const { ctx } = resolveHttpContext(req, url, body.spaceId);
        const saved = journalRepo.setProjectRulesYaml(ctx, body.yaml || "");
        return sendJson(res, 200, { tenantId: ctx.tenantId, spaceId: ctx.spaceId, ...saved });
      }
    }

    if (url.pathname === "/api/records" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const records = journalRepo.listNormalizedRecords(ctx, { includeArchived });
      return sendJson(res, 200, { tenantId: ctx.tenantId, spaceId: ctx.spaceId, records });
    }

    if (req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runs: journalRepo.listRuns(ctx),
        anomalies: journalRepo.listAnomalies(ctx),
      });
    }

    if (req.method === "POST") {
      const body = TriggerRunSchema.parse(await readJsonBody(req));
      if (body.mode === "nightly") {
        resolveHttpContext(req, url, body.spaceId);
        return sendJson(res, 200, runNightlyCheckAllSpaces());
      }
      const { ctx } = resolveHttpContext(req, url, body.spaceId);
      const sourceId = body.sourceId || journalRepo.listSources(ctx)[0]?.id || "manual";
      if (body.mode === "deterministic") {
        return sendJson(res, 200, executeDeterministicRun(ctx, { sourceId, trigger: "manual" }));
      }
      const agentRes = await runGuardianAgent(ctx, { sourceId, trigger: "manual" });
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        ...agentRes,
      });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    if (err instanceof TenantIsolationError) return sendJson(res, 403, { message: err.message });
    return sendJson(res, 400, { message: err instanceof Error ? err.message : "Erreur runs" });
  }
}
