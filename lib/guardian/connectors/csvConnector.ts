import ExcelJS from "exceljs";
import jschardet from "jschardet";
import Papa from "papaparse";
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
 * Normalise le nom d'encodage détecté par jschardet pour TextDecoder (Node.js).
 */
function normalizeDecoderEncoding(detected?: string | null): string {
  if (!detected) return "utf-8";
  const upper = detected.toUpperCase();
  if (upper === "ASCII" || upper === "UTF-8") return "utf-8";
  if (upper === "ISO-8859-1" || upper === "ISO-8859-15" || upper === "WINDOWS-1252") {
    return "windows-1252";
  }
  if (upper.startsWith("UTF-16LE")) return "utf-16le";
  if (upper.startsWith("UTF-16BE")) return "utf-16be";
  try {
    new TextDecoder(detected.toLowerCase());
    return detected.toLowerCase();
  } catch {
    return "utf-8";
  }
}

/**
 * Vérifie si le buffer correspond à un fichier Excel (.xlsx = archive ZIP commençant par PK).
 */
function isExcelBuffer(buffer: Buffer, fileName?: string): boolean {
  if (fileName && /\.(xlsx|xlsm)$/i.test(fileName)) return true;
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * Extrait les valeurs scalaires propres depuis une cellule ExcelJS.
 */
function extractExcelCellValue(cellValue: ExcelJS.CellValue): unknown {
  if (cellValue === null || cellValue === undefined) return "";
  if (cellValue instanceof Date) return cellValue.toISOString();
  if (typeof cellValue === "object") {
    if ("result" in cellValue && cellValue.result !== undefined) {
      return cellValue.result;
    }
    if ("richText" in cellValue && Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((part) => part.text).join("");
    }
    if ("text" in cellValue) {
      return cellValue.text;
    }
  }
  return cellValue;
}

/**
 * Connecteur d'ingestion CSV et Excel (.xlsx) :
 * - Détecte automatiquement l'encodage (jschardet) et le séparateur (papaparse) pour les CSV.
 * - Parse les classeurs Excel via exceljs (sans faille connue).
 * - Conserve chaque ligne brute intacte et normalise selon le mapping configurable.
 */
export class CsvConnector implements SourceConnector {
  readonly type = "csv" as const;

  async ingest(
    input: ConnectorInput,
    ctx: TenantSpaceContext
  ): Promise<ConnectorIngestResult> {
    const columnMapping = input.columnMapping ?? input.source.columnMapping ?? {};
    let rows: Record<string, unknown>[] = [];
    let detectedEncoding: string | undefined;
    let detectedDelimiter: string | undefined;
    let rawFormat = "csv";

    if (input.rawItems && input.rawItems.length > 0) {
      rows = input.rawItems;
      rawFormat = "json-rows";
    } else if (input.fileBuffer) {
      const buffer = Buffer.isBuffer(input.fileBuffer)
        ? input.fileBuffer
        : Buffer.from(input.fileBuffer);

      if (isExcelBuffer(buffer, input.fileName)) {
        rawFormat = "xlsx";
        rows = await this.parseExcel(buffer);
      } else {
        const parsedCsv = this.parseCsv(buffer);
        rows = parsedCsv.rows;
        detectedEncoding = parsedCsv.encoding;
        detectedDelimiter = parsedCsv.delimiter;
      }
    } else {
      throw new Error("CsvConnector requiert un fileBuffer (CSV/XLSX) ou rawItems.");
    }

    const rawRecords: RawRecord[] = [];
    const normalizedRecords: NormalizedRecord[] = [];
    let skippedIdempotentCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { raw, normalized } = buildNormalizedPair({
        ctx,
        sourceId: input.source.id,
        sourceType: rawFormat === "xlsx" ? "excel" : "csv",
        rawPayload: row,
        rawFormat,
        columnMapping,
        externalIdField: input.source.externalIdField,
        geoField: input.source.geoField,
        detectedEncoding,
        detectedDelimiter,
        rowIndex: i,
      });

      const dup = guardianRepo.findDuplicateIngestion(
        ctx,
        input.source.id,
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

    guardianRepo.updateSourceStats(ctx, input.source.id, {
      lastSyncAt: new Date().toISOString(),
      status: "ACTIVE",
    });

    return {
      sourceId: input.source.id,
      sourceType: rawFormat === "xlsx" ? "excel" : "csv",
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
    const detection = jschardet.detect(buffer);
    let encoding = normalizeDecoderEncoding(detection.encoding);
    let text: string;

    if (encoding === "utf-8") {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        // Séquences d'octets non-UTF-8 (ex: fichier court ISO-8859-1 / Windows-1252)
        encoding = "windows-1252";
        text = new TextDecoder("windows-1252").decode(buffer);
      }
    } else {
      text = new TextDecoder(encoding).decode(buffer);
    }

    // Supprime un éventuel BOM UTF-8
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: (h) => h.trim(),
    });

    const rows = (result.data || []).filter((r) =>
      Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== "")
    );

    return {
      rows,
      encoding,
      delimiter: result.meta?.delimiter || ",",
    };
  }

  private async parseExcel(buffer: Buffer): Promise<Record<string, unknown>[]> {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS attend un ArrayBuffer ou Buffer Node compatible
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets.find((ws) => ws.rowCount > 0);
    if (!worksheet) return [];

    const headers: string[] = [];
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = String(extractExcelCellValue(cell.value) ?? "").trim();
      headers[colNumber] = val || `col_${colNumber}`;
    });

    const rows: Record<string, unknown>[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, unknown> = {};
      let hasValue = false;

      for (let col = 1; col < headers.length; col++) {
        const key = headers[col];
        if (!key) continue;
        const val = extractExcelCellValue(row.getCell(col).value);
        if (val !== "" && val !== null && val !== undefined) {
          hasValue = true;
        }
        record[key] = val;
      }

      if (hasValue) {
        rows.push(record);
      }
    });

    return rows;
  }
}
