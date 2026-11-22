import type { Anomaly, NormalizedRecord } from "./types";

/**
 * Contexte de pseudonymisation par run :
 * Garantit qu'un même nom/téléphone/email reçoit le même jeton dans un run donné
 * afin que l'agent puisse raisonner sur les relations sans jamais voir la donnée PII brute.
 */
export class RunPseudonymizer {
  private nameMap = new Map<string, string>();
  private phoneMap = new Map<string, string>();
  private emailMap = new Map<string, string>();
  private nameSeq = 0;
  private phoneSeq = 0;
  private emailSeq = 0;

  pseudonymizeName(value: string | null): string | null {
    if (!value) return null;
    const key = value.trim().toLowerCase();
    if (!this.nameMap.has(key)) {
      this.nameSeq += 1;
      const initial = value.trim().charAt(0).toUpperCase();
      this.nameMap.set(key, `[NOM_${this.nameSeq}:init=${initial},len=${value.trim().length}]`);
    }
    return this.nameMap.get(key)!;
  }

  pseudonymizePhone(value: string | null): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, "");
    const key = digits.length >= 9 ? digits.slice(-9) : digits;
    if (!this.phoneMap.has(key)) {
      this.phoneSeq += 1;
      const suffix = key.slice(-2) || "xx";
      this.phoneMap.set(key, `[TEL_${this.phoneSeq}:fin=**${suffix}]`);
    }
    return this.phoneMap.get(key)!;
  }

  pseudonymizeEmail(value: string | null): string | null {
    if (!value) return null;
    const key = value.trim().toLowerCase();
    if (!this.emailMap.has(key)) {
      this.emailSeq += 1;
      const domain = key.split("@")[1] || "domaine";
      this.emailMap.set(key, `[EMAIL_${this.emailSeq}@${domain}]`);
    }
    return this.emailMap.get(key)!;
  }

  /**
   * Retourne une représentation pseudonymisée d'un enregistrement normalisé
   * sûre pour l'envoi au LLM.
   */
  maskRecord(rec: NormalizedRecord): Record<string, unknown> {
    return {
      recordId: rec.id,
      externalId: rec.externalId,
      sourceType: rec.sourceType,
      fullName: this.pseudonymizeName(rec.fullName),
      phone: this.pseudonymizePhone(rec.phone),
      email: this.pseudonymizeEmail(rec.email),
      age: rec.age,
      amount: rec.amount,
      currency: rec.currency,
      recordedAt: rec.recordedAt,
      latitude: rec.latitude,
      longitude: rec.longitude,
      zone: rec.zone,
      status: rec.status,
    };
  }

  /**
   * Masque les motifs PII potentiels dans un texte libre (email, téléphone) avant envoi au LLM.
   */
  maskText(text: string): string {
    return text
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_MASQUE]")
      .replace(/(\+?\d[\d\s-]{6,}\d)/g, "[TEL_MASQUE]");
  }

  maskAnomaly(anomaly: Anomaly): Record<string, unknown> {
    return {
      anomalyId: anomaly.id,
      recordId: anomaly.recordId,
      relatedRecordId: anomaly.relatedRecordId ?? null,
      category: anomaly.category,
      severity: anomaly.severity,
      field: anomaly.field ?? null,
      similarityScore: anomaly.similarityScore ?? null,
      message: this.maskText(anomaly.message),
      status: anomaly.status,
    };
  }
}
