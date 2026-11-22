import type { TenantSpaceContext } from "../connectors/types";
import { journalRepo } from "../journal";
import {
  createLlmProvider,
  type LlmMessage,
  type LlmProvider,
  type LlmToolDeclaration,
} from "../llm/provider";
import { normalizeText } from "../rules/dedupe";

export interface NlqQueryParams {
  metric:
    | "summary"
    | "count_records"
    | "sum_amount"
    | "list_anomalies"
    | "list_duplicates"
    | "by_zone"
    | "by_source"
    | "search_records";
  zone?: string;
  severity?: "bloquante" | "a_verifier" | "mineure";
  status?: "active" | "archived" | "merged" | "all";
  searchText?: string;
  limit?: number;
}

export interface NlqAnswer {
  language: "fr" | "mg";
  answer: string;
  readOnly: true;
  scope: { tenantId: string; spaceId: string };
  toolUsed: "query_space_data" | "read_only_guard";
  metric: string;
  data: Record<string, unknown>;
  llmProvider: string;
  llmModel: string;
  tokensUsed: number;
}

export const READ_ONLY_QUERY_TOOL_DECLARATION: LlmToolDeclaration = {
  name: "query_space_data",
  description:
    "Outil en LECTURE SEULE strictement borné à l'espace courant (tenantId, spaceId). Permet de compter, agréger par zone/source ou lister anomalies et doublons.",
  parameters: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        description:
          "summary | count_records | sum_amount | list_anomalies | list_duplicates | by_zone | by_source | search_records",
      },
      zone: { type: "string" },
      severity: { type: "string" },
      status: { type: "string" },
      searchText: { type: "string" },
      limit: { type: "number" },
    },
    required: ["metric"],
  },
};

const WRITE_INTENT_REGEX =
  /\b(supprim\w*|effac\w*|modifi\w*|fusionn\w*|archiv\w*|ecri\w*|insert|delete|update|drop|truncate|alter|mamafa|fafao|hanova|ovay|ampidiro|esory)\b/i;

export function detectQuestionLanguage(question: string): "fr" | "mg" {
  const q = ` ${normalizeText(question)} `;
  const mgSignals = [
    " firy ",
    " ohatrinona ",
    " inona ",
    " aiza ",
    " iza ",
    " faritra ",
    " loharano ",
    " olona ",
    " vola ",
    " olana ",
    " mitovy ",
    " rehetra ",
    " ny ",
    " ao ",
    " amin ",
    " ve ",
    " misy ",
    " tsia ",
  ];
  let hits = 0;
  for (const sig of mgSignals) {
    if (q.includes(sig)) hits += 1;
  }
  return hits >= 2 ? "mg" : "fr";
}

/**
 * Exécution stricte en lecture seule filtrée par (ctx.tenantId, ctx.spaceId).
 */
