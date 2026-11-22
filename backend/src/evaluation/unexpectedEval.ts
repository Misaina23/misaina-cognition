import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { buildNormalizedPair, type NormalizedRecord, type TenantSpaceContext } from "../connectors/types";
import { createLlmProvider } from "../llm/provider";
import { normalizeText } from "../rules/dedupe";
import { parseProjectRulesYaml, runDeterministicControls, type ProjectRulesConfig } from "../rules/engine";

interface UnexpectedGroundTruth {
  totalRows: number;
  totalErrors: number;
  errors: Array<{
    externalId: string;
    errorType: string;
    description: string;
  }>;
}

export interface EvalMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
}

export interface UnexpectedCaseResult {
  externalId: string;
  errorType: string;
  description: string;
  caughtByYaml: boolean;
  caughtByAgent: boolean;
  detectedReasons: string[];
}

export interface UnexpectedEvalReport {
  totalRows: number;
  totalUnexpectedErrors: number;
  yamlBaseline: EvalMetrics;
  agentDetector: EvalMetrics;
  falsePositiveExternalIds: string[];
  cases: UnexpectedCaseResult[];
  evaluatedAt: string;
}

function getFixturesDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "tests", "fixtures"),
    path.join(cwd, "backend", "tests", "fixtures"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "donnees_imprevues.csv"))) return dir;
  }
  throw new Error("Fixtures d'évaluation cas imprévus introuvables.");
}

function getDefaultRulesConfig(): ProjectRulesConfig {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "config", "projects", "exemple-csv.yaml"),
    path.join(cwd, "backend", "config", "projects", "exemple-csv.yaml"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return parseProjectRulesYaml(fs.readFileSync(filePath, "utf8")).config;
    }
  }
  return parseProjectRulesYaml("version: 1\nprojectName: Eval\n").config;
}

function isStrictValidCalendarDate(raw: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return !Number.isNaN(Date.parse(raw));
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

const VALID_CURRENCIES = new Set(["XOF", "XAF", "EUR", "USD", "MGA", "GNF"]);

/**
 * Détecteur sémantique/heuristique des anomalies imprévues non couvertes par le YAML.
 */
export function detectUnexpectedAnomalies(
  records: NormalizedRecord[],
  rules: ProjectRulesConfig
): Map<string, string[]> {
  const reasonsByExternalId = new Map<string, string[]>();
  const addReason = (externalId: string, reason: string) => {
    const list = reasonsByExternalId.get(externalId) || [];
    if (!list.includes(reason)) list.push(reason);
    reasonsByExternalId.set(externalId, list);
  };

  const declaredZones = new Set(
    (rules.geoBounds?.interventionZones || []).map((z) => normalizeText(z.name))
  );
  const emailOwners = new Map<string, NormalizedRecord[]>();
  for (const r of records) {
    if (r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
      const list = emailOwners.get(r.email.toLowerCase()) || [];
      list.push(r);
      emailOwners.set(r.email.toLowerCase(), list);
    }
  }

  for (const rec of records) {
    if (rec.fullName && /<[^>]+>|script:|javascript:/i.test(rec.fullName)) {
      addReason(rec.externalId, "Injection HTML/script détectée dans fullName");
    }

    if (rec.fullName && /^\d+$/.test(rec.fullName.trim())) {
      addReason(rec.externalId, "Nom complet composé uniquement de chiffres");
    }

    if (
      rec.fullName &&
      /\b(test|factice|dummy|placeholder|inconnu)\b/i.test(rec.fullName)
    ) {
      addReason(rec.externalId, "Identité factice / de test résiduelle");
    }

    if (rec.phone) {
      const digits = rec.phone.replace(/\D/g, "");
      if (/(\d)\1{6,}/.test(digits)) {
        addReason(rec.externalId, "Numéro de téléphone factice à chiffres répétés");
      }
    }

    if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) {
      addReason(rec.externalId, "Format email invalide");
    }

    if (rec.recordedAt && !isStrictValidCalendarDate(rec.recordedAt)) {
      addReason(rec.externalId, `Date calendaire impossible (${rec.recordedAt})`);
    }

    if (rec.age !== null && rec.amount !== null && rec.age < 12 && rec.amount > 10000) {
      addReason(rec.externalId, `Incohérence croisée âge=${rec.age} / montant=${rec.amount}`);
    }

    if (rec.currency && !VALID_CURRENCIES.has(rec.currency.toUpperCase())) {
      addReason(rec.externalId, `Devise non supportée (${rec.currency})`);
    }

    if (rec.zone && declaredZones.size > 0 && !declaredZones.has(normalizeText(rec.zone))) {
      addReason(rec.externalId, `Zone déclarée inconnue du référentiel (${rec.zone})`);
    }
  }

  for (const [email, owners] of emailOwners.entries()) {
    if (owners.length < 2) continue;
    const distinctNames = new Set(owners.map((o) => normalizeText(o.fullName)));
    if (distinctNames.size > 1) {
      for (let i = 1; i < owners.length; i++) {
        addReason(owners[i].externalId, `Email partagé (${email}) entre identités distinctes`);
      }
    }
  }

  return reasonsByExternalId;
}

