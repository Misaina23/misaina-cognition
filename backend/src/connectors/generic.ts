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

function extractByPath(root: unknown, dotPath?: string): Record<string, unknown>[] {
  if (Array.isArray(root)) return root as Record<string, unknown>[];
  if (!root || typeof root !== "object") return [];
  const obj = root as Record<string, unknown>;
  if (dotPath) {
    let cur: unknown = obj;
    for (const seg of dotPath.split(".")) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[seg];
      else {
        cur = undefined;
        break;
      }
    }
    if (Array.isArray(cur)) return cur as Record<string, unknown>[];
  }
  for (const key of ["results", "value", "data", "objects", "items"]) {
    if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
  }
  return [];
}

/**
 * Connecteur générique configurable pour JSON, KoboToolbox et ODK Central.
 */
export class GenericConnector implements SourceConnector {
  readonly type = "generic" as const;

  async ingest(input: ConnectorInput, ctx: TenantSpaceContext): Promise<ConnectorIngestResult> {
    const { source } = input;
    const format = source.format ?? "json";
    let items: Record<string, unknown>[] = [];

    if (input.rawItems && input.rawItems.length > 0) {
      items = input.rawItems;
    } else if (source.endpointUrl) {
      const headers: Record<string, string> = { Accept: "application/json" };
      const token = source.authTokenEnvName ? process.env[source.authTokenEnvName] : undefined;
      if (token) {
        headers.Authorization = format === "kobo" ? `Token ${token}` : `Bearer ${token}`;
      }
      const res = await fetch(source.endpointUrl, { headers });
      if (!res.ok) throw new Error(`Erreur connecteur ${format} (${res.status})`);
      items = extractByPath(await res.json(), source.recordsPath);
    } else {
      throw new Error("GenericConnector requiert rawItems ou endpointUrl.");
    }

    const columnMapping = input.columnMapping ?? source.columnMapping ?? {};
    const externalIdField =
      source.externalIdField ?? (format === "kobo" ? "_id" : format === "odk" ? "__id" : "id");

    const rawRecords: RawRecord[] = [];
    const normalizedRecords: NormalizedRecord[] = [];
    let skippedIdempotentCount = 0;

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (!row || typeof row !== "object") continue;

      const { raw, normalized } = buildNormalizedPair({
        ctx,
        sourceId: source.id,
        sourceType: "generic",
        rawPayload: row,
        rawFormat: format,
        columnMapping,
        externalIdField,
        geoField: source.geoField ?? (format === "kobo" ? "_geolocation" : undefined),
        rowIndex: i,
      });

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

      rawRecords.push(journalRepo.insertIngestedPair(ctx, raw, normalized));
      normalizedRecords.push(normalized);
    }

    journalRepo.updateSourceStats(ctx, source.id, {
      lastSyncAt: new Date().toISOString(),
      status: "ACTIVE",
    });

    return {
      sourceId: source.id,
      sourceType: "generic",
      totalRead: items.length,
      insertedCount: normalizedRecords.length,
      skippedIdempotentCount,
      rawRecords,
      normalizedRecords,
    };
  }
}
