import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { load as loadYaml } from "js-yaml";
import type { LlmToolDeclaration } from "../llm/provider";
import { createLlmProvider } from "../llm/provider";
import { saveRawUploadToArchive } from "../journal";
import {
  applyImportedReport,
  calculateIndicatorProgress,
  loadMealWorkspace,
  periodDate,
  saveMealWorkspace,
  stableReportHash,
  targetForPeriod,
  type MealAuditAction,
  type MealIndicator,
  type MealObjective,
  type MealProject,
  type MealWorkspaceState,
  type ProgressStatus,
} from "../mealProjects";
import { journalRepo } from "../journal";
import { formatApiError } from "../security";
import { requirePermission } from "../tenant";
import { readJsonBody, resolveHttpContext, sendJson } from "./sources";

const ProjectSchema = z.object({
  spaceId: z.string().optional(),
  name: z.string().trim().min(2).max(200),
  startDate: z.string().date(),
  endDate: z.string().date(),
  zone: z.string().trim().max(200).default(""),
  donor: z.string().trim().max(200).default(""),
});
const ObjectiveSchema = z.object({
  spaceId: z.string().optional(),
  type: z.enum(["global", "specific"]),
  label: z.string().trim().min(2).max(500),
});
const IndicatorSchema = z.object({
  spaceId: z.string().optional(),
  objectiveId: z.string().min(1),
  name: z.string().trim().min(2).max(200),
  unit: z.string().trim().min(1).max(80),
  baseline: z.number().finite(),
  target: z.number().finite(),
  direction: z.enum(["increase", "decrease"]),
  frequency: z.enum(["monthly", "quarterly", "annual"]),
  periodType: z.enum(["cumulative", "monthly"]),
  verificationSource: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
}).refine(
  (input) =>
    input.direction === "increase"
      ? input.target >= input.baseline
      : input.target <= input.baseline,
  { message: "La cible doit respecter le sens souhaité par rapport à la baseline." }
);
const TargetSchema = z.object({
  spaceId: z.string().optional(),
  target: z.number().finite(),
  effectiveAt: z.string().date(),
  reason: z.string().trim().min(2).max(500),
});
const DecisionSchema = z.object({
  spaceId: z.string().optional(),
  valueId: z.string().min(1),
  decision: z.enum(["validated", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});
const ImportSchema = z.object({
  spaceId: z.string().optional(),
  projectId: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  fileBase64: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  periodHeader: z.string().optional(),
  mapping: z.record(z.string(), z.string()),
});
const SummarySchema = z.object({
  spaceId: z.string().optional(),
  projectId: z.string().min(1),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

const MEAL_AGENT_TOOLS: LlmToolDeclaration[] = [
  { name: "list_indicators", description: "Liste les indicateurs du projet, leurs valeurs validées et leur progression déjà calculée.", parameters: { type: "object", properties: {} } },
  { name: "get_history", description: "Consulte l’historique des valeurs d’un indicateur.", parameters: { type: "object", properties: { indicatorId: { type: "string" } }, required: ["indicatorId"] } },
  { name: "propose_value", description: "Signale une valeur déjà extraite et en attente de validation humaine.", parameters: { type: "object", properties: { valueId: { type: "string" }, reason: { type: "string" } }, required: ["valueId", "reason"] } },
  { name: "flag_inconsistency", description: "Place une valeur validée en attente de contrôle humain lorsqu’elle semble incohérente.", parameters: { type: "object", properties: { valueId: { type: "string" }, reason: { type: "string" } }, required: ["valueId", "reason"] } },
  { name: "write_monthly_summary", description: "Enregistre le résumé mensuel en français à partir des seuls faits vérifiés.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
];

const MEAL_LLM_MAX_CALLS = 5;
const MEAL_LLM_MAX_TOOL_CALLS = 12;
const MEAL_LLM_MAX_TOTAL_TOKENS = 8_000;
const MEAL_LLM_MAX_OUTPUT_TOKENS = 1_000;
const MEAL_LLM_MAX_INDICATORS = 250;

interface MonitoringThresholds {
  onTrackVariance: number;
  lateVariance: number;
  autoValidate: number;
  minimum: number;
  maxAbsoluteJump: number;
  maxRelativeJump: number;
}

function getThresholds(): MonitoringThresholds {
  const cwd = process.cwd();
  const root = fs.existsSync(path.join(cwd, "config", "projects"))
    ? cwd
    : path.join(cwd, "backend");
  const file = path.join(root, "config", "projects", "meal-monitoring.yaml");
  const config = loadYaml(fs.readFileSync(file, "utf8")) as {
    progress: { onTrackVariance: number; lateVariance: number };
    confidence: { autoValidate: number; minimum: number };
    anomaly: { maxAbsoluteJump: number; maxRelativeJump: number };
  };
  return {
    ...config.progress,
    ...config.confidence,
    ...config.anomaly,
  };
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${createHash("sha1").update(`${Math.random()}`).digest("hex").slice(0, 8)}`;
}

function cloneState(state: MealWorkspaceState): MealWorkspaceState {
  return structuredClone(state);
}

async function saveAction(
  ctx: ReturnType<typeof resolveHttpContext>["ctx"],
  userId: string,
  state: MealWorkspaceState,
  beforeState: MealWorkspaceState,
  action: string,
  reversible = true
): Promise<void> {
  const previousTimestamp = state.actions[0]?.timestamp;
  const entry: MealAuditAction = {
    id: newId("meal-action"),
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    actorId: userId,
    action,
    timestamp: new Date(
      previousTimestamp ? Math.max(Date.now(), Date.parse(previousTimestamp) + 1) : Date.now()
    ).toISOString(),
    reversible,
    beforeState,
  };
  state.actions.unshift(entry);
  journalRepo.addAgentAction(ctx, {
    id: entry.id,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId: `meal-project-${entry.id}`,
    timestamp: entry.timestamp,
    toolName: action,
    inputs: {},
    output: { actionId: entry.id },
    decision: action,
    confidence: 1,
    author: "human",
    authorId: userId,
    reversible: false,
    reverted: false,
  });
  await saveMealWorkspace(ctx, state);
  await journalRepo.flushPg();
}

function isProjectOwned(state: MealWorkspaceState, ctx: { tenantId: string; spaceId: string }, projectId: string) {
  return state.projects.find(
    (project) =>
      project.id === projectId && project.tenantId === ctx.tenantId && project.spaceId === ctx.spaceId
  );
}

async function parseExcel(buffer: Buffer): Promise<{
  headers: string[];
  rows: Array<{ rowNumber: number; cells: Record<string, unknown>; addresses: Record<string, string> }>;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Le classeur Excel ne contient aucune feuille.");
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? `col_${colNumber}`).trim();
  });
  if (!headers.some(Boolean)) throw new Error("La première ligne Excel ne contient pas d’en-têtes.");
  const rows: Array<{ rowNumber: number; cells: Record<string, unknown>; addresses: Record<string, string> }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Record<string, unknown> = {};
    const addresses: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      const value = cell.value;
      cells[key] =
        value && typeof value === "object" && "text" in value
          ? (value as { text: string }).text
          : value instanceof Date
            ? value
            : value;
      addresses[key] = cell.address;
    });
    if (Object.keys(cells).length) rows.push({ rowNumber, cells, addresses });
  });
  return { headers, rows };
}

async function parsePdf(buffer: Buffer): Promise<{
  headers: string[];
  rows: Array<{ rowNumber: number; cells: Record<string, unknown>; addresses: Record<string, string> }>;
}> {
  const pdfParse = require("pdf-parse") as (
    data: Buffer,
    options?: {
      pagerender: (page: { getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }) => Promise<string>;
    }
  ) => Promise<{ text: string; numpages: number }>;
  const extracted = await pdfParse(buffer, {
    pagerender: async (page) => {
      const content = await page.getTextContent();
      return `${content.items.map((item) => item.str ?? "").join(" ")}\f`;
    },
  });
  const pages = extracted.text.split("\f");
  const headers: string[] = [];
  const rows: Array<{ rowNumber: number; cells: Record<string, unknown>; addresses: Record<string, string> }> = [];
  for (const [pageIndex, page] of pages.entries()) {
    for (const [lineIndex, rawLine] of page.split(/\r?\n/).entries()) {
      const line = rawLine.trim();
      if (!line) continue;
      const numbers = line.match(/-?\d[\d\s]*(?:[.,]\d+)?/g);
      if (!numbers?.length) continue;
      const header = `Page ${pageIndex + 1}, ligne ${lineIndex + 1}: ${line.slice(0, 180)}`;
      const parsed = Number(numbers[numbers.length - 1].replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(parsed)) continue;
      headers.push(header);
      rows.push({
        rowNumber: pageIndex + 1,
        cells: { [header]: parsed },
        addresses: { [header]: `Page ${pageIndex + 1}, ligne ${lineIndex + 1}` },
      });
      if (rows.length >= 1000) break;
    }
    if (rows.length >= 1000) break;
  }
  if (rows.length === 0) {
    throw new Error(
      `Aucun nombre lisible n’a été extrait du PDF (${extracted.numpages} page(s)). Les PDF scannés nécessitent un OCR séparé ; aucune valeur n’a été importée.`
    );
  }
  return { headers, rows };
}

async function parseReport(buffer: Buffer, fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) {
    return { ...await parsePdf(buffer), format: "pdf" as const };
  }
  if (fileName.toLowerCase().endsWith(".xlsx")) {
    return { ...await parseExcel(buffer), format: "xlsx" as const };
  }
  throw new Error("Format pris en charge : Excel .xlsx ou PDF texte.");
}

function statusLabel(status: ProgressStatus): string {
  return {
    on_track: "En bonne voie",
    late: "En retard",
    critical: "Critique",
    no_data: "Donnée manquante",
  }[status];
}

function projectProgress(state: MealWorkspaceState, project: MealProject, period: string) {
  const thresholds = getThresholds();
  const objectives = state.objectives.filter((item) => item.projectId === project.id);
  return objectives.map((objective) => ({
    objective,
    indicators: state.indicators
      .filter((indicator) => indicator.objectiveId === objective.id)
      .map((indicator) =>
        calculateIndicatorProgress(indicator, state.values, project, period, thresholds)
      ),
  }));
}

export async function handleProjectsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();
    const { user, ctx } = resolveHttpContext(req, url);
    const pathParts = url.pathname.split("/").filter(Boolean).slice(2);

    if (req.method === "GET" && pathParts.length === 0) {
      requirePermission(user, "meal:read");
      const state = await loadMealWorkspace(ctx);
      const period = url.searchParams.get("period") || new Date().toISOString().slice(0, 7);
      if (!periodDate(period)) return sendJson(res, 400, { message: "Période attendue au format AAAA-MM." });
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        projects: state.projects.map((project) => ({
          ...project,
          objectives: projectProgress(state, project, period),
        })),
        pendingValues: state.values.filter((value) => value.status === "proposed"),
        summaries: state.summaries,
        actions: state.actions.map(({ beforeState: _snapshot, ...action }) => action),
      });
    }

    if (req.method === "POST" && pathParts.length === 0) {
      requirePermission(user, "meal:ingest");
      const input = ProjectSchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      if (input.endDate <= input.startDate) {
        return sendJson(res, 400, { message: "La fin du projet doit être après son début." });
      }
      const state = await loadMealWorkspace(scopedCtx);
      const before = cloneState(state);
      const project: MealProject = {
        ...input,
        id: newId("project"),
        tenantId: scopedCtx.tenantId,
        spaceId: scopedCtx.spaceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.projects.unshift(project);
      await saveAction(scopedCtx, user.id, state, before, "meal_create_project");
      return sendJson(res, 201, { project });
    }

    if (pathParts[0] === "import" && pathParts[1] === "preview" && req.method === "POST") {
      requirePermission(user, "meal:ingest");
      const body = z.object({
        spaceId: z.string().optional(),
        fileName: z.string().min(1),
        fileBase64: z.string().min(1),
      }).parse(await readJsonBody(req));
      const { ctx: previewCtx } = resolveHttpContext(req, url, body.spaceId);
      const filename = body.fileName.toLowerCase();
      if (!filename.endsWith(".xlsx") && !filename.endsWith(".pdf")) {
        return sendJson(res, 415, { message: "L’aperçu prend en charge les rapports Excel .xlsx et PDF texte." });
      }
      const parsed = await parseReport(Buffer.from(body.fileBase64, "base64"), filename);
      const state = await loadMealWorkspace(previewCtx);
      const indicators = state.indicators.filter((item) => item.spaceId === previewCtx.spaceId);
      const clean = (value: string) =>
        value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const suggestions = Object.fromEntries(
        parsed.headers.filter(Boolean).map((header) => {
          const normalized = clean(header);
          const exact = indicators.find(
            (indicator) =>
              clean(indicator.name) === normalized ||
              indicator.aliases.some((alias) => clean(alias) === normalized)
          );
          const partial = exact
            ? undefined
            : indicators.find((indicator) =>
                [indicator.name, ...indicator.aliases].some(
                  (candidate) =>
                    normalized.length > 3 &&
                    (clean(candidate).includes(normalized) || normalized.includes(clean(candidate)))
                )
              );
          return [
            header,
            exact ? { indicatorId: exact.id, confidence: 0.98 } :
              partial ? { indicatorId: partial.id, confidence: 0.72 } : null,
          ];
        })
      );
      return sendJson(res, 200, {
        headers: parsed.headers.filter(Boolean),
        rows: parsed.rows.slice(0, 100),
        suggestions,
        format: parsed.format,
      });
    }

    if (pathParts[0] === "import" && req.method === "POST") {
      requirePermission(user, "meal:ingest");
      const input = ImportSchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      const project = isProjectOwned(state, scopedCtx, input.projectId);
      if (!project) return sendJson(res, 404, { message: "Projet introuvable dans cet espace." });
      const fileName = input.fileName.replace(/[\\/:*?"<>|]/g, "_");
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
        return sendJson(res, 400, { message: "Le fichier est vide ou dépasse la limite de 10 Mo." });
      }
      if (!fileName.toLowerCase().endsWith(".xlsx") && !fileName.toLowerCase().endsWith(".pdf")) {
        return sendJson(res, 415, { message: "Formats pris en charge : Excel .xlsx ou PDF texte." });
      }
      const parsed = await parseReport(buffer, fileName);
      const mapped = Object.entries(input.mapping).filter(
        ([header, indicatorId]) =>
          parsed.headers.includes(header) &&
          state.indicators.some(
            (indicator) =>
              indicator.id === indicatorId &&
              indicator.projectId === project.id &&
              indicator.spaceId === scopedCtx.spaceId
          )
      );
      if (mapped.length === 0) {
        return sendJson(res, 400, { message: "Associez au moins une colonne à un indicateur du projet." });
      }
      if (!input.periodHeader && !input.period) {
        return sendJson(res, 400, { message: "Choisissez une période ou une colonne de période." });
      }
      if (input.period && !periodDate(input.period)) {
        return sendJson(res, 400, { message: "Période attendue au format AAAA-MM." });
      }
      const reportHash = stableReportHash(buffer);
      const before = cloneState(state);
      const result = applyImportedReport({
        state,
        project,
        rows: parsed.rows,
        mapping: Object.fromEntries(mapped),
        period: input.period,
        periodHeader: input.periodHeader,
        fileName,
        reportHash,
        format: parsed.format,
        thresholds: getThresholds(),
      });
      if (result.inserted === 0 && result.skippedIdempotent === 0) {
        return sendJson(res, 422, {
          message: "Aucune valeur numérique exploitable n’a été trouvée pour la période et le mapping choisis.",
        });
      }
      if (result.inserted > 0) {
        saveRawUploadToArchive(scopedCtx, fileName, buffer);
        await saveAction(scopedCtx, user.id, state, before, `meal_import_${parsed.format}`);
      }
      return sendJson(res, 200, {
        ...result,
        message:
          result.inserted === 0 && result.skippedIdempotent > 0
            ? "Ce rapport a déjà été importé ; aucun doublon n’a été créé."
            : undefined,
      });
    }

    if (pathParts[0] === "values" && pathParts[1] === "decision" && req.method === "POST") {
      const input = DecisionSchema.parse(await readJsonBody(req));
      const { user: decisionUser, ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      requirePermission(decisionUser, "meal:validate");
      const state = await loadMealWorkspace(scopedCtx);
      const value = state.values.find(
        (item) => item.id === input.valueId && item.spaceId === scopedCtx.spaceId
      );
      if (!value) return sendJson(res, 404, { message: "Valeur à valider introuvable." });
      if (value.status !== "proposed") {
        return sendJson(res, 409, { message: "Cette valeur a déjà été traitée." });
      }
      const before = cloneState(state);
      value.status = input.decision;
      value.validatedAt = new Date().toISOString();
      value.validatedBy = decisionUser.id;
      if (input.decision === "rejected") value.rejectionReason = input.reason || "Rejet sans motif précisé";
      await saveAction(scopedCtx, decisionUser.id, state, before, `meal_value_${input.decision}`);
      return sendJson(res, 200, { value });
    }

    if (pathParts[0] === "undo" && req.method === "POST") {
      requirePermission(user, "meal:rollback");
      const body = z.object({ spaceId: z.string().optional(), actionId: z.string().min(1) }).parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, body.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      const action = state.actions.find((item) => item.id === body.actionId);
      if (!action || action.tenantId !== scopedCtx.tenantId || action.spaceId !== scopedCtx.spaceId) {
        return sendJson(res, 404, { message: "Action MEAL introuvable dans cet espace." });
      }
      if (!action.reversible || action.revertedAt) {
        return sendJson(res, 409, { message: "Cette action n’est pas annulable ou l’a déjà été." });
      }
      const lastReversibleAction = state.actions.find(
        (item) => item.reversible && !item.revertedAt
      );
      if (lastReversibleAction?.id !== action.id) {
        return sendJson(res, 409, {
          message: "Annulez d’abord la dernière action réversible pour préserver l’historique.",
        });
      }
      const restored = cloneState(action.beforeState);
      const reverted = state.actions.find((item) => item.id === action.id);
      if (reverted) reverted.revertedAt = new Date().toISOString();
      restored.actions = state.actions;
      await saveAction(scopedCtx, user.id, restored, cloneState(state), "meal_undo_action", false);
      return sendJson(res, 200, { undoneActionId: action.id });
    }

    if (pathParts[0] === "summary" && req.method === "POST") {
      requirePermission(user, "meal:run_agent");
      const input = SummarySchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      const project = isProjectOwned(state, scopedCtx, input.projectId);
      if (!project) return sendJson(res, 404, { message: "Projet introuvable dans cet espace." });
      const progress = projectProgress(state, project, input.period);
      const allFacts = progress.flatMap(({ objective, indicators }) =>
        indicators.map((item) => ({
          indicatorId: item.indicator.id,
          objectif: objective.label,
          indicateur: item.indicator.name,
          valueId: item.currentValue?.id ?? null,
          valeur: item.currentValue?.value ?? null,
          unite: item.indicator.unit,
          progression: item.actualPercent,
          attendue: item.expectedPercent,
          statut: statusLabel(item.status),
          source: item.currentValue?.sourceFile ?? null,
          repereSource: item.currentValue?.sourceLocation ?? null,
          confianceExtraction: item.currentValue?.confidence ?? null,
        }))
      );
      const facts = allFacts.slice(0, MEAL_LLM_MAX_INDICATORS);
      const allProposedValues = state.values.filter(
        (value) => value.projectId === project.id && value.status === "proposed"
      );
      const proposedValues = allProposedValues.slice(0, 50);
      const partialContext = allFacts.length > facts.length || allProposedValues.length > proposedValues.length;
      const provider = createLlmProvider();
      const system =
        `Tu es l’agent MEAL. Utilise tes outils pour consulter les indicateurs et l’historique, signaler toute valeur incohérente, examiner les propositions en attente puis écrire un résumé mensuel en français. N’invente jamais de données, source ou chiffre. Ne recalcule pas les pourcentages : les valeurs fournies sont les calculs déterministes du système. Cite la source et son repère quand ils existent. Toute correction doit rester proposée pour validation humaine. ${partialContext ? "Une partie du contexte est tronquée ; indique clairement que l’analyse est partielle et ne prétends pas couvrir tous les éléments." : "Le contexte contient tous les indicateurs et toutes les propositions."}`;
      const messages: Array<{
        role: "user" | "assistant" | "tool";
        text?: string;
        toolCalls?: Array<{ id?: string; name: string; args: Record<string, unknown> }>;
        toolResult?: { callId?: string; name: string; response: Record<string, unknown> };
      }> = [
        {
          role: "user",
          text: JSON.stringify({
            projet: project.name,
            periode: input.period,
            indicateurs: facts,
            totalIndicateurs: allFacts.length,
            propositions: proposedValues,
          }),
        },
      ];
      let generatedText = "";
      let writtenSummary = "";
      let toolCount = 0;
      let llmCallCount = 0;
      let tokensUsed = 0;
      let costUsd = 0;
      let budgetExceeded = false;
      let llmFailed = false;
      let summaryWasWritten = false;
      const logAgentTool = (name: string, args: Record<string, unknown>, output: Record<string, unknown>) => {
        journalRepo.addAgentAction(scopedCtx, {
          id: newId("meal-agent"),
          tenantId: scopedCtx.tenantId,
          spaceId: scopedCtx.spaceId,
          runId: `meal-review-${project.id}-${input.period}`,
          timestamp: new Date().toISOString(),
          toolName: name,
          inputs: args,
          output,
          decision: `Agent MEAL : ${name}`,
          confidence: 1,
          author: "agent",
          reversible: false,
          reverted: false,
        });
      };
      for (
        let round = 0;
        provider.providerName !== "deterministic" &&
        round < MEAL_LLM_MAX_CALLS &&
        toolCount < MEAL_LLM_MAX_TOOL_CALLS;
        round += 1
      ) {
        const estimatedInputTokens = Math.ceil((system.length + JSON.stringify(messages).length) / 4);
        const remainingTokens = MEAL_LLM_MAX_TOTAL_TOKENS - tokensUsed - estimatedInputTokens;
        if (remainingTokens <= 0) {
          budgetExceeded = true;
          break;
        }
        let result: Awaited<ReturnType<typeof provider.chat>>;
        try {
          result = await provider.chat({
            system,
            messages,
            tools: MEAL_AGENT_TOOLS,
            maxOutputTokens: Math.min(MEAL_LLM_MAX_OUTPUT_TOKENS, remainingTokens),
          });
        } catch {
          llmFailed = true;
          break;
        }
        llmCallCount += 1;
        tokensUsed += result.usage.totalTokens;
        costUsd += result.usage.costUsd;
        logAgentTool("llm_chat", { phase: "meal_summary", round }, {
          provider: provider.providerName,
          model: provider.modelName,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
          costUsd: result.usage.costUsd,
          durationMs: result.usage.durationMs,
        });
        if (tokensUsed > MEAL_LLM_MAX_TOTAL_TOKENS) {
          budgetExceeded = true;
          break;
        }
        if (result.text.trim()) generatedText = result.text.trim();
        if (result.toolCalls.length === 0) break;
        messages.push({ role: "assistant", toolCalls: result.toolCalls });
        for (const call of result.toolCalls) {
          if (toolCount >= MEAL_LLM_MAX_TOOL_CALLS) break;
          toolCount += 1;
          let output: Record<string, unknown>;
          if (call.name === "list_indicators") {
            output = { indicators: facts };
          } else if (call.name === "get_history") {
            const indicatorId = String(call.args.indicatorId ?? "");
            const indicator = state.indicators.find(
              (item) => item.id === indicatorId && item.projectId === project.id && item.spaceId === scopedCtx.spaceId
            );
            output = indicator
              ? { indicator: indicator.name, values: state.values.filter((value) => value.indicatorId === indicator.id).sort((a, b) => a.period.localeCompare(b.period)).slice(-24) }
              : { error: "Indicateur introuvable dans le projet courant." };
          } else if (call.name === "propose_value" || call.name === "flag_inconsistency") {
            const valueId = String(call.args.valueId ?? "");
            const reason = String(call.args.reason ?? "").slice(0, 500);
            const value = state.values.find(
              (item) => item.id === valueId && item.projectId === project.id && item.spaceId === scopedCtx.spaceId
            );
            if (!value || reason.length < 2) {
              output = { error: "Valeur ou motif introuvable pour ce projet." };
            } else if (call.name === "propose_value" && value.status !== "proposed") {
              output = { error: "Seules les valeurs proposées peuvent être signalées par propose_value." };
            } else {
              if (value.status === "validated") {
                const before = cloneState(state);
                value.status = "proposed";
                value.confidence = Math.min(value.confidence, 0.55);
                value.validatedAt = undefined;
                value.validatedBy = undefined;
                value.reviewNote = reason;
                await saveAction(scopedCtx, user.id, state, before, `meal_agent_${call.name}`);
              }
              output = { valueId: value.id, status: value.status, reason, humanValidationRequired: true };
            }
          } else if (call.name === "write_monthly_summary") {
            const text = String(call.args.text ?? "").trim().slice(0, 5000);
            if (text.length < 10) {
              output = { error: "Le résumé est trop court pour être enregistré." };
            } else {
              const before = cloneState(state);
              state.summaries.unshift({
                projectId: project.id,
                period: input.period,
                text,
                createdAt: new Date().toISOString(),
              });
              await saveAction(scopedCtx, user.id, state, before, "meal_write_monthly_summary");
              generatedText = text;
              writtenSummary = text;
              summaryWasWritten = true;
              output = { saved: true };
            }
          } else {
            output = { error: `Outil inconnu : ${call.name}` };
          }
          logAgentTool(call.name, call.args, output);
          messages.push({
            role: "tool",
            toolResult: { callId: call.id, name: call.name, response: output },
          });
        }
      }
      const usedDeterministicFallback =
        provider.providerName === "deterministic" || budgetExceeded || llmFailed || !generatedText;
      const deterministicSummary = facts.length === 0
        ? `Aucun indicateur n’est configuré pour ${input.period}.`
        : facts
            .map(
              (fact) =>
                `${fact.indicateur} : ${fact.valeur === null ? "aucune donnée" : `${fact.progression ?? 0}% atteint / ${fact.attendue}% attendu`} — ${fact.statut}.`
            )
            .join("\n");
      const safeSummary = partialContext
        ? `${deterministicSummary}\nAnalyse partielle : ${facts.length} indicateurs et ${proposedValues.length} propositions pris en compte.`
        : deterministicSummary;
      const summary = writtenSummary || (usedDeterministicFallback ? safeSummary : generatedText);
      if (!summary) throw new Error("Impossible de produire le résumé MEAL.");
      if (!summaryWasWritten) {
        const before = cloneState(state);
        state.summaries.unshift({
          projectId: project.id,
          period: input.period,
          text: summary,
          createdAt: new Date().toISOString(),
        });
        await saveAction(scopedCtx, user.id, state, before, "meal_write_monthly_summary");
      }
      await journalRepo.flushPg();
      return sendJson(res, 200, {
        summary,
        provider: usedDeterministicFallback ? "deterministic" : provider.providerName,
        model: usedDeterministicFallback ? "meal-safe-fallback-v1" : provider.modelName,
        tokensUsed,
        costUsd,
        llmCalls: llmCallCount,
        partialContext,
        fallbackReason: budgetExceeded ? "budget_exceeded" : llmFailed ? "provider_unavailable" : undefined,
      });
    }

    if (pathParts[0] === "export" && (req.method === "GET" || req.method === "POST")) {
      requirePermission(user, "meal:export");
      const input =
        req.method === "POST"
          ? SummarySchema.parse(await readJsonBody(req))
          : SummarySchema.parse({
              projectId: url.searchParams.get("projectId"),
              period: url.searchParams.get("period"),
              spaceId: url.searchParams.get("spaceId") ?? undefined,
            });
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      const project = isProjectOwned(state, scopedCtx, input.projectId);
      if (!project) return sendJson(res, 404, { message: "Projet introuvable dans cet espace." });
      const progress = projectProgress(state, project, input.period);
      const format = url.searchParams.get("format") || "xlsx";
      if (format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Indicateurs MEAL");
        sheet.views = [{ state: "frozen", ySplit: 4 }];
        sheet.addRow(["Projet", project.name]);
        sheet.addRow(["Période", input.period]);
        sheet.addRow([]);
        sheet.addRow(["Objectif", "Indicateur", "Unité", "Baseline", "Cible", "Valeur actuelle", "Progression %", "Attendu %", "Statut", "Source", "Confiance"]);
        for (const group of progress) {
          for (const item of group.indicators) {
            sheet.addRow([
              group.objective.label,
              item.indicator.name,
              item.indicator.unit,
              item.indicator.baseline,
              targetForPeriod(item.indicator, input.period),
              item.currentValue?.value ?? "",
              item.actualPercent ?? "",
              item.expectedPercent,
              statusLabel(item.status),
              item.currentValue ? `${item.currentValue.sourceFile} — ${item.currentValue.sourceLocation}` : "Aucune donnée",
              item.currentValue?.confidence ?? "",
            ]);
          }
        }
        sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
        sheet.columns = [
          { width: 32 }, { width: 30 }, { width: 14 }, { width: 14 }, { width: 14 },
          { width: 16 }, { width: 16 }, { width: 14 }, { width: 20 }, { width: 44 }, { width: 14 },
        ];
        if (sheet.rowCount > 4) {
          sheet.autoFilter = { from: "A4", to: `K${sheet.rowCount}` };
        }
        const data = await workbook.xlsx.writeBuffer();
        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="meal-${project.id}-${input.period}.xlsx"`,
        });
        res.end(Buffer.from(data));
        return;
      }
      if (format === "docx") {
        const rows = progress.flatMap(({ objective, indicators }) =>
          indicators.map((item) => [
            objective.label,
            item.indicator.name,
            `${item.indicator.baseline} ${item.indicator.unit}`,
            `${item.targetAtPeriod} ${item.indicator.unit}`,
            `${item.currentValue?.value ?? "—"} ${item.indicator.unit}`,
            item.actualPercent === null ? "—" : `${item.actualPercent}%`,
            `${item.expectedPercent}%`,
            statusLabel(item.status),
          ])
        );
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ["Objectif", "Indicateur", "Baseline", "Cible", "Valeur", "Progression", "Attendu", "Statut"].map(
                (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })
              ),
            }),
            ...rows.map(
              (row) =>
                new TableRow({
                  children: row.map((text) => new TableCell({ children: [new Paragraph(text)] })),
                })
            ),
          ],
        });
        const summary = state.summaries.find(
          (item) => item.projectId === project.id && item.period === input.period
        );
        const document = new Document({
          sections: [
            {
              children: [
                new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
                new Paragraph({ text: `Rapport mensuel MEAL — ${input.period}`, alignment: AlignmentType.CENTER }),
                new Paragraph(`${project.zone || "Zone non renseignée"} · Bailleur : ${project.donor || "Non renseigné"}`),
                new Paragraph({ text: "Graphique de progression par objectif", heading: HeadingLevel.HEADING_1 }),
                ...progress.map(({ objective, indicators }) => {
                  const available = indicators.filter((item) => item.actualPercent !== null);
                  const mean =
                    available.length > 0
                      ? available.reduce((total, item) => total + (item.actualPercent ?? 0), 0) /
                        available.length
                      : null;
                  const filled = mean === null ? 0 : Math.round(Math.max(0, Math.min(100, mean)) / 5);
                  return new Paragraph({
                    children: [
                      new TextRun({ text: `${objective.label}  `, bold: true }),
                      new TextRun({ text: `${"■".repeat(filled)}${"□".repeat(20 - filled)}`, color: "2563EB" }),
                      new TextRun({ text: mean === null ? "  aucune donnée" : `  ${mean.toFixed(1)} %` }),
                    ],
                  });
                }),
                new Paragraph({ text: "Progression par objectif", heading: HeadingLevel.HEADING_1 }),
                table,
                new Paragraph({ text: "Commentaire mensuel", heading: HeadingLevel.HEADING_1 }),
                new Paragraph(summary?.text || "Aucun résumé mensuel n’a encore été généré pour cette période."),
                new Paragraph("Les calculs de progression sont déterministes. Les valeurs proposées nécessitent une validation humaine."),
              ],
            },
          ],
        });
        const buffer = await Packer.toBuffer(document);
        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="meal-${project.id}-${input.period}.docx"`,
        });
        res.end(buffer);
        return;
      }
      return sendJson(res, 400, { message: "Format d’export attendu : xlsx ou docx." });
    }

    const projectId = pathParts[0];
    if (req.method === "POST" && pathParts[1] === "objectives") {
      requirePermission(user, "meal:ingest");
      const input = ObjectiveSchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      if (!isProjectOwned(state, scopedCtx, projectId)) {
        return sendJson(res, 404, { message: "Projet introuvable dans cet espace." });
      }
      const before = cloneState(state);
      const objective: MealObjective = {
        ...input,
        id: newId("objective"),
        tenantId: scopedCtx.tenantId,
        spaceId: scopedCtx.spaceId,
        projectId,
        createdAt: new Date().toISOString(),
      };
      state.objectives.push(objective);
      await saveAction(scopedCtx, user.id, state, before, "meal_create_objective");
      return sendJson(res, 201, { objective });
    }

    if (req.method === "POST" && pathParts[1] === "indicators") {
      requirePermission(user, "meal:ingest");
      const input = IndicatorSchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      if (
        !isProjectOwned(state, scopedCtx, projectId) ||
        !state.objectives.some(
          (item) => item.id === input.objectiveId && item.projectId === projectId && item.spaceId === scopedCtx.spaceId
        )
      ) {
        return sendJson(res, 404, { message: "Projet ou objectif introuvable dans cet espace." });
      }
      const before = cloneState(state);
      const now = new Date().toISOString();
      const project = state.projects.find((item) => item.id === projectId);
      const indicator: MealIndicator = {
        ...input,
        id: newId("indicator"),
        tenantId: scopedCtx.tenantId,
        spaceId: scopedCtx.spaceId,
        projectId,
        targetHistory: [{ target: input.target, effectiveAt: project!.startDate, changedAt: now, changedBy: user.id, reason: "Cible initiale" }],
        createdAt: now,
        updatedAt: now,
      };
      state.indicators.push(indicator);
      await saveAction(scopedCtx, user.id, state, before, "meal_create_indicator");
      return sendJson(res, 201, { indicator });
    }

    if (req.method === "POST" && pathParts[1] === "targets") {
      requirePermission(user, "meal:ingest");
      const input = TargetSchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      const indicator = state.indicators.find(
        (item) => item.id === pathParts[2] && item.projectId === projectId && item.spaceId === scopedCtx.spaceId
      );
      if (!indicator) return sendJson(res, 404, { message: "Indicateur introuvable dans cet espace." });
      if (
        (indicator.direction === "increase" && input.target < indicator.baseline) ||
        (indicator.direction === "decrease" && input.target > indicator.baseline)
      ) {
        return sendJson(res, 400, { message: "La cible doit respecter le sens souhaité par rapport à la baseline." });
      }
      const before = cloneState(state);
      indicator.target = input.target;
      indicator.targetHistory.push({
        target: input.target,
        effectiveAt: input.effectiveAt,
        changedAt: new Date().toISOString(),
        changedBy: user.id,
        reason: input.reason,
      });
      indicator.updatedAt = new Date().toISOString();
      await saveAction(scopedCtx, user.id, state, before, "meal_change_indicator_target");
      return sendJson(res, 200, { indicator });
    }

    if (req.method === "PUT" && pathParts.length === 1) {
      requirePermission(user, "meal:ingest");
      const input = ProjectSchema.parse(await readJsonBody(req));
      const { ctx: scopedCtx } = resolveHttpContext(req, url, input.spaceId);
      const state = await loadMealWorkspace(scopedCtx);
      const project = isProjectOwned(state, scopedCtx, projectId);
      if (!project) return sendJson(res, 404, { message: "Projet introuvable dans cet espace." });
      if (input.endDate <= input.startDate) {
        return sendJson(res, 400, { message: "La fin du projet doit être après son début." });
      }
      const before = cloneState(state);
      Object.assign(project, input, { updatedAt: new Date().toISOString() });
      await saveAction(scopedCtx, user.id, state, before, "meal_update_project");
      return sendJson(res, 200, { project });
    }

    if (req.method === "GET" && pathParts.length === 1) {
      requirePermission(user, "meal:read");
      const state = await loadMealWorkspace(ctx);
      const project = isProjectOwned(state, ctx, projectId);
      if (!project) return sendJson(res, 404, { message: "Projet introuvable dans cet espace." });
      const period = url.searchParams.get("period") || new Date().toISOString().slice(0, 7);
      if (!periodDate(period)) return sendJson(res, 400, { message: "Période attendue au format AAAA-MM." });
      return sendJson(res, 200, {
        project,
        objectives: projectProgress(state, project, period),
        values: state.values.filter((item) => item.projectId === project.id),
        actions: state.actions
          .filter((item) => item.reversible)
          .map(({ beforeState: _snapshot, ...item }) => item),
      });
    }

    return sendJson(res, 404, { message: "Route projets MEAL introuvable." });
  } catch (error) {
    const { status, message } = formatApiError(error, "Erreur module projets MEAL");
    return sendJson(res, status, { message });
  }
}
