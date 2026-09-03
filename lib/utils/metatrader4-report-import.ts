import { parseTradingNumber } from "@/lib/utils/calculations";
import {
  CSV_IMPORT_LIMITS,
  type ParsedCsvData,
} from "@/lib/utils/trade-import";

export type MetaTrader4ReportSummary = Readonly<{
  sourceRowCount: number;
  closedTradeCount: number;
  excludedRowCount: number;
  derivedNetPnlCount: number;
  incompleteNetPnlCount: number;
}>;

export type ParsedMetaTrader4Report = ParsedCsvData &
  Readonly<{
    summary: MetaTrader4ReportSummary;
  }>;

const OUTPUT_HEADERS = Object.freeze([
  "Ticket",
  "Open Time",
  "Type",
  "Size",
  "Item",
  "Open Price",
  "Stop Loss",
  "Take Profit",
  "Close Time",
  "Close Price",
  "Commission",
  "Taxes",
  "Swap",
  "Profit",
  "Net P&L",
  "Import Notes",
]);

const REJECTED_CLOSE_TIMES = new Set(["", "-", "n/a", "na", "0"]);

type HeaderIndexes = Readonly<{
  ticket: number;
  openTime: number;
  type: number;
  size: number;
  item: number;
  openPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  closeTime: number;
  closePrice: number;
  commission: number;
  taxes: number;
  swap: number;
  profit: number;
}>;

function decodeHtmlEntities(value: string) {
  const namedEntities: Readonly<Record<string, string>> = Object.freeze({
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  });

  return value.replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (entity, token: string) => {
      const normalized = token.toLowerCase();
      if (!normalized.startsWith("#")) {
        return namedEntities[normalized] ?? entity;
      }

      const hexadecimal = normalized.startsWith("#x");
      const numeric = Number.parseInt(
        normalized.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );
      if (
        !Number.isInteger(numeric) ||
        numeric < 0 ||
        numeric > 0x10ffff ||
        (numeric >= 0xd800 && numeric <= 0xdfff)
      ) {
        return entity;
      }
      return String.fromCodePoint(numeric);
    },
  );
}

function htmlCellToText(value: string) {
  const text = decodeHtmlEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[\u00a0\s]+/g, " ")
    .trim();

  if (text.length > CSV_IMPORT_LIMITS.maxCellCharacters) {
    throw new Error(
      "MT4-Bericht enthält eine überlange Zelle und wurde nicht verarbeitet.",
    );
  }
  return text;
}

function extractHtmlTables(html: string) {
  const tables: string[][][] = [];
  const tablePattern = /<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi;
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi;
  let totalRowCount = 0;

  for (const tableMatch of html.matchAll(tablePattern)) {
    const rows: string[][] = [];
    for (const rowMatch of tableMatch[1].matchAll(rowPattern)) {
      const cells = Array.from(rowMatch[1].matchAll(cellPattern), (match) =>
        htmlCellToText(match[1]),
      );
      if (!cells.length) continue;
      if (cells.length > CSV_IMPORT_LIMITS.maxColumns) {
        throw new Error(
          "MT4-Bericht enthält zu viele Spalten und wurde nicht verarbeitet.",
        );
      }
      rows.push(cells);
      totalRowCount += 1;
      if (totalRowCount > CSV_IMPORT_LIMITS.maxRows + 100) {
        throw new Error(
          `MT4-Bericht überschreitet das sichere Limit von ${CSV_IMPORT_LIMITS.maxRows} Trades.`,
        );
      }
    }
    if (rows.length) tables.push(rows);
  }

  return tables;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "/")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findHeaderIndex(headers: readonly string[], aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const index = headers.findIndex((header) =>
    normalizedAliases.has(normalizeHeader(header)),
  );
  return index >= 0 ? index : null;
}