export function executeReadOnlySpaceQuery(
  ctx: TenantSpaceContext,
  params: NlqQueryParams
): Record<string, unknown> {
  const allRecords = journalRepo.listNormalizedRecords(ctx, { includeArchived: true });
  const sources = journalRepo.listSources(ctx);
  const runs = journalRepo.listRuns(ctx);
  const anomalies = journalRepo.listAnomalies(ctx);
  const validations = journalRepo.listValidations(ctx);

  const normZoneFilter = params.zone ? normalizeText(params.zone) : null;
  const matchingRecords = allRecords.filter((r) => {
    if (params.status && params.status !== "all" && r.status !== params.status) return false;
    if (normZoneFilter && normalizeText(r.zone) !== normZoneFilter) return false;
    if (params.searchText) {
      const needle = normalizeText(params.searchText);
      const hay = normalizeText(`${r.externalId} ${r.fullName || ""} ${r.zone || ""}`);
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const maxRows = Math.min(Math.max(params.limit || 10, 1), 25);

  if (params.metric === "by_zone") {
    const map = new Map<string, { count: number; active: number; amountSum: number }>();
    for (const r of matchingRecords) {
      const z = r.zone || "(Non renseignée)";
      const cur = map.get(z) || { count: 0, active: 0, amountSum: 0 };
      cur.count += 1;
      if (r.status === "active") cur.active += 1;
      if (r.amount !== null) cur.amountSum += r.amount;
      map.set(z, cur);
    }
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      zones: Array.from(map.entries()).map(([zone, st]) => ({ zone, ...st })),
    };
  }

  if (params.metric === "by_source") {
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      sources: sources.map((s) => {
        const recs = matchingRecords.filter((r) => r.sourceId === s.id);
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          totalRecords: recs.length,
          activeRecords: recs.filter((r) => r.status === "active").length,
        };
      }),
    };
  }

  if (params.metric === "list_anomalies") {
    const recIds = new Set(matchingRecords.map((r) => r.id));
    const filtered = anomalies.filter((a) => {
      if (params.severity && a.severity !== params.severity) return false;
      if (normZoneFilter && !recIds.has(a.recordId)) return false;
      return true;
    });
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      totalAnomalies: filtered.length,
      bySeverity: {
        bloquante: filtered.filter((a) => a.severity === "bloquante").length,
        a_verifier: filtered.filter((a) => a.severity === "a_verifier").length,
        mineure: filtered.filter((a) => a.severity === "mineure").length,
      },
      items: filtered.slice(0, maxRows).map((a) => ({
        ruleId: a.ruleId,
        category: a.category,
        severity: a.severity,
        status: a.status,
        message: a.message,
      })),
    };
  }

  if (params.metric === "list_duplicates") {
    const dupAnoms = anomalies.filter(
      (a) => a.category === "exact_duplicate" || a.category === "near_duplicate"
    );
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      totalDuplicates: dupAnoms.length,
      exactCount: dupAnoms.filter((a) => a.category === "exact_duplicate").length,
      nearCount: dupAnoms.filter((a) => a.category === "near_duplicate").length,
      items: dupAnoms.slice(0, maxRows).map((a) => ({
        category: a.category,
        severity: a.severity,
        status: a.status,
        message: a.message,
      })),
    };
  }

  if (params.metric === "sum_amount") {
    const withAmount = matchingRecords.filter((r) => r.amount !== null);
    const totalAmount = withAmount.reduce((s, r) => s + (r.amount || 0), 0);
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      zone: params.zone || null,
      recordsWithAmount: withAmount.length,
      totalAmount,
      averageAmount: withAmount.length > 0 ? Number((totalAmount / withAmount.length).toFixed(2)) : 0,
    };
  }

  if (params.metric === "count_records") {
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      zone: params.zone || null,
      totalRecords: matchingRecords.length,
      activeRecords: matchingRecords.filter((r) => r.status === "active").length,
      mergedRecords: matchingRecords.filter((r) => r.status === "merged").length,
      archivedRecords: matchingRecords.filter((r) => r.status === "archived").length,
    };
  }

  if (params.metric === "search_records") {
    return {
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      totalMatched: matchingRecords.length,
      items: matchingRecords.slice(0, maxRows).map((r) => ({
        externalId: r.externalId,
        fullName: r.fullName,
        zone: r.zone,
        age: r.age,
        amount: r.amount,
        status: r.status,
      })),
    };
  }

  const totalAmount = matchingRecords.reduce((s, r) => s + (r.amount || 0), 0);
  return {
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    totalRecords: matchingRecords.length,
    activeRecords: matchingRecords.filter((r) => r.status === "active").length,
    cleanedRecords: matchingRecords.filter((r) => r.status !== "active").length,
    totalAmount,
    sourcesCount: sources.length,
    runsCount: runs.length,
    anomaliesCount: anomalies.length,
    openAnomaliesCount: anomalies.filter((a) => a.status === "open").length,
    pendingValidationsCount: validations.filter((v) => v.status === "pending").length,
  };
}

