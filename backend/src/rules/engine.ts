import { load as parseYaml } from "js-yaml";
import { z } from "zod";
import type { Anomaly, NormalizedRecord, TenantSpaceContext } from "../connectors/types";
import { computeRecordSimilarity, normalizePhoneDigits, normalizeText } from "./dedupe";

const SeveritySchema = z.enum(["bloquante", "a_verifier", "mineure"]);

export const ProjectRulesSchema = z.object({
  version: z.number().int().positive().default(1),
  projectName: z.string().default("Projet Standard"),
  requiredFields: z
    .array(
      z.object({
        field: z.enum(["fullName", "phone", "email", "age", "amount", "recordedAt", "zone", "externalId"]),
        severity: SeveritySchema.default("bloquante"),
        label: z.string().optional(),
      })
    )
    .default([
      { field: "fullName", severity: "bloquante", label: "Nom complet" },
      { field: "zone", severity: "a_verifier", label: "Zone géographique" },
      { field: "phone", severity: "mineure", label: "Téléphone" },
    ]),
  ranges: z
    .object({
      age: z
        .object({
          min: z.number().default(0),
          max: z.number().default(110),
          severity: SeveritySchema.default("bloquante"),
        })
        .optional(),
      amount: z
        .object({
          min: z.number().default(0),
          max: z.number().default(50000),
          severity: SeveritySchema.default("a_verifier"),
        })
        .optional(),
      recordedAt: z
        .object({
          minYear: z.number().int().default(2015),
          allowFutureDays: z.number().int().default(1),
          severity: SeveritySchema.default("a_verifier"),
        })
        .optional(),
    })
    .default({}),
  geoBounds: z
    .object({
      enabled: z.boolean().default(true),
      zoneName: z.string().default("Zone d'intervention"),
      minLat: z.number(),
      maxLat: z.number(),
      minLon: z.number(),
      maxLon: z.number(),
      rejectZeroZero: z.boolean().default(true),
      severity: SeveritySchema.default("bloquante"),
      mismatchSeverity: SeveritySchema.default("a_verifier"),
      interventionZones: z
        .array(
          z.object({
            name: z.string().min(1),
            minLat: z.number(),
            maxLat: z.number(),
            minLon: z.number(),
            maxLon: z.number(),
            severity: SeveritySchema.optional(),
          })
        )
        .default([]),
    })
    .optional(),
  duplicateDetection: z
    .object({
      exactBusinessKeyFields: z.array(z.string()).default(["fullName", "phone"]),
      exactSeverity: SeveritySchema.default("bloquante"),
      nearDuplicate: z
        .object({
          enabled: z.boolean().default(true),
          autoMergeThreshold: z.number().min(0.5).max(1).default(0.95),
          reviewThreshold: z.number().min(0.5).max(1).default(0.8),
          severity: SeveritySchema.default("a_verifier"),
        })
        .default({
          enabled: true,
          autoMergeThreshold: 0.95,
          reviewThreshold: 0.8,
          severity: "a_verifier",
        }),
    })
    .default({
      exactBusinessKeyFields: ["fullName", "phone"],
      exactSeverity: "bloquante",
      nearDuplicate: {
        enabled: true,
        autoMergeThreshold: 0.95,
        reviewThreshold: 0.8,
        severity: "a_verifier",
      },
    }),
  guardrails: z
    .object({
      maxAbnormalAnomalyRatio: z.number().min(0.05).max(1).default(0.45),
      maxActionsPerRun: z.number().int().positive().default(60),
      maxTokensPerRun: z.number().int().positive().default(16000),
      minAgentConfidence: z.number().min(0).max(1).default(0.65),
    })
    .default({
      maxAbnormalAnomalyRatio: 0.45,
      maxActionsPerRun: 60,
      maxTokensPerRun: 16000,
      minAgentConfidence: 0.65,
    }),
});

export type ProjectRulesConfig = z.infer<typeof ProjectRulesSchema>;

export function parseProjectRulesYaml(yamlText: string): {
  config: ProjectRulesConfig;
  rawYaml: string;
} {
  const parsed = parseYaml(yamlText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le fichier YAML des règles doit contenir un objet de configuration.");
  }
  return { config: ProjectRulesSchema.parse(parsed), rawYaml: yamlText };
}

