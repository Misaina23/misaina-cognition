import crypto from "crypto";
import type { ConnectorKind, NormalizedRecord, RawRecord, TenantSpaceContext } from "./types";

/**
 * Calcule un hash SHA-256 déterministe d'un objet JSON (clés triées).
 */
export function computeStableHash(payload: Record<string, unknown>): string {
  const canonical = stableStringify(payload);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Alias automatiques FR/EN lorsque aucun mapping explicite n'est fourni pour une colonne.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  externalId: ["id", "_id", "__id", "external_id", "record_id", "uuid", "matricule", "case_id"],
  fullName: ["fullname", "full_name", "nom_complet", "nom", "name", "beneficiaire", "beneficiary_name", "patient_name"],
  firstName: ["prenom", "first_name", "firstname", "given_name"],
  lastName: ["nom_famille", "last_name", "lastname", "family_name", "surname"],
  phone: ["phone", "telephone", "tel", "mobile", "phone_number", "num_tel", "contact"],
  email: ["email", "mail", "courriel", "e_mail", "email_address"],
  age: ["age", "years", "age_annees", "age_years"],
  amount: ["amount", "montant", "aide_montant", "grant_amount", "somme", "total", "valeur"],
  currency: ["currency", "devise", "monnaie"],
  recordedAt: ["recorded_at", "date", "submitted_at", "submission_time", "_submission_time", "received_on", "created_at", "date_collecte"],
  latitude: ["latitude", "lat", "gps_lat", "geo_lat"],
  longitude: ["longitude", "lon", "lng", "long", "gps_lon", "geo_lon"],
  zone: ["zone", "region", "localite", "commune", "site", "camp", "location_name", "district"],
};

function cleanKey(k: string): string {
  return k
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-]+/g, "_");
}