function inferDeterministicQueryParams(
  ctx: TenantSpaceContext,
  question: string
): NlqQueryParams {
  const norm = normalizeText(question);
  const allZones = Array.from(
    new Set(
      journalRepo
        .listNormalizedRecords(ctx, { includeArchived: true })
        .map((r) => r.zone)
        .filter((z): z is string => Boolean(z))
    )
  );
  const matchedZone = allZones.find((z) => norm.includes(normalizeText(z)));

  if (/\b(doublon\w*|mitovy|duplicat\w*)\b/.test(norm)) {
    return { metric: "list_duplicates", zone: matchedZone, limit: 10 };
  }
  if (/\b(anomalie\w*|olana|erreur\w*|bloquante\w*|gps)\b/.test(norm)) {
    const severity = norm.includes("bloquant")
      ? "bloquante"
      : norm.includes("verifier")
        ? "a_verifier"
        : norm.includes("mineur")
          ? "mineure"
          : undefined;
    return { metric: "list_anomalies", zone: matchedZone, severity, limit: 10 };
  }
  if (/\b(source\w*|loharano|connecteur\w*)\b/.test(norm)) {
    return { metric: "by_source", zone: matchedZone };
  }
  if (/\b(par zone|isaky ny faritra|repartition.*zone|zones)\b/.test(norm) && !matchedZone) {
    return { metric: "by_zone" };
  }
  if (/\b(montant|somme|total|moyen|vola|ohatrinona)\b/.test(norm) && !/\b(firy|combien)\b/.test(norm)) {
    return { metric: "sum_amount", zone: matchedZone };
  }
  if (/\b(combien|nombre|firy|isa|olona|beneficiaire|enregistrement)\b/.test(norm)) {
    if (/\b(vola|montant|somme|ohatrinona)\b/.test(norm)) {
      return { metric: "sum_amount", zone: matchedZone };
    }
    return { metric: "count_records", zone: matchedZone };
  }
  if (matchedZone) {
    return { metric: "count_records", zone: matchedZone };
  }
  return { metric: "summary" };
}