function computeMetrics(tp: number, fp: number, fn: number): EvalMetrics {
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : 1;
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 0;
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision, recall };
}

export async function runUnexpectedCasesEvaluation(
  rulesOverride?: ProjectRulesConfig
): Promise<UnexpectedEvalReport> {
  const fixturesDir = getFixturesDir();
  const csvText = fs.readFileSync(path.join(fixturesDir, "donnees_imprevues.csv"), "utf8");
  const truth: UnexpectedGroundTruth = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "verite_imprevue.json"), "utf8")
  );
  const rules = rulesOverride || getDefaultRulesConfig();

  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: ";",
  });

  const evalCtx: TenantSpaceContext = {
    tenantId: "eval-unexpected",
    spaceId: "eval-unexpected",
    userId: "eval",
  };

  const records: NormalizedRecord[] = parsed.data.map((row, idx) =>
    buildNormalizedPair({
      ctx: evalCtx,
      sourceId: "eval-unexpected-csv",
      sourceType: "csv",
      rawPayload: row,
      rawFormat: "csv",
      rowIndex: idx,
    }).normalized
  );

  const recById = new Map(records.map((r) => [r.id, r]));
  const yamlDet = runDeterministicControls({
    ctx: evalCtx,
    runId: "eval-unexpected-yaml",
    records,
    rules,
  });

  const yamlFlaggedExtIds = new Set(
    yamlDet.anomalies.map((a) => recById.get(a.recordId)?.externalId || "").filter(Boolean)
  );

  const agentReasons = detectUnexpectedAnomalies(records, rules);

  // Enrichissement LLM optionnel si un fournisseur externe est configuré
  const provider = createLlmProvider();
  if (provider.providerName !== "deterministic" && process.env.ENABLE_LLM_UNEXPECTED_EVAL === "1") {
    try {
      const compactRows = records.map((r) => ({
        externalId: r.externalId,
        fullName: r.fullName,
        phone: r.phone,
        email: r.email,
        age: r.age,
        amount: r.amount,
        currency: r.currency,
        recordedAt: r.recordedAt,
        zone: r.zone,
      }));
      const resp = await provider.chat({
        system:
          "Repère les anomalies sémantiques imprévues. Réponds en JSON {flagged:[{externalId,reason}]}.",
        messages: [{ role: "user", text: JSON.stringify(compactRows) }],
        schema: { type: "object" },
      });
      const parsedLlm = JSON.parse(resp.text || "{}") as {
        flagged?: Array<{ externalId?: string; reason?: string }>;
      };
      for (const f of parsedLlm.flagged || []) {
        if (f.externalId && f.reason) {
          const list = agentReasons.get(f.externalId) || [];
          if (!list.includes(f.reason)) list.push(f.reason);
          agentReasons.set(f.externalId, list);
        }
      }
    } catch {
      // Conservation du détecteur local en cas d'indisponibilité réseau
    }
  }

  const truthExtSet = new Set(truth.errors.map((e) => e.externalId));
  let yamlTp = 0;
  let yamlFp = 0;
  for (const extId of yamlFlaggedExtIds) {
    if (truthExtSet.has(extId)) yamlTp += 1;
    else yamlFp += 1;
  }

  let agentTp = 0;
  const falsePositiveExternalIds: string[] = [];
  for (const [extId, reasons] of agentReasons.entries()) {
    if (reasons.length === 0) continue;
    if (truthExtSet.has(extId)) agentTp += 1;
    else falsePositiveExternalIds.push(extId);
  }

  const cases: UnexpectedCaseResult[] = truth.errors.map((err) => {
    const reasons = agentReasons.get(err.externalId) || [];
    return {
      externalId: err.externalId,
      errorType: err.errorType,
      description: err.description,
      caughtByYaml: yamlFlaggedExtIds.has(err.externalId),
      caughtByAgent: reasons.length > 0,
      detectedReasons: reasons,
    };
  });

  return {
    totalRows: truth.totalRows,
    totalUnexpectedErrors: truth.totalErrors,
    yamlBaseline: computeMetrics(yamlTp, yamlFp, truth.totalErrors - yamlTp),
    agentDetector: computeMetrics(
      agentTp,
      falsePositiveExternalIds.length,
      truth.totalErrors - agentTp
    ),
    falsePositiveExternalIds,
    cases,
    evaluatedAt: new Date().toISOString(),
  };
}