function toStringOrNull(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

function toNumberOrNull(val: unknown): number | null {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  // Gère le séparateur décimal français (virgule) et les espaces
  const cleaned = String(val).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrait latitude et longitude depuis plusieurs formats :
 * - Kobo `_geolocation`: [lat, lon] ou ["14.69", "-17.44"]
 * - ODK geopoint string: "14.6928 -17.4467 12.0 4.5"
 * - Colonnes séparées latitude / longitude
 */
export function extractGeoCoordinates(
  mapped: Record<string, unknown>,
  raw: Record<string, unknown>,
  geoField?: string
): { latitude: number | null; longitude: number | null } {
  let lat = toNumberOrNull(mapped.latitude);
  let lon = toNumberOrNull(mapped.longitude);

  if (lat !== null && lon !== null) {
    return { latitude: lat, longitude: lon };
  }

  const candidateFields = [
    geoField,
    "_geolocation",
    "geolocation",
    "location",
    "gps",
    "coordonnees",
  ].filter(Boolean) as string[];

  for (const field of candidateFields) {
    const val = raw[field] ?? mapped[field];
    if (!val) continue;

    if (Array.isArray(val) && val.length >= 2) {
      lat = toNumberOrNull(val[0]);
      lon = toNumberOrNull(val[1]);
      if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };
    }

    if (typeof val === "string") {
      // Format ODK "lat lon [alt] [acc]" ou "lat, lon"
      const parts = val
        .trim()
        .split(/[\s,;]+/)
        .map((p) => toNumberOrNull(p))
        .filter((n): n is number => n !== null);
      if (parts.length >= 2) {
        return { latitude: parts[0], longitude: parts[1] };
      }
    }

    if (typeof val === "object" && val !== null) {
      const obj = val as Record<string, unknown>;
      lat = toNumberOrNull(obj.latitude ?? obj.lat);
      lon = toNumberOrNull(obj.longitude ?? obj.lon ?? obj.lng);
      if (lat !== null && lon !== null) return { latitude: lat, longitude: lon };
    }
  }

  return { latitude: lat, longitude: lon };
}

/**
 * Normalise un enregistrement brut en un couple (RawRecord, NormalizedRecord).
 * Le payload brut original est copié tel quel et figé sans aucune altération.
 */
export function buildNormalizedPair(params: {
  ctx: TenantSpaceContext;
  sourceId: string;
  sourceType: ConnectorKind;
  rawPayload: Record<string, unknown>;
  rawFormat: string;
  columnMapping?: Record<string, string>;
  externalIdField?: string;
  geoField?: string;
  detectedEncoding?: string;
  detectedDelimiter?: string;
  rowIndex?: number;
}): { raw: RawRecord; normalized: NormalizedRecord } {
  const {
    ctx,
    sourceId,
    sourceType,
    rawPayload,
    rawFormat,
    columnMapping = {},
    externalIdField,
    geoField,
    detectedEncoding,
    detectedDelimiter,
    rowIndex = 0,
  } = params;

  const now = new Date().toISOString();
  const payloadHash = computeStableHash(rawPayload);

  // Applique le mapping explicite puis les alias automatiques
  const mapped: Record<string, unknown> = {};
  const consumedSourceKeys = new Set<string>();

  for (const [srcKey, targetField] of Object.entries(columnMapping)) {
    if (srcKey in rawPayload) {
      mapped[targetField] = rawPayload[srcKey];
      consumedSourceKeys.add(srcKey);
    }
  }

  for (const [srcKey, value] of Object.entries(rawPayload)) {
    if (consumedSourceKeys.has(srcKey)) continue;
    const normalizedKey = cleanKey(srcKey);

    for (const [canonicalField, aliases] of Object.entries(FIELD_ALIASES)) {
      if (mapped[canonicalField] !== undefined) continue;
      if (aliases.includes(normalizedKey)) {
        mapped[canonicalField] = value;
        consumedSourceKeys.add(srcKey);
        break;
      }
    }
  }

  // Recompose fullName si prenom + nom sont séparés
  let fullName = toStringOrNull(mapped.fullName);
  if (!fullName) {
    const first = toStringOrNull(mapped.firstName);
    const last = toStringOrNull(mapped.lastName);
    if (first || last) {
      fullName = [first, last].filter(Boolean).join(" ").trim();
    }
  }

  const explicitExternal =
    (externalIdField ? toStringOrNull(rawPayload[externalIdField]) : null) ??
    toStringOrNull(mapped.externalId);
  const externalId = explicitExternal || `hash-${payloadHash.slice(0, 16)}-${rowIndex}`;

  const { latitude, longitude } = extractGeoCoordinates(mapped, rawPayload, geoField);

  // Champs supplémentaires non mappés vers les colonnes canoniques
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPayload)) {
    if (!consumedSourceKeys.has(k)) {
      extra[k] = v;
    }
  }

  const rawId = `raw-${sourceId}-${payloadHash.slice(0, 12)}-${Date.now()}-${rowIndex}`;
  const normId = `rec-${sourceId}-${payloadHash.slice(0, 12)}-${Date.now()}-${rowIndex}`;

  // Clé métier normalisée pour aider à la détection rapide de doublons
  const phoneStr = toStringOrNull(mapped.phone);
  const normalizedPhone = phoneStr ? phoneStr.replace(/[^\d+]/g, "") : null;
  const normalizedName = fullName
    ? fullName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const recordKey = `${normalizedName}|${normalizedPhone || ""}`;

  const raw: RawRecord = {
    id: rawId,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    sourceId,
    sourceType,
    externalId,
    payloadHash,
    rawPayload: { ...rawPayload },
    rawFormat,
    detectedEncoding,
    detectedDelimiter,
    ingestedAt: now,
  };

  const normalized: NormalizedRecord = {
    id: normId,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    rawRecordId: rawId,
    sourceId,
    sourceType,
    externalId,
    payloadHash,
    recordKey,
    fullName,
    phone: phoneStr,
    email: toStringOrNull(mapped.email)?.toLowerCase() ?? null,
    age: toNumberOrNull(mapped.age),
    amount: toNumberOrNull(mapped.amount),
    currency: toStringOrNull(mapped.currency) ?? (mapped.amount !== undefined && mapped.amount !== null ? "EUR" : null),
    recordedAt: toStringOrNull(mapped.recordedAt),
    latitude,
    longitude,
    zone: toStringOrNull(mapped.zone),
    status: "active",
    extra,
    createdAt: now,
    updatedAt: now,
  };

  return { raw, normalized };
}