function formatDeterministicAnswer(
  lang: "fr" | "mg",
  params: NlqQueryParams,
  data: Record<string, unknown>
): string {
  const zoneLabel = params.zone ? ` (${params.zone})` : "";
  if (params.metric === "list_duplicates") {
    const total = Number(data.totalDuplicates || 0);
    const exact = Number(data.exactCount || 0);
    const near = Number(data.nearCount || 0);
    return lang === "mg"
      ? `Ao amin'ity habaka ity dia misy fitambarany ${total} ny taratasy mitovy (doublons) : ${exact} mitovy tanteraka ary ${near} saika mitovy.`
      : `Cet espace contient ${total} doublon(s) détecté(s) : ${exact} doublon(s) exact(s) et ${near} quasi-doublon(s).`;
  }
  if (params.metric === "list_anomalies") {
    const total = Number(data.totalAnomalies || 0);
    const sev = (data.bySeverity as Record<string, number>) || {};
    return lang === "mg"
      ? `Misy tsy fahatomombanana ${total}${zoneLabel} : ${sev.bloquante || 0} manakana (bloquante), ${sev.a_verifier || 0} mila fanamarinana, ary ${sev.mineure || 0} maivana.`
      : `${total} anomalie(s) trouvée(s)${zoneLabel} : ${sev.bloquante || 0} bloquante(s), ${sev.a_verifier || 0} à vérifier, ${sev.mineure || 0} mineure(s).`;
  }
  if (params.metric === "by_source") {
    const srcs = (data.sources as Array<{ name: string; totalRecords: number; activeRecords: number }>) || [];
    const listStr = srcs.map((s) => `${s.name} (${s.activeRecords}/${s.totalRecords})`).join(", ");
    return lang === "mg"
      ? `Loharano hita ato amin'ny habaka (${srcs.length}) : ${listStr || "tsy misy"}.`
      : `${srcs.length} source(s) dans cet espace : ${listStr || "aucune"}.`;
  }
  if (params.metric === "by_zone") {
    const zones = (data.zones as Array<{ zone: string; count: number; amountSum: number }>) || [];
    const listStr = zones
      .map((z) => `${z.zone}: ${z.count} (${z.amountSum.toLocaleString("fr-FR")})`)
      .join(" | ");
    return lang === "mg"
      ? `Fitsinjarana isaky ny faritra : ${listStr || "tsy misy angona"}.`
      : `Répartition par zone : ${listStr || "aucune donnée"}.`;
  }
  if (params.metric === "sum_amount") {
    const count = Number(data.recordsWithAmount || 0);
    const total = Number(data.totalAmount || 0).toLocaleString("fr-FR");
    const avg = Number(data.averageAmount || 0).toLocaleString("fr-FR");
    return lang === "mg"
      ? `Ho an'ny firaketana ${count}${zoneLabel}, ny totalin'ny vola dia ${total} ary ny salan'isa dia ${avg}.`
      : `Sur ${count} enregistrement(s)${zoneLabel}, le montant total s'élève à ${total} (moyenne ${avg}).`;
  }
  if (params.metric === "count_records") {
    const total = Number(data.totalRecords || 0);
    const active = Number(data.activeRecords || 0);
    const cleaned = Number(data.mergedRecords || 0) + Number(data.archivedRecords || 0);
    return lang === "mg"
      ? `Misy firaketana ${total} ao${zoneLabel} : ${active} mbola mavitrika ary ${cleaned} efa voalamina/voatahiry.`
      : `Il y a ${total} enregistrement(s)${zoneLabel} : ${active} actif(s) et ${cleaned} fusionné(s)/archivé(s).`;
  }
  const total = Number(data.totalRecords || 0);
  const active = Number(data.activeRecords || 0);
  const anoms = Number(data.anomaliesCount || 0);
  const pend = Number(data.pendingValidationsCount || 0);
  return lang === "mg"
    ? `Famintinana ny habaka ${String(data.spaceId)} : firaketana ${total} (${active} mavitrika), tsy fahatomombanana ${anoms}, ary fangatahana fanamarinana ${pend} miandry.`
    : `Synthèse de l'espace ${String(data.spaceId)} : ${total} enregistrement(s) (${active} actif(s)), ${anoms} anomalie(s), et ${pend} validation(s) humaine(s) en attente.`;
}

/**
 * Répond aux questions en langage naturel (français ou malgache) sur les données de l'espace
 * via l'outil en lecture seule `query_space_data` strictement filtré par (tenantId, spaceId).
 */
