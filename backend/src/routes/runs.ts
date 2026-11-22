import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { executeDeterministicRun, runGuardianAgent } from "../agent/agent";
import { askNaturalLanguageSpaceQuestion } from "../agent/nlq";
import { AuthUnauthorizedError } from "../auth";
import { GenericConnector } from "../connectors/generic";
import { runUnexpectedCasesEvaluation } from "../evaluation/unexpectedEval";
import { ensureSpaceDirectories, journalRepo } from "../journal";
import { listRunEmailSummaries } from "../notify/index";
import { generateWeeklySpaceDocxBuffer } from "../reports/weeklyDocx";
import { TenantIsolationError } from "../tenant";
import { pollApiSourcesAllSpaces, processInboxFilePath, runNightlyCheckAllSpaces } from "../worker";
import { readJsonBody, resolveHttpContext, sendJson } from "./sources";

const TriggerRunSchema = z.object({
  spaceId: z.string().optional(),
  sourceId: z.string().optional(),
  mode: z
    .enum([
      "agent",
      "deterministic",
      "nightly",
      "autonomous_sync",
      "demo_kobo_ingest",
      "inbox_drop",
    ])
    .default("agent"),
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
      await journalRepo.flushPg();
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

      const emailSummaries = listRunEmailSummaries(ctx);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runs: journalRepo.listRuns(ctx),
        anomalies: spaceAnomalies,
        emailSummaries,
        automation: {
          nightlyCron: process.env.CRON_SCHEDULE?.trim() || "0 2 * * *",
          pollingCron: process.env.MEAL_POLL_CRON || "*/15 * * * *",
          inboxWatched: true,
        },
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

      if (body.mode === "demo_kobo_ingest") {
        const src = journalRepo.ensureSourceForType(ctx, "generic", "Export CommCare / Kobo Anonymisé", {
          format: "kobo",
        });
        const suffix = journalRepo.listNormalizedRecords(ctx, { includeArchived: true }).length > 0
          ? `-${Date.now().toString().slice(-4)}`
          : "";
        const rawItems: Record<string, unknown>[] = [
          {
            _id: `KOBO-01${suffix}`,
            nom_complet: "Aminata Ndiaye",
            telephone: "+221771110001",
            age: 29,
            montant: 450,
            _geolocation: [14.7167, -17.4677],
            zone: "Dakar",
            enqueteur: "ENQ-01",
            q_menage: "oui",
            q_eau: "forage",
          },
          {
            _id: `KOBO-02${suffix}`,
            nom_complet: "Aminata Ndiaye",
            telephone: "00221771110001",
            age: 29,
            montant: 450,
            _geolocation: [14.7167, -17.4677],
            zone: "Dakar",
            enqueteur: "ENQ-01",
            q_menage: "oui",
            q_eau: "forage",
          },
          {
            _id: `KOBO-03${suffix}`,
            nom_complet: "Kadiatou Traoré",
            telephone: "+221775551100",
            age: 33,
            montant: 500,
            _geolocation: [14.721, -17.462],
            zone: "Dakar",
            enqueteur: "ENQ-02",
            q_menage: "oui",
            q_eau: "reseau",
          },
          {
            _id: `KOBO-04${suffix}`,
            nom_complet: "Kadiatou Traore",
            telephone: "+221775551109",
            age: 34,
            montant: 500,
            _geolocation: [14.721, -17.462],
            zone: "Dakar",
            enqueteur: "ENQ-02",
            q_menage: "oui",
            q_eau: "reseau",
          },
          {
            _id: `KOBO-05${suffix}`,
            nom_complet: "Moussa Fall",
            telephone: "+221771110003",
            age: 178,
            montant: 500,
            _geolocation: [14.79, -16.94],
            zone: "Thiès",
            enqueteur: "ENQ-03",
            q_menage: "non",
            q_eau: "puit",
          },
          {
            _id: `KOBO-06${suffix}`,
            nom_complet: "Fatou Sow",
            telephone: "+221771110004",
            age: 34,
            montant: 520,
            _geolocation: [14.14, -16.07],
            zone: "Dakar",
            enqueteur: "ENQ-03",
            q_menage: "oui",
            q_eau: "reseau",
          },
          {
            _id: `KOBO-07${suffix}`,
            nom_complet: "Awa Ba",
            telephone: "+221772220005",
            age: 32,
            montant: 600,
            _geolocation: [14.15, -16.08],
            zone: "Kaolack",
            enqueteur: "ENQ-04",
            q_menage: "oui",
            q_eau: "puit",
          },
          {
            _id: `KOBO-08${suffix}`,
            nom_complet: "Mariama Sy",
            telephone: "+221772220006",
            age: 32,
            montant: 600,
            _geolocation: [14.15, -16.08],
            zone: "Kaolack",
            enqueteur: "ENQ-04",
            q_menage: "oui",
            q_eau: "puit",
          },
          {
            _id: `KOBO-09${suffix}`,
            nom_complet: "Kadiatou Diop",
            telephone: "+221772220007",
            age: 32,
            montant: 600,
            _geolocation: [14.15, -16.08],
            zone: "Kaolack",
            enqueteur: "ENQ-04",
            q_menage: "oui",
            q_eau: "puit",
          },
          {
            _id: `KOBO-10${suffix}`,
            nom_complet: "Oumar Kane",
            telephone: "+221773330008",
            age: 41,
            montant: 480,
            _geolocation: [16.01, -16.49],
            zone: "Saint-Louis",
            enqueteur: "ENQ-05",
            q_menage: "oui",
            q_eau: "reseau",
          },
          {
            _id: `KOBO-11${suffix}`,
            nom_complet: "Ibrahima Seck",
            telephone: "+221773330009",
            age: 37,
            montant: 510,
            _geolocation: [12.56, -16.27],
            zone: "Ziguinchor",
            enqueteur: "ENQ-06",
            q_menage: "non",
            q_eau: "forage",
          },
          {
            _id: `KOBO-12${suffix}`,
            nom_complet: "Binta Touré",
            telephone: "+221773330010",
            age: 26,
            montant: 430,
            _geolocation: [14.72, -17.45],
            zone: "Dakar",
            enqueteur: "ENQ-07",
            q_menage: "oui",
            q_eau: "reseau",
          },
          {
            _id: `KOBO-13${suffix}`,
            nom_complet: "Cheikh Mbaye",
            telephone: "+221773330011",
            age: 45,
            montant: 620,
            _geolocation: [14.8, -16.93],
            zone: "Thiès",
            enqueteur: "ENQ-08",
            q_menage: "non",
            q_eau: "puit",
          },
          {
            _id: `KOBO-14${suffix}`,
            nom_complet: "Ndeye Sene",
            telephone: "+221773330012",
            age: 31,
            montant: 470,
            _geolocation: [14.16, -16.09],
            zone: "Kaolack",
            enqueteur: "ENQ-09",
            q_menage: "oui",
            q_eau: "forage",
          },
        ];
        const ingest = await new GenericConnector().ingest({ source: src, rawItems }, ctx);
        const agentRes = await runGuardianAgent(ctx, { sourceId: src.id, trigger: "submission" });
        await journalRepo.flushPg();
        return sendJson(res, 200, {
          tenantId: ctx.tenantId,
          spaceId: ctx.spaceId,
          ingest,
          ...agentRes,
        });
      }

      if (body.mode === "inbox_drop") {
        const { inboxDir } = ensureSpaceDirectories(ctx);
        const fileName = `commcare_export_${Date.now()}.csv`;
        const filePath = path.join(inboxDir, fileName);
        const ts = Date.now().toString().slice(-4);
        const csvLines = [
          "externalId,fullName,phone,age,amount,latitude,longitude,zone,enumeratorId",
          `INB-1-${ts},Aissatou Gueye,+2217744011${ts.slice(-2)},28,450,14.7167,-17.4677,Dakar,ENQ-11`,
          `INB-2-${ts},Modou Diallo,+2217744022${ts.slice(-2)},184,520,14.718,-17.461,Dakar,ENQ-11`,
          `INB-3-${ts},Salimata Faye,+2217744033${ts.slice(-2)},35,490,14.14,-16.07,Dakar,ENQ-12`,
        ];
        fs.writeFileSync(filePath, csvLines.join("\n"), "utf8");
        const processed = await processInboxFilePath(filePath);
        return sendJson(res, 200, {
          tenantId: ctx.tenantId,
          spaceId: ctx.spaceId,
          fileName,
          processed,
        });
      }

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
