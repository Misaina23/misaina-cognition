import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { executeDeterministicRun, runGuardianAgent } from "../agent/agent";
import { askNaturalLanguageSpaceQuestion } from "../agent/nlq";
import { AuthUnauthorizedError } from "../auth";
import { runUnexpectedCasesEvaluation } from "../evaluation/unexpectedEval";
import { journalRepo } from "../journal";
import { generateWeeklySpaceDocxBuffer } from "../reports/weeklyDocx";
import { TenantIsolationError } from "../tenant";
import { pollApiSourcesAllSpaces, runNightlyCheckAllSpaces } from "../worker";
import { readJsonBody, resolveHttpContext, sendJson } from "./sources";

const TriggerRunSchema = z.object({
  spaceId: z.string().optional(),
  sourceId: z.string().optional(),
  mode: z.enum(["agent", "deterministic", "nightly", "autonomous_sync"]).default("agent"),
});

const NlqBodySchema = z.object({
  spaceId: z.string().optional(),
  question: z.string().min(1),
});

export async function handleRunsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();

    if (url.pathname === "/api/rules/feedback" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        feedback: journalRepo.listRuleFeedback(ctx),
        suggestions: journalRepo.getRuleThresholdSuggestions(ctx),
      });
    }

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
        await journalRepo.flushPg();
        return sendJson(res, 200, { tenantId: ctx.tenantId, spaceId: ctx.spaceId, ...saved });
      }
    }

    if (url.pathname === "/api/records" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const records = journalRepo.listNormalizedRecords(ctx, { includeArchived });
      return sendJson(res, 200, { tenantId: ctx.tenantId, spaceId: ctx.spaceId, records });
    }

    if (url.pathname === "/api/evaluation/unexpected" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      const { config: rules } = journalRepo.getProjectRules(ctx);
      const report = await runUnexpectedCasesEvaluation(rules);
      return sendJson(res, 200, report);
    }

    if (url.pathname === "/api/reports/weekly" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      const { buffer, fileName } = await generateWeeklySpaceDocxBuffer(ctx);
      res.writeHead(200, {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": buffer.length,
      });
      res.end(buffer);
      return;
    }

    if (url.pathname === "/api/query" && req.method === "POST") {
      const body = NlqBodySchema.parse(await readJsonBody(req));
      const { ctx } = resolveHttpContext(req, url, body.spaceId);
      const result = await askNaturalLanguageSpaceQuestion(ctx, body.question);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      const spaceRecords = journalRepo.listNormalizedRecords(ctx, { includeArchived: true });
      const activeRecords = spaceRecords.filter((r) => r.status === "active");
      const spaceAnomalies = journalRepo.listAnomalies(ctx);
      const zonesCovered = Array.from(
        new Set(activeRecords.map((r) => r.zone).filter((z): z is string => Boolean(z)))
      );
      const enumeratorsCount = new Set(
        activeRecords.map((r) => r.enumeratorId).filter((e): e is string => Boolean(e))
      ).size;

      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runs: journalRepo.listRuns(ctx),
        anomalies: spaceAnomalies,
        mealIndicators: {
          activeBeneficiaries: activeRecords.length,
          cleanedRecords: spaceRecords.length - activeRecords.length,
          zonesCoveredCount: zonesCovered.length,
          zonesCovered,
          enumeratorsCount,
          copyPasteAlerts: spaceAnomalies.filter((a) => a.category === "enumerator_copy_paste")
            .length,
          totalAmountDisbursed: activeRecords.reduce((sum, r) => sum + (r.amount || 0), 0),
        },
      });
    }

    if (req.method === "POST") {
      const body = TriggerRunSchema.parse(await readJsonBody(req));
      if (body.mode === "nightly") {
        resolveHttpContext(req, url, body.spaceId);
        const summary = runNightlyCheckAllSpaces();
        await journalRepo.flushPg();
        return sendJson(res, 200, summary);
      }
      if (body.mode === "autonomous_sync") {
        resolveHttpContext(req, url, body.spaceId);
        const pollSummary = await pollApiSourcesAllSpaces();
        return sendJson(res, 200, pollSummary);
      }
      const { ctx } = resolveHttpContext(req, url, body.spaceId);
      const sourceId = body.sourceId || journalRepo.listSources(ctx)[0]?.id || "manual";
      if (body.mode === "deterministic") {
        const resDet = executeDeterministicRun(ctx, { sourceId, trigger: "manual" });
        await journalRepo.flushPg();
        return sendJson(res, 200, resDet);
      }
      const agentRes = await runGuardianAgent(ctx, { sourceId, trigger: "manual" });
      await journalRepo.flushPg();
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        ...agentRes,
      });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) return sendJson(res, 401, { message: err.message });
    if (err instanceof TenantIsolationError) return sendJson(res, 403, { message: err.message });
    return sendJson(res, 400, { message: err instanceof Error ? err.message : "Erreur runs" });
  }
}