export async function askNaturalLanguageSpaceQuestion(
  ctx: TenantSpaceContext,
  question: string,
  options?: { llmProvider?: LlmProvider }
): Promise<NlqAnswer> {
  const cleanQ = question.trim();
  const lang = detectQuestionLanguage(cleanQ);

  if (!cleanQ) {
    throw new Error("La question ne peut pas être vide.");
  }

  if (WRITE_INTENT_REGEX.test(cleanQ)) {
    return {
      language: lang,
      answer:
        lang === "mg"
          ? "Fandavana : fitaovana famakiana fotsiny (lecture seule) ity mpanampy ity, tsy mahazo manova na mamafa angona."
          : "Refusé : cet assistant fonctionne strictement en lecture seule sur votre espace et ne peut effectuer aucune écriture ou modification.",
      readOnly: true,
      scope: { tenantId: ctx.tenantId, spaceId: ctx.spaceId },
      toolUsed: "read_only_guard",
      metric: "blocked_write_intent",
      data: {},
      llmProvider: "guard",
      llmModel: "read-only-policy",
      tokensUsed: 0,
    };
  }

  const provider = options?.llmProvider ?? createLlmProvider();
  const fallbackParams = inferDeterministicQueryParams(ctx, cleanQ);

  if (provider.providerName !== "deterministic") {
    try {
      const messages: LlmMessage[] = [{ role: "user", text: cleanQ }];
      const systemInstruction = `Assistant analytique en LECTURE SEULE pour l'espace (${ctx.tenantId}, ${ctx.spaceId}).
Tu réponds en ${lang === "mg" ? "malgache (Malagasy)" : "français"}.
Utilise obligatoirement l'outil query_space_data pour lire les chiffres réels puis réponds brièvement en t'appuyant uniquement sur les résultats retournés.`;

      let tokensUsed = 0;
      let lastData: Record<string, unknown> = {};
      let usedMetric = fallbackParams.metric;

      for (let turn = 0; turn < 3; turn++) {
        const callStartedMs = Date.now();
        const res = await provider.chat({
          system: systemInstruction,
          messages,
          tools: [READ_ONLY_QUERY_TOOL_DECLARATION],
        });
        const callDurationMs = res.usage.durationMs || Math.max(0, Date.now() - callStartedMs);
        tokensUsed += res.usage.totalTokens;

        journalRepo.addAgentAction(ctx, {
          id: `act-nlq-${Date.now()}-${turn}-${Math.random().toString(36).slice(2, 6)}`,
          tenantId: ctx.tenantId,
          spaceId: ctx.spaceId,
          runId: "nlq-query",
          timestamp: new Date().toISOString(),
          toolName: "llm_chat",
          inputs: { phase: "nlq_read_only", turn, language: lang },
          output: {
            llmProvider: provider.providerName,
            llmModel: provider.modelName,
            inputTokens: res.usage.inputTokens,
            outputTokens: res.usage.outputTokens,
            totalTokens: res.usage.totalTokens,
            costUsd: res.usage.costUsd,
            durationMs: callDurationMs,
            toolCallsCount: res.toolCalls.length,
          },
          decision: `Appel LLM NLQ ${provider.providerName}/${provider.modelName} — ${res.usage.totalTokens} tokens, ${callDurationMs} ms`,
          confidence: 1,
          author: "agent",
          llmProvider: provider.providerName,
          llmModel: provider.modelName,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          tokensUsed: res.usage.totalTokens,
          durationMs: callDurationMs,
          reversible: false,
          reverted: false,
        });

        if (res.toolCalls.length > 0) {
          messages.push({ role: "assistant", text: res.text, toolCalls: res.toolCalls });
          for (const call of res.toolCalls) {
            if (call.name !== "query_space_data") {
              messages.push({
                role: "tool",
                toolResult: {
                  callId: call.id,
                  name: call.name,
                  response: { error: "Seul l'outil lecture seule query_space_data est autorisé." },
                },
              });
              continue;
            }
            const args = call.args as unknown as NlqQueryParams;
            usedMetric = args.metric || "summary";
            lastData = executeReadOnlySpaceQuery(ctx, args);
            messages.push({
              role: "tool",
              toolResult: { callId: call.id, name: call.name, response: lastData },
            });
          }
          continue;
        }

        if (res.text) {
          return {
            language: lang,
            answer: res.text,
            readOnly: true,
            scope: { tenantId: ctx.tenantId, spaceId: ctx.spaceId },
            toolUsed: "query_space_data",
            metric: usedMetric,
            data: lastData,
            llmProvider: provider.providerName,
            llmModel: provider.modelName,
            tokensUsed,
          };
        }
        break;
      }
    } catch {
      // Repli déterministe bilingue FR/MG en cas d'erreur réseau/quota LLM
    }
  }

  const data = executeReadOnlySpaceQuery(ctx, fallbackParams);
  return {
    language: lang,
    answer: formatDeterministicAnswer(lang, fallbackParams, data),
    readOnly: true,
    scope: { tenantId: ctx.tenantId, spaceId: ctx.spaceId },
    toolUsed: "query_space_data",
    metric: fallbackParams.metric,
    data,
    llmProvider: "deterministic",
    llmModel: "bilingual-fr-mg-v1",
    tokensUsed: 0,
  };
}