function buildBusinessKey(rec: NormalizedRecord, fields: string[]): string | null {
  const parts: string[] = [];
  for (const field of fields) {
    let val = "";
    if (field === "fullName") val = normalizeText(rec.fullName);
    else if (field === "phone") val = normalizePhoneDigits(rec.phone);
    else if (field === "email") val = normalizeText(rec.email);
    else {
      const raw = (rec as Record<string, unknown>)[field] ?? rec.extra[field];
      val = normalizeText(raw !== undefined && raw !== null ? String(raw) : "");
    }
    if (!val) return null;
    parts.push(val);
  }
  return parts.join("|");
}

/**
 * Moteur de contrôle déterministe piloté par les règles YAML (incluant la comparaison
 * des coordonnées GPS par rapport aux zones d'intervention déclarées).
 */
export function runDeterministicControls(params: {
  ctx: TenantSpaceContext;
  runId: string;
  records: NormalizedRecord[];
  rules: ProjectRulesConfig;
}): {
  anomalies: Anomaly[];
  duplicatesCount: number;
} {
  const { ctx, runId, records, rules } = params;
  const now = new Date().toISOString();
  const anomalies: Anomaly[] = [];
  let seq = 0;

  const pushAnomaly = (
    data: Omit<Anomaly, "id" | "tenantId" | "spaceId" | "runId" | "status" | "createdAt">
  ) => {
    seq += 1;
    anomalies.push({
      id: `anom-${runId}-${seq}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId,
      status: "open",
      createdAt: now,
      ...data,
    });
  };

  for (const rec of records) {
    for (const reqField of rules.requiredFields) {
      const val = (rec as Record<string, unknown>)[reqField.field];
      const isEmpty =
        val === null || val === undefined || (typeof val === "string" && val.trim().length === 0);

      if (isEmpty) {
        pushAnomaly({
          recordId: rec.id,
          ruleId: `required_${reqField.field}`,
          category: "missing_required",
          severity: reqField.severity,
          field: reqField.field,
          message: `Champ obligatoire manquant : ${reqField.label || reqField.field}.`,
        });
      }
    }

    if (rules.ranges.age && rec.age !== null) {
      const { min, max, severity } = rules.ranges.age;
      if (rec.age < min || rec.age > max) {
        pushAnomaly({
          recordId: rec.id,
          ruleId: "range_age",
          category: "outlier",
          severity,
          field: "age",
          message: `Âge aberrant détecté (${rec.age} ans) — plage autorisée [${min}, ${max}].`,
        });
      }
    }

    if (rules.ranges.amount && rec.amount !== null) {
      const { min, max, severity } = rules.ranges.amount;
      if (rec.amount < min || rec.amount > max) {
        pushAnomaly({
          recordId: rec.id,
          ruleId: "range_amount",
          category: "outlier",
          severity,
          field: "amount",
          message: `Montant aberrant (${rec.amount}) — plage autorisée [${min}, ${max}].`,
        });
      }
    }

    if (rules.ranges.recordedAt && rec.recordedAt !== null) {
      const parsedTime = Date.parse(rec.recordedAt);
      const { minYear, allowFutureDays, severity } = rules.ranges.recordedAt;
      if (Number.isNaN(parsedTime)) {
        pushAnomaly({
          recordId: rec.id,
          ruleId: "format_recordedAt",
          category: "format",
          severity,
          field: "recordedAt",
          message: `Format de date invalide (« ${rec.recordedAt} »).`,
        });
      } else {
        const dt = new Date(parsedTime);
        const maxAllowed = Date.now() + allowFutureDays * 86400000;
        if (dt.getUTCFullYear() < minYear || parsedTime > maxAllowed) {
          pushAnomaly({
            recordId: rec.id,
            ruleId: "range_recordedAt",
            category: "outlier",
            severity,
            field: "recordedAt",
            message: `Date hors période autorisée (${rec.recordedAt}, minimum ${minYear}).`,
          });
        }
      }
    }

    if (rules.geoBounds?.enabled) {
      const hasLat = rec.latitude !== null;
      const hasLon = rec.longitude !== null;

      if (hasLat !== hasLon) {
        pushAnomaly({
          recordId: rec.id,
          ruleId: "geo_incomplete",
          category: "geo_out_of_bounds",
          severity: rules.geoBounds.severity,
          field: "latitude",
          message: "Coordonnées GPS incomplètes (latitude ou longitude manquante).",
        });
      } else if (hasLat && hasLon && rec.latitude !== null && rec.longitude !== null) {
        const lat = rec.latitude;
        const lon = rec.longitude;
        const invalidCoords = Math.abs(lat) > 90 || Math.abs(lon) > 180;
        const zeroZero = rules.geoBounds.rejectZeroZero && lat === 0 && lon === 0;
        const outOfBox =
          lat < rules.geoBounds.minLat ||
          lat > rules.geoBounds.maxLat ||
          lon < rules.geoBounds.minLon ||
          lon > rules.geoBounds.maxLon;

        if (invalidCoords || zeroZero || outOfBox) {
          pushAnomaly({
            recordId: rec.id,
            ruleId: "geo_bounds",
            category: "geo_out_of_bounds",
            severity: rules.geoBounds.severity,
            field: "latitude",
            message: `Coordonnées GPS (${lat}, ${lon}) hors zone d'intervention « ${rules.geoBounds.zoneName} ».`,
          });
        } else if (rec.zone && rules.geoBounds.interventionZones?.length) {
          const normalizedDeclared = normalizeText(rec.zone);
          const matchedZone = rules.geoBounds.interventionZones.find(
            (z) => normalizeText(z.name) === normalizedDeclared
          );
          if (
            matchedZone &&
            (lat < matchedZone.minLat ||
              lat > matchedZone.maxLat ||
              lon < matchedZone.minLon ||
              lon > matchedZone.maxLon)
          ) {
            pushAnomaly({
              recordId: rec.id,
              ruleId: "geo_zone_mismatch",
              category: "geo_out_of_bounds",
              severity: matchedZone.severity || rules.geoBounds.mismatchSeverity || "a_verifier",
              field: "latitude",
              message: `Coordonnées GPS (${lat}, ${lon}) incohérentes avec la zone d'intervention « ${rec.zone} » (attendu : lat [${matchedZone.minLat}, ${matchedZone.maxLat}], lon [${matchedZone.minLon}, ${matchedZone.maxLon}]).`,
            });
          }
        }
      }
    }
  }

  const seenHashes = new Map<string, NormalizedRecord>();
  const seenBusinessKeys = new Map<string, NormalizedRecord>();
  const flaggedPairs = new Set<string>();
  let duplicatesCount = 0;

  for (const rec of records) {
    const hashLeader = seenHashes.get(rec.payloadHash);
    if (hashLeader) {
      flaggedPairs.add([hashLeader.id, rec.id].sort().join("::"));
      duplicatesCount += 1;
      pushAnomaly({
        recordId: rec.id,
        relatedRecordId: hashLeader.id,
        ruleId: "exact_duplicate_hash",
        category: "exact_duplicate",
        severity: rules.duplicateDetection.exactSeverity,
        message: `Doublon exact (empreinte identique) avec ${hashLeader.externalId}.`,
        similarityScore: 1,
      });
      continue;
    }
    seenHashes.set(rec.payloadHash, rec);

    const bKey = buildBusinessKey(rec, rules.duplicateDetection.exactBusinessKeyFields);
    if (bKey) {
      const keyLeader = seenBusinessKeys.get(bKey);
      if (keyLeader) {
        flaggedPairs.add([keyLeader.id, rec.id].sort().join("::"));
        duplicatesCount += 1;
        pushAnomaly({
          recordId: rec.id,
          relatedRecordId: keyLeader.id,
          ruleId: "exact_duplicate_business_key",
          category: "exact_duplicate",
          severity: rules.duplicateDetection.exactSeverity,
          message: `Doublon exact sur clé métier (${rules.duplicateDetection.exactBusinessKeyFields.join(" + ")}) avec ${keyLeader.externalId}.`,
          similarityScore: 1,
        });
        continue;
      }
      seenBusinessKeys.set(bKey, rec);
    }
  }

  if (rules.duplicateDetection.nearDuplicate.enabled) {
    const { reviewThreshold, severity } = rules.duplicateDetection.nearDuplicate;
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const recA = records[i];
        const recB = records[j];
        const pairKey = [recA.id, recB.id].sort().join("::");
        if (flaggedPairs.has(pairKey)) continue;

        const { score, reason } = computeRecordSimilarity(recA, recB);
        if (score >= reviewThreshold) {
          flaggedPairs.add(pairKey);
          duplicatesCount += 1;
          pushAnomaly({
            recordId: recB.id,
            relatedRecordId: recA.id,
            ruleId: "near_duplicate_similarity",
            category: "near_duplicate",
            severity,
            message: `Quasi-doublon détecté (${Math.round(score * 100)}%) avec ${recA.externalId} : ${reason}.`,
            similarityScore: score,
          });
        }
      }
    }
  }

  return { anomalies, duplicatesCount };
}
