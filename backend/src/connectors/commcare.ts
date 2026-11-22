import { journalRepo } from "../journal";
import {
  buildNormalizedPair,
  type ConnectorIngestResult,
  type ConnectorInput,
  type NormalizedRecord,
  type RawRecord,
  type SourceConnector,
  type TenantSpaceContext,
} from "./types";

interface CommCareSubmission {
  id: string;
  received_on?: string;
  form?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Connecteur CommCare HQ (curseur incrémental date/ID + ingestion idempotente).
 */
export class CommCareConnector implements SourceConnector {
  readonly type = "commcare" as const;

  async ingest(input: ConnectorInput, ctx: TenantSpaceContext): Promise<ConnectorIngestResult> {
    const { source } = input;
    const limit = input.limit ?? 100;
    const submissions: CommCareSubmission[] =
      input.rawItems && input.rawItems.length > 0
        ? (input.rawItems as CommCareSubmission[])
        : await this.fetchFromCommCareApi(source.lastCursorDate, limit, source.endpointUrl);

    const filtered = submissions.filter((sub) => {
      if (!source.lastCursorDate || !sub.received_on) return true;
      if (sub.received_on > source.lastCursorDate) return true;
      if (sub.received_on === source.lastCursorDate && sub.id !== source.lastCursorId) return true;
      return false;
    });

    const columnMapping = input.columnMapping ?? source.columnMapping ?? {};
    const rawRecords: RawRecord[] = [];
    const normalizedRecords: NormalizedRecord[] = [];
    let skippedIdempotentCount = 0;
    let newestDate = source.lastCursorDate;
    let newestId = source.lastCursorId;

    for (let i = 0; i < filtered.length; i++) {
      const sub = filtered[i];
      const flattened: Record<string, unknown> = {
        ...(typeof sub.form === "object" && sub.form !== null ? sub.form : {}),
        id: sub.id,
        received_on: sub.received_on ?? (sub.metadata?.timeEnd as string | undefined),
      };

      const { raw, normalized } = buildNormalizedPair({
        ctx,
        sourceId: source.id,
        sourceType: "commcare",
        rawPayload: sub as Record<string, unknown>,
        rawFormat: "commcare-json",
        columnMapping,
        externalIdField: "id",
        geoField: source.geoField,
        rowIndex: i,
      });

      const formNorm = buildNormalizedPair({
        ctx,
        sourceId: source.id,
        sourceType: "commcare",
        rawPayload: flattened,
        rawFormat: "commcare-json",
        columnMapping,
        externalIdField: "id",
        geoField: source.geoField,
        rowIndex: i,
      });

      const mergedNorm: NormalizedRecord = {
        ...formNorm.normalized,
        id: normalized.id,
        rawRecordId: raw.id,
        payloadHash: raw.payloadHash,
        externalId: sub.id || raw.externalId,
      };

      const dup = journalRepo.findDuplicateIngestion(
        ctx,
        source.id,
        raw.externalId,
        raw.payloadHash
      );
      if (dup) {
        skippedIdempotentCount++;
        continue;
      }

      rawRecords.push(journalRepo.insertIngestedPair(ctx, raw, mergedNorm));
      normalizedRecords.push(mergedNorm);

      if (sub.received_on && (!newestDate || sub.received_on >= newestDate)) {
        newestDate = sub.received_on;
        newestId = sub.id;
      }
    }

    journalRepo.updateSourceStats(ctx, source.id, {
      lastCursorDate: newestDate,
      lastCursorId: newestId,
      lastSyncAt: new Date().toISOString(),
      status: "ACTIVE",
    });

    return {
      sourceId: source.id,
      sourceType: "commcare",
      totalRead: filtered.length,
      insertedCount: normalizedRecords.length,
      skippedIdempotentCount,
      newCursorDate: newestDate,
      newCursorId: newestId,
      rawRecords,
      normalizedRecords,
    };
  }

  private async fetchFromCommCareApi(
    sinceDate?: string,
    limit = 100,
    customEndpoint?: string
  ): Promise<CommCareSubmission[]> {
    const domain = process.env.COMMCARE_DOMAIN;
    const username = process.env.COMMCARE_USERNAME;
    const apiKey = process.env.COMMCARE_API_KEY;
    if (!domain || !username || !apiKey) {
      throw new Error(
        "Variables COMMCARE_DOMAIN, COMMCARE_USERNAME et COMMCARE_API_KEY requises."
      );
    }
    const baseUrl =
      customEndpoint || `https://www.commcarehq.org/a/${encodeURIComponent(domain)}/api/v0.5/form/`;
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(limit));
    if (sinceDate) url.searchParams.set("received_on_start", sinceDate);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `ApiKey ${username}:${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Erreur API CommCare (${res.status})`);
    const payload = (await res.json()) as { objects?: CommCareSubmission[] };
    return payload.objects ?? [];
  }
}
