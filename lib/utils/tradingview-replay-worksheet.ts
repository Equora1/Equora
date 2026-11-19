import { CSV_IMPORT_LIMITS } from "@/lib/utils/trade-import";

type ReplayCell = string | number | boolean | Date | null;
const MAX_WORKSHEET_BYTES = 350_000;
// Reserve room for the Server Action envelope under Next.js's 1 MiB limit.
const MAX_SAVE_VALUES_BYTES = 800_000;
const encoder = new TextEncoder();

export function replaySaveFitsRequest(
  worksheetPayload: string,
  riskDrafts: readonly { tradeNumber: number; stopLoss: string; takeProfit: string }[],
) {
  if (worksheetPayload.length > MAX_WORKSHEET_BYTES) return false;
  const checkedDrafts = riskDrafts.map(({ tradeNumber, stopLoss, takeProfit }) => ({ tradeNumber, stopLoss, takeProfit }));
  return encoder.encode(JSON.stringify([worksheetPayload, checkedDrafts])).length <= MAX_SAVE_VALUES_BYTES;
}

export function isReplaySessionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
}

export function encodeReplayWorksheet(rows: readonly (readonly unknown[])[]): string | null {
  const encoded: string[] = [];
  let bytes = 2;
  for (const row of rows) {
    if (row.some((cell) => cell !== null && typeof cell !== "string" && typeof cell !== "boolean"
      && !(typeof cell === "number" && Number.isFinite(cell))
      && !(cell instanceof Date && Number.isFinite(cell.getTime())))) return null;
    const item = JSON.stringify(row);
    bytes += encoder.encode(item).length + 1;
    if (bytes > MAX_WORKSHEET_BYTES) return null;
    encoded.push(item);
  }
  return `[${encoded.join(",")}]`;
}

export function decodeReplayWorksheet(value: unknown): ReplayCell[][] | null {
  if (typeof value !== "string" || value.length > MAX_WORKSHEET_BYTES || encoder.encode(value).length > MAX_WORKSHEET_BYTES) return null;
  let rows: unknown;
  try {
    rows = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows.length > CSV_IMPORT_LIMITS.maxRows + 1) return null;
  const timeColumn = rows[0].findIndex((cell: unknown) => typeof cell === "string"
    && cell.trim().replace(/\s+/g, " ") === "Datum und Uhrzeit");
  if (timeColumn < 0) return null;

  const decoded: ReplayCell[][] = [];
  for (const [rowIndex, rawRow] of rows.entries()) {
    if (!Array.isArray(rawRow) || rawRow.length > CSV_IMPORT_LIMITS.maxColumns) return null;
    const row: ReplayCell[] = [];
    for (const [index, cell] of rawRow.entries()) {
      if (rowIndex > 0 && index === timeColumn && typeof cell === "string" && cell !== "") {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cell)) return null;
        const parsed = new Date(cell);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== cell) return null;
        row.push(parsed);
      } else {
        if (cell !== null && typeof cell !== "boolean"
          && !(typeof cell === "string" && cell.length <= CSV_IMPORT_LIMITS.maxCellCharacters)
          && !(typeof cell === "number" && Number.isFinite(cell))) return null;
        row.push(cell);
      }
    }
    decoded.push(row);
  }
  return decoded;
}
