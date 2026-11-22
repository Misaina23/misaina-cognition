import type { NormalizedRecord } from "./types";

/**
 * Supprime les accents, met en minuscules et nettoie la ponctuation superflue.
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalise un numéro de téléphone en conservant les 9 derniers chiffres significatifs
 * (permet de rapprocher +221771112233, 00221771112233 et 771112233).
 */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

/**
 * Distance de Levenshtein normalisée entre 0 et 1 (1 = identique).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;

  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }

  const maxLen = Math.max(m, n);
  return maxLen === 0 ? 1 : Number((1 - dp[n] / maxLen).toFixed(4));
}

/**
 * Construit un vecteur de trigrammes de caractères pour le calcul de similarité cosinus
 * (robuste aux inversions de mots et aux petites fautes de frappe).
 */
export function buildTrigramVector(text: string): Map<string, number> {
  const padded = `  ${normalizeText(text)}  `;
  const vec = new Map<string, number>();
  if (padded.trim().length === 0) return vec;

  for (let i = 0; i <= padded.length - 3; i++) {
    const tri = padded.slice(i, i + 3);
    vec.set(tri, (vec.get(tri) || 0) + 1);
  }
  return vec;
}

/**
 * Similarité cosinus entre deux vecteurs clairsemés de trigrammes.
 */
export function cosineSimilarity(
  vecA: Map<string, number>,
  vecB: Map<string, number>
): number {
  if (vecA.size === 0 || vecB.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [k, v] of vecA.entries()) {
    normA += v * v;
    const bv = vecB.get(k);
    if (bv !== undefined) dot += v * bv;
  }
  for (const v of vecB.values()) {
    normB += v * v;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Number((dot / denom).toFixed(4));
}

/**
 * Compare les noms en tenant compte de l'ordre des tokens ("Diallo Aminata" vs "Aminata Diallo")
 * et des fautes de frappe / accents.
 */
export function nameSimilarity(nameA: string | null, nameB: string | null): number {
  const a = normalizeText(nameA);
  const b = normalizeText(nameB);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const directLev = levenshteinSimilarity(a, b);
  const sortedA = a.split(" ").sort().join(" ");
  const sortedB = b.split(" ").sort().join(" ");
  const sortedLev = levenshteinSimilarity(sortedA, sortedB);
  const triCos = cosineSimilarity(buildTrigramVector(a), buildTrigramVector(b));

  return Number(Math.max(directLev, sortedLev, (directLev + triCos) / 2).toFixed(4));
}

/**
 * Calcule un score global de similarité [0, 1] entre deux enregistrements normalisés
 * pour identifier les quasi-doublons tout en évitant les faux positifs.
 */
export function computeRecordSimilarity(
  recA: NormalizedRecord,
  recB: NormalizedRecord
): { score: number; reason: string } {
  const nSim = nameSimilarity(recA.fullName, recB.fullName);
  const phoneA = normalizePhoneDigits(recA.phone);
  const phoneB = normalizePhoneDigits(recB.phone);

  let phoneSim = 0;
  if (phoneA && phoneB) {
    phoneSim = phoneA === phoneB ? 1 : levenshteinSimilarity(phoneA, phoneB);
  }

  const emailA = normalizeText(recA.email);
  const emailB = normalizeText(recB.email);
  const emailMatch = emailA && emailB && emailA === emailB;

  const zoneA = normalizeText(recA.zone);
  const zoneB = normalizeText(recB.zone);
  const zoneSim = zoneA && zoneB ? (zoneA === zoneB ? 1 : levenshteinSimilarity(zoneA, zoneB)) : 0.5;

  // Même email exact + nom proche -> très forte probabilité de doublon
  if (emailMatch && nSim >= 0.7) {
    return {
      score: Number(Math.min(0.99, 0.55 + nSim * 0.44).toFixed(4)),
      reason: "Email identique et nom similaire",
    };
  }

  // Même téléphone exact + nom similaire (avec fautes de frappe / accents)
  if (phoneA && phoneB && phoneSim === 1 && nSim >= 0.65) {
    const score = Number((0.45 + nSim * 0.54).toFixed(4));
    return {
      score,
      reason: `Téléphone identique et nom proche (${Math.round(nSim * 100)}%)`,
    };
  }

  // Nom très proche + téléphone avec 1-2 chiffres erronés ou zone identique
  if (nSim >= 0.82) {
    if (phoneA && phoneB && phoneSim >= 0.75) {
      const score = Number((nSim * 0.65 + phoneSim * 0.35).toFixed(4));
      return {
        score,
        reason: `Nom quasi identique (${Math.round(nSim * 100)}%) et téléphone proche (${Math.round(phoneSim * 100)}%)`,
      };
    }

    // Si pas de téléphone sur l'un des deux, compare nom + zone + âge
    const ageClose =
      recA.age !== null && recB.age !== null ? Math.abs(recA.age - recB.age) <= 1 : false;
    if (zoneSim >= 0.85 && (ageClose || !phoneA || !phoneB)) {
      const bonus = ageClose ? 0.06 : 0;
      const score = Number(Math.min(0.92, nSim * 0.85 + zoneSim * 0.08 + bonus).toFixed(4));
      return {
        score,
        reason: `Nom similaire (${Math.round(nSim * 100)}%) dans la même zone`,
      };
    }
  }

  // Téléphone identique mais noms légèrement différents (ex. surnom / erreur saisie)
  if (phoneA && phoneB && phoneSim === 1 && nSim >= 0.45) {
    return {
      score: 0.81,
      reason: "Téléphone identique avec divergence partielle sur le nom",
    };
  }

  // Similarité vectorielle globale faible (pas un quasi-doublon)
  const fallback = Number((nSim * 0.6 + phoneSim * 0.4).toFixed(4));
  return { score: fallback, reason: "Similarité faible" };
}
