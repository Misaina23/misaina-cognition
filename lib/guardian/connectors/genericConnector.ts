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

/**
 * Extrait un tableau d'enregistrements à partir d'un chemin pointé (ex: "results", "data.items", "value").
 */
function resolveRecordsPath(payload: unknown, path?: string): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload as Record<string, unknown>[];
  }
  if (!payload || typeof payload !== "object") return [];

  if (!path) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[];
    if (Array.isArray(obj.value)) return obj.value as Record<string, unknown>[];
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    return [obj];
  }

  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (current && typeof current === "object" && segment in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return [];
    }
  }
  return Array.isArray(current) ? (current as Record<string, unknown>[]) : [];
}

/**
 * Connecteur générique configurable pour KoboToolbox, ODK Central et flux JSON arbitraires.
 */
export class GenericConnector implements SourceConnector {
  readonly type = "generic" as const;

  async ingest(
    input: ConnectorInput,
    ctx: TenantSpaceContext
  ): Promise<ConnectorIngestResult> {
    const { source } = input;
    const format = source.format || "json";

    let items: Record<string, unknown>[] = [];
    if (input.rawItems && input.rawItems.length > 0) {
      items = input.rawItems;
    } else if (source.endpointUrl) {
      items = await this.fetchRemoteJson(source);
    } else {
      throw new Error(
        "GenericConnector requiert soit un endpointUrl configuré, soit rawItems dans le corps de la requête."
      );
    }

    // Paramètres par défaut selon le standard Kobo / ODK
    const externalIdField =
      source.externalIdField ??
      (format === "kobo" ? "_id" : format === "odk" ? "__id" : "id");
    const geoField =
      source.geoField ??
      (format === "kobo" ? "_geolocation" : format === "odk" ? "location" : undefined);

    const columnMapping = input.columnMapping ?? source.columnMapping ?? {};
    const rawRecords: RawRecord[] = [];
    const normalizedRecords: NormalizedRecord[] = [];
    let skippedIdempotentCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { raw, normalized } = buildNormalizedPair({
        ctx,
        sourceId: source.id,
        sourceType: "generic",
        rawPayload: item,
        rawFormat: format,
        columnMapping,
        externalIdField,
        geoField,
        rowIndex: i,
      });

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

      const frozenRaw = guardianRepo.insertIngestedPair(ctx, raw, normalized);
      rawRecords.push(frozenRaw);
      normalizedRecords.push(normalized);
    }

    guardianRepo.updateSourceStats(ctx, source.id, {
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

  private async fetchRemoteJson(
    source: ConnectorInput["source"]
  ): Promise<Record<string, unknown>[]> {
    if (!source.endpointUrl) return [];

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // Lecture sécurisée du jeton depuis process.env uniquement (jamais en dur)
    if (source.authTokenEnvName) {
      const token = process.env[source.authTokenEnvName];
      if (!token) {
        throw new Error(
          `Variable d'environnement ${source.authTokenEnvName} manquante pour la source ${source.name}.`
        );
      }
      headers.Authorization =
        source.format === "kobo" ? `Token ${token}` : `Bearer ${token}`;
    }

    const res = await fetch(source.endpointUrl, { headers });
    if (!res.ok) {
      throw new Error(`Erreur API ${source.format || "JSON"} (${res.status}) : ${res.statusText}`);
    }

    const data = await res.json();
    const defaultPath =
      source.format === "kobo" ? "results" : source.format === "odk" ? "value" : undefined;

    return resolveRecordsPath(data, source.recordsPath ?? defaultPath);
  }
}
