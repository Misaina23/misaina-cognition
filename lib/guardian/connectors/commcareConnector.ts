import { buildNormalizedPair } from "../normalizer";
import { guardianRepo } from "../repository";
import type {
  ConnectorIngestResult,
  ConnectorInput,
  NormalizedRecord,
  RawRecord,
  SourceConnector,
  TenantSpaceContext,
} from "../types";

interface CommCareSubmission {
  id: string;
  received_on?: string;
  form?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Connecteur CommCare HQ :
 * - Lit les soumissions via l'API REST v0.5 avec curseur (dernière date / ID).
 * - Utilise COMMCARE_DOMAIN, COMMCARE_USERNAME, COMMCARE_API_KEY depuis process.env.
 * - Si des rawItems sont fournis (tests / webhook) ou si l'API n'est pas configurée,
 *   traite le flux fourni tout en garantissant le curseur et l'idempotence.
 */
export class CommCareConnector implements SourceConnector {
  readonly type = "commcare" as const;

  async ingest(
    input: ConnectorInput,
    ctx: TenantSpaceContext
  ): Promise<ConnectorIngestResult> {
    const { source } = input;
    const limit = input.limit ?? 100;
    let submissions: CommCareSubmission[] = [];

    if (input.rawItems && input.rawItems.length > 0) {
      submissions = input.rawItems as CommCareSubmission[];
    } else {
      submissions = await this.fetchFromCommCareApi(
        source.lastCursorDate,
        limit,
        source.endpointUrl
      );
    }

    // Filtrage par curseur incrémental (strictement postérieur ou différent du dernier ID traité)
    const filtered = submissions.filter((sub) => {
      if (!source.lastCursorDate || !sub.received_on) return true;
      if (sub.received_on > source.lastCursorDate) return true;
      if (sub.received_on === source.lastCursorDate && sub.id !== source.lastCursorId) {
        return true;
      }
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

      // Aplatit form + metadata uniquement pour la vue de normalisation,
      // tout en gardant la soumission brute CommCare complète dans rawPayload.
      const flattenedForNorm: Record<string, unknown> = {
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

      // Applique les champs extraits de `form` sur la normalisation sans toucher au rawPayload
      const formNorm = buildNormalizedPair({
        ctx,
        sourceId: source.id,
        sourceType: "commcare",
        rawPayload: flattenedForNorm,
        rawFormat: "commcare-json",
        columnMapping,
        externalIdField: "id",
        geoField: source.geoField,
        rowIndex: i,
      });

      const mergedNormalized: NormalizedRecord = {
        ...formNorm.normalized,
        id: normalized.id,
        rawRecordId: raw.id,
        payloadHash: raw.payloadHash,
        externalId: sub.id || raw.externalId,
      };

      const dup = guardianRepo.findDuplicateIngestion(
        ctx,
        source.id,
        raw.externalId,
        raw.payloadHash
      );

      if (dup) {
        skippedIdempotentCount++;
        continue;
      }

      const frozenRaw = guardianRepo.insertIngestedPair(ctx, raw, mergedNormalized);
      rawRecords.push(frozenRaw);
      normalizedRecords.push(mergedNormalized);

      if (sub.received_on && (!newestDate || sub.received_on >= newestDate)) {
        newestDate = sub.received_on;
        newestId = sub.id;
      }
    }

    guardianRepo.updateSourceStats(ctx, source.id, {
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
        "Variables COMMCARE_DOMAIN, COMMCARE_USERNAME et COMMCARE_API_KEY requises pour interroger l'API CommCare (ou fournissez rawItems pour une ingestion locale)."
      );
    }

    const baseUrl =
      customEndpoint || `https://www.commcarehq.org/a/${encodeURIComponent(domain)}/api/v0.5/form/`;
    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(limit));
    if (sinceDate) {
      url.searchParams.set("received_on_start", sinceDate);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `ApiKey ${username}:${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Erreur API CommCare (${res.status}) : ${res.statusText}`);
    }

    const payload = (await res.json()) as { objects?: CommCareSubmission[] };
    return payload.objects ?? [];
  }
}
