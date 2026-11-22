import type { ProjectRulesConfig } from "./rulesConfig";
import { computeRecordSimilarity, normalizePhoneDigits, normalizeText } from "./similarity";
import type { Anomaly, NormalizedRecord, TenantSpaceContext } from "./types";

/**
 * Construit une clé métier normalisée pour détecter les doublons exacts
 * indépendamment des accents, de la casse ou du formatage téléphonique.
 */
function buildBusinessKey(rec: NormalizedRecord, fields: string[]): string | null {
  const parts: string[] = [];
  for (const field of fields) {
    let val = "";
    if (field === "fullName") {
      val = normalizeText(rec.fullName);
    } else if (field === "phone") {
      val = normalizePhoneDigits(rec.phone);
    } else if (field === "email") {
      val = normalizeText(rec.email);
    } else {
      const raw = (rec as Record<string, unknown>)[field] ?? rec.extra[field];
      val = normalizeText(raw !== undefined && raw !== null ? String(raw) : "");
    }
    if (!val) return null; // Clé incomplète : ne pas créer de faux doublon exact
    parts.push(val);
  }
  return parts.join("|");
}

/**
 * Moteur de contrôle déterministe :
 * Exécute les règles YAML du projet sur les enregistrements actifs de l'espace (tenantId, spaceId)
 * avant toute invocation d'un agent LLM.
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

  const pushAnomaly = (data: Omit<Anomaly, "id" | "tenantId" | "spaceId" | "runId" | "status" | "createdAt">) => {
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

  // --- 1. Contrôles unitaires par enregistrement (champs requis, bornes, dates, GPS) ---
  for (const rec of records) {
    // 1a. Champs obligatoires vides
    for (const reqField of rules.requiredFields) {
      const val = (rec as Record<string, unknown>)[reqField.field];
      const isEmpty =
        val === null ||
        val === undefined ||
        (typeof val === "string" && val.trim().length === 0);

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

    // 1b. Valeurs aberrantes : Âge
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

    // 1c. Valeurs aberrantes : Montant
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

    // 1d. Valeurs aberrantes : Date d'enregistrement
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

    // 1e. GPS hors zone
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
          const normalizedDeclaredZone = normalizeText(rec.zone);
          const matchedZone = rules.geoBounds.interventionZones.find(
            (z) => normalizeText(z.name) === normalizedDeclaredZone
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

  // --- 2. Détection des doublons exacts (hash de contenu ou clé métier YAML) ---
  const seenHashes = new Map<string, NormalizedRecord>();
  const seenBusinessKeys = new Map<string, NormalizedRecord>();
  const flaggedPairs = new Set<string>();
  let duplicatesCount = 0;

  for (const rec of records) {
    const hashLeader = seenHashes.get(rec.payloadHash);
    if (hashLeader) {
      const pairKey = [hashLeader.id, rec.id].sort().join("::");
      flaggedPairs.add(pairKey);
      duplicatesCount += 1;
      pushAnomaly({
        recordId: rec.id,
        relatedRecordId: hashLeader.id,
        ruleId: "exact_duplicate_hash",
        category: "exact_duplicate",
        severity: rules.duplicateDetection.exactSeverity,
        message: `Doublon exact (empreinte identique) avec l'enregistrement ${hashLeader.externalId}.`,
        similarityScore: 1,
      });
      continue;
    }
    seenHashes.set(rec.payloadHash, rec);

    const bKey = buildBusinessKey(rec, rules.duplicateDetection.exactBusinessKeyFields);
    if (bKey) {
      const keyLeader = seenBusinessKeys.get(bKey);
      if (keyLeader) {
        const pairKey = [keyLeader.id, rec.id].sort().join("::");
        flaggedPairs.add(pairKey);
        duplicatesCount += 1;
        pushAnomaly({
          recordId: rec.id,
          relatedRecordId: keyLeader.id,
          ruleId: "exact_duplicate_business_key",
          category: "exact_duplicate",
          severity: rules.duplicateDetection.exactSeverity,
          message: `Doublon exact sur la clé métier (${rules.duplicateDetection.exactBusinessKeyFields.join(" + ")}) avec ${keyLeader.externalId}.`,
          similarityScore: 1,
        });
        continue;
      }
      seenBusinessKeys.set(bKey, rec);
    }
  }

  // --- 3. Détection des quasi-doublons (vecteurs trigrammes, Levenshtein, accents) ---
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
