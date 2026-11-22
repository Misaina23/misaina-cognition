import jschardet from "jschardet";
import Papa from "papaparse";
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

/**
 * Connecteur CSV : détection automatique de l'encodage (jschardet + repli UTF-8/windows-1252)
 * et du séparateur (papaparse), conservation du brut immuable et ingestion idempotente.
 */
export class CsvConnector implements SourceConnector {
  readonly type = "csv" as const;

  async ingest(input: ConnectorInput, ctx: TenantSpaceContext): Promise<ConnectorIngestResult> {
    const { source } = input;
    const columnMapping = input.columnMapping ?? source.columnMapping ?? {};

    let rows: Record<string, unknown>[] = [];
    let detectedEncoding: string | undefined;
    let detectedDelimiter: string | undefined;

    if (input.rawItems && input.rawItems.length > 0) {
      rows = input.rawItems;
    } else if (input.fileBuffer) {
      const buf = Buffer.isBuffer(input.fileBuffer)
        ? input.fileBuffer
        : Buffer.from(input.fileBuffer);
      const parsed = this.parseCsv(buf);
      rows = parsed.rows;
      detectedEncoding = parsed.encoding;
      detectedDelimiter = parsed.delimiter;
    } else {
      throw new Error("CsvConnector requiert un fileBuffer ou rawItems.");
    }

    const rawRecords: RawRecord[] = [];
    const normalizedRecords: NormalizedRecord[] = [];
    let skippedIdempotentCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || Object.values(row).every((v) => v === "" || v === null || v === undefined)) {
        continue;
      }

      const { raw, normalized } = buildNormalizedPair({
        ctx,
        sourceId: source.id,
        sourceType: "csv",
        rawPayload: row,
        rawFormat: "csv",
        columnMapping,
        externalIdField: source.externalIdField,
        geoField: source.geoField,
        detectedEncoding,
        detectedDelimiter,
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
      sourceType: "csv",
      totalRead: rows.length,
      insertedCount: normalizedRecords.length,
      skippedIdempotentCount,
      detectedEncoding,
      detectedDelimiter,
      rawRecords,
      normalizedRecords,
    };
  }

  private parseCsv(buffer: Buffer): {
    rows: Record<string, unknown>[];
    encoding: string;
    delimiter: string;
  } {
    const hasUtf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
    const detected = jschardet.detect(buffer.subarray(0, Math.min(buffer.length, 65536)));
    let encoding = (detected?.encoding || "utf-8").toLowerCase();

    let text: string;
    if (hasUtf8Bom) {
      text = buffer.subarray(3).toString("utf8");
      encoding = "utf-8";
    } else if (encoding.includes("utf-8") || encoding === "ascii") {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        encoding = "windows-1252";
        text = new TextDecoder("windows-1252").decode(buffer);
      }
    } else if (encoding.includes("1252") || encoding.includes("iso-8859") || encoding.includes("latin")) {
      text = new TextDecoder("windows-1252").decode(buffer);
    } else {
      text = buffer.toString("utf8");
    }

    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: (h) => h.trim(),
    });

    return {
      rows: parsed.data || [],
      encoding,
      delimiter: parsed.meta?.delimiter || ",",
    };
  }
}