function getHeaderIndexes(headers: readonly string[]): HeaderIndexes | null {
  const ticket = findHeaderIndex(headers, ["Ticket"]);
  const openTime = findHeaderIndex(headers, ["Open Time"]);
  const type = findHeaderIndex(headers, ["Type"]);
  const size = findHeaderIndex(headers, ["Size", "Lots"]);
  const item = findHeaderIndex(headers, ["Item", "Symbol"]);
  const closeTime = findHeaderIndex(headers, ["Close Time"]);
  const commission = findHeaderIndex(headers, ["Commission"]);
  const taxes = findHeaderIndex(headers, ["Taxes"]);
  const swap = findHeaderIndex(headers, ["Swap"]);
  const profit = findHeaderIndex(headers, ["Profit"]);
  const stopLoss = findHeaderIndex(headers, ["S/L", "Stop Loss"]);
  const takeProfit = findHeaderIndex(headers, ["T/P", "Take Profit"]);
  const priceIndexes = headers.flatMap((header, index) =>
    normalizeHeader(header) === "price" ? [index] : [],
  );
  const openPriceIndexes = priceIndexes.filter(
    (index) => closeTime !== null && index < closeTime,
  );
  const closePriceIndexes = priceIndexes.filter(
    (index) => closeTime !== null && index > closeTime,
  );
  const openPrice = openPriceIndexes[0];
  const closePrice = closePriceIndexes[0];

  const nonPriceRequired = [
    ticket,
    openTime,
    type,
    size,
    item,
    closeTime,
    commission,
    taxes,
    swap,
    profit,
  ];
  if (nonPriceRequired.some((index) => index === null)) return null;
  if (openPriceIndexes.length !== 1 || closePriceIndexes.length !== 1) {
    throw new Error(
      "Die MT4-Kontohistorie muss genau eine Price-Spalte vor und genau eine Price-Spalte nach Close Time enthalten.",
    );
  }

  return Object.freeze({
    ticket: ticket as number,
    openTime: openTime as number,
    type: type as number,
    size: size as number,
    item: item as number,
    openPrice: openPrice as number,
    stopLoss,
    takeProfit,
    closeTime: closeTime as number,
    closePrice: closePrice as number,
    commission: commission as number,
    taxes: taxes as number,
    swap: swap as number,
    profit: profit as number,
  });
}

function getCell(cells: readonly string[], index: number | null) {
  return index === null ? "" : cells[index]?.trim() ?? "";
}

