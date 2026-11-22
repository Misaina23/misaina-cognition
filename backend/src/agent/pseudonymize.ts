import type { Anomaly, NormalizedRecord } from "../connectors/types";

/**
 * Pseudonymise les champs sensibles (noms, téléphones, emails) avant tout envoi au LLM.
 */
export class RunPseudonymizer {
  private nameTokens = new Map<string, string>();
  private phoneTokens = new Map<string, string>();
  private emailTokens = new Map<string, string>();
  private counter = 0;

  private tokenFor(map: Map<string, string>, prefix: string, value: string): string {
    const key = value.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) return existing;
    this.counter += 1;
    const tok = `${prefix}_${this.counter}`;
    map.set(key, tok);
    return tok;
  }

  maskText(text: string): string {
    return text
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_MASQUE]")
      .replace(/(?:\+|00)?\d[\d\s.-]{6,14}\d/g, "[TEL_MASQUE]");
  }

  maskRecord(rec: NormalizedRecord): Record<string, unknown> {
    return {
      id: rec.id,
      externalId: rec.externalId,
      fullName: rec.fullName ? this.tokenFor(this.nameTokens, "PERSON", rec.fullName) : null,
      phone: rec.phone ? this.tokenFor(this.phoneTokens, "PHONE", rec.phone) : null,
      email: rec.email ? this.tokenFor(this.emailTokens, "EMAIL", rec.email) : null,
      age: rec.age,
      amount: rec.amount,
      zone: rec.zone,
      latitude: rec.latitude,
      longitude: rec.longitude,
      status: rec.status,
    };
  }

  maskAnomaly(anom: Anomaly): Record<string, unknown> {
    return {
      id: anom.id,
      recordId: anom.recordId,
      relatedRecordId: anom.relatedRecordId,
      category: anom.category,
      severity: anom.severity,
      similarityScore: anom.similarityScore,
      message: this.maskText(anom.message),
      status: anom.status,
    };
  }
}
