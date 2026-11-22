import ExcelJS from "exceljs";
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
 * Connecteur Excel (.xlsx) basé sur ExcelJS.
 */
export class ExcelConnector implements SourceConnector {
  readonly type = "excel" as const;

  async ingest(input: ConnectorInput, ctx: TenantSpaceContext): Promise<ConnectorIngestResult> {
    const { source } = input;
    if (!input.fileBuffer) {
      throw new Error("ExcelConnector requiert un fileBuffer (.xlsx).");
    }

    const buf = Buffer.isBuffer(input.fileBuffer)
      ? input.fileBuffer
      : Buffer.from(input.fileBuffer);
    const rows = await this.parseExcel(buf);
    const columnMapping = input.columnMapping ?? source.columnMapping ?? {};

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
        sourceType: "excel",
        rawPayload: row,
        rawFormat: "xlsx",
        columnMapping,
        externalIdField: source.externalIdField,
        geoField: source.geoField,
        detectedEncoding: "xlsx-binary",
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
      sourceType: "excel",
      totalRead: rows.length,
      insertedCount: normalizedRecords.length,
      skippedIdempotentCount,
      detectedEncoding: "xlsx-binary",
      rawRecords,
      normalizedRecords,
    };
  }

  private async parseExcel(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];

    const headers: string[] = [];
    const rows: Record<string, unknown>[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value ?? `col_${colNumber}`).trim();
        });
        return;
      }
      const obj: Record<string, unknown> = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const key = headers[colNumber] || `col_${colNumber}`;
        const rawVal = cell.value;
        const val =
          rawVal && typeof rawVal === "object" && "text" in rawVal
            ? (rawVal as { text: string }).text
            : rawVal instanceof Date
              ? rawVal.toISOString()
              : rawVal;
        if (val !== null && val !== undefined && String(val).trim() !== "") {
          hasValue = true;
        }
        obj[key] = val;
      });
      if (hasValue) rows.push(obj);
    });

    return rows;
  }
}