function formatTradingNumber(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function normalizeMetaTrader4Timestamp(value: string) {
  const match = value.match(
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return value;
  const pad = (part: string) => part.padStart(2, "0");
  return `${match[1]}-${pad(match[2])}-${pad(match[3])} ${pad(match[4])}:${match[5]}:${match[6] ?? "00"}`;
}

export function parseMetaTrader4ReportHtml(
  html: string,
): ParsedMetaTrader4Report {
  if (html.length > CSV_IMPORT_LIMITS.maxTextCharacters) {
    throw new Error("MT4-Bericht ist zu groß. Erlaubt sind höchstens 5 MB Text.");
  }
  if (/\bMetaTrader\s*5\b/i.test(html)) {
    throw new Error(
      "Dieser Bericht weist auf MetaTrader 5 hin. MT5-Orders, Deals und Positionen dürfen nicht als MT4-Historie interpretiert werden.",
    );
  }
  if (!/<table\b/i.test(html) || !/<tr\b/i.test(html)) {
    throw new Error(
      "Kein lesbarer MetaTrader-4-HTML-Bericht gefunden. Bitte in MT4 unter Kontohistorie als Bericht speichern.",
    );
  }
  const firstTableIndex = html.search(/<table\b/i);
  const reportPreamble = html.slice(0, firstTableIndex);
  const hasExplicitMetaTrader4Marker =
    /\b(?:MetaTrader\s*4|MT4)\b/i.test(reportPreamble);
  const hasLegacyMetaTrader4Markers =
    /\bClosed\s+Transactions\b/i.test(html) &&
    /<title\b[^>]*>[^<]*\bStatement\s*:/i.test(html);
  if (!hasExplicitMetaTrader4Marker && !hasLegacyMetaTrader4Markers) {
    throw new Error(
      "Der Bericht weist sich nicht eindeutig als MetaTrader-4-Export aus. Akzeptiert werden ein expliziter MT4-Hinweis oder die Standardkombination aus Statement-Titel und Closed Transactions.",
    );
  }

  const tables = extractHtmlTables(html);
  let historyTable: string[][] | null = null;
  let headerRowIndex = -1;
  for (const tableRows of tables) {
    const candidateIndex = tableRows.findIndex(
      (cells) => getHeaderIndexes(cells) !== null,
    );
    if (candidateIndex >= 0) {
      historyTable = tableRows;
      headerRowIndex = candidateIndex;
      break;
    }
  }
  if (!historyTable || headerRowIndex < 0) {
    throw new Error(
      "Die erwartete MT4-Kontohistorie mit Ticket, Open/Close Time, zwei Price-Spalten sowie Commission, Taxes, Swap und Profit fehlt.",
    );
  }

  const indexes = getHeaderIndexes(historyTable[headerRowIndex]);
  if (!indexes) {
    throw new Error("Die MT4-Berichtsspalten konnten nicht eindeutig gebunden werden.");
  }

  const maximumRequiredIndex = Math.max(
    indexes.ticket,
    indexes.openTime,
    indexes.type,
    indexes.size,
    indexes.item,
    indexes.openPrice,
    indexes.closeTime,
    indexes.closePrice,
    indexes.commission,
    indexes.taxes,
    indexes.swap,
    indexes.profit,
  );
  const rows: Array<Record<string, string>> = [];
  let sourceRowCount = 0;
  let derivedNetPnlCount = 0;
  let incompleteNetPnlCount = 0;

  for (const cells of historyTable.slice(headerRowIndex + 1)) {
    sourceRowCount += 1;
    if (cells.length <= maximumRequiredIndex) {
      const isPlausibleTradeRow =
        cells.some((cell) => /^\d{1,40}$/.test(cell.trim())) &&
        cells.some((cell) => /^(?:buy|sell)$/i.test(cell.trim()));
      if (isPlausibleTradeRow) {
        throw new Error(
          `MT4-Berichtszeile ${sourceRowCount} ist strukturell unvollständig. Der gesamte Bericht wurde gesperrt, damit kein möglicher Trade unbemerkt verloren geht.`,
        );
      }
      continue;
    }

    const tradeType = getCell(cells, indexes.type).toLowerCase();
    const ticket = getCell(cells, indexes.ticket);
    const closeTimeRaw = getCell(cells, indexes.closeTime);
    const item = getCell(cells, indexes.item);
    if (
      (tradeType !== "buy" && tradeType !== "sell") ||
      !/^\d{1,40}$/.test(ticket) ||
      !item ||
      REJECTED_CLOSE_TIMES.has(closeTimeRaw.toLowerCase())
    ) {
      continue;
    }

    const commissionRaw = getCell(cells, indexes.commission);
    const taxesRaw = getCell(cells, indexes.taxes);
    const swapRaw = getCell(cells, indexes.swap);
    const profitRaw = getCell(cells, indexes.profit);
    const components = [commissionRaw, taxesRaw, swapRaw, profitRaw].map(
      parseTradingNumber,
    );
    const hasCompleteResult = components.every(
      (component): component is number => component !== null,
    );
    const netPnL = hasCompleteResult
      ? formatTradingNumber(components.reduce((sum, value) => sum + value, 0))
      : "";
    if (hasCompleteResult) derivedNetPnlCount += 1;
    else incompleteNetPnlCount += 1;

    rows.push({
      Ticket: ticket,
      "Open Time": normalizeMetaTrader4Timestamp(
        getCell(cells, indexes.openTime),
      ),
      Type: tradeType,
      Size: getCell(cells, indexes.size),
      Item: item,
      "Open Price": getCell(cells, indexes.openPrice),
      "Stop Loss": getCell(cells, indexes.stopLoss),
      "Take Profit": getCell(cells, indexes.takeProfit),
      "Close Time": normalizeMetaTrader4Timestamp(closeTimeRaw),
      "Close Price": getCell(cells, indexes.closePrice),
      Commission: commissionRaw,
      Taxes: taxesRaw,
      Swap: swapRaw,
      Profit: profitRaw,
      "Net P&L": netPnL,
      "Import Notes": hasCompleteResult
        ? `MT4-Ergebnis aus Profit ${profitRaw}, Commission ${commissionRaw}, Taxes ${taxesRaw} und Swap ${swapRaw} gebildet.`
        : "MT4-Nettoergebnis nicht abgeleitet: Profit, Commission, Taxes oder Swap fehlen beziehungsweise sind nicht lesbar. Vor dem späteren Import manuell prüfen.",
    });
  }

  if (!rows.length) {
    throw new Error(
      "Der MT4-Bericht enthält keine eindeutig geschlossenen Buy-/Sell-Trades. Offene Trades, Pending Orders und Kontobuchungen werden nicht übernommen.",
    );
  }
  if (rows.length > CSV_IMPORT_LIMITS.maxRows) {
    throw new Error(
      `MT4-Bericht überschreitet das sichere Limit von ${CSV_IMPORT_LIMITS.maxRows} geschlossenen Trades.`,
    );
  }

  return {
    delimiter: "metatrader4-html",
    headers: [...OUTPUT_HEADERS],
    rows,
    summary: Object.freeze({
      sourceRowCount,
      closedTradeCount: rows.length,
      excludedRowCount: Math.max(0, sourceRowCount - rows.length),
      derivedNetPnlCount,
      incompleteNetPnlCount,
    }),
  };
}
