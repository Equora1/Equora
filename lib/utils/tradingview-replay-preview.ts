import { CSV_IMPORT_LIMITS } from "@/lib/utils/trade-import";

export const TRADINGVIEW_REPLAY_TRADE_SHEET = "Handelsgeschäfte";

export function getTradingViewReplayMarket(fileName: string): string | null {
  const match = /^Handel_im_Wiedergabemodus_([A-Z][A-Z0-9_]*?)_([A-Z0-9][A-Z0-9.!-]*)_\d{4}-\d{2}-\d{2}_[a-f0-9]+\.xlsx$/i.exec(fileName);
  return match ? `${match[1].toUpperCase()}:${match[2].toUpperCase()}` : null;
}

type Direction = "long" | "short";
type ReplayRow = readonly unknown[];
type ReplayTrade = {
  number: number;
  direction: Direction;
  openedAt: string;
  closedAt: string;
  entry: number;
  exit: number;
  quantity: number;
  netPnL: number;
  commission: number | null;
};

export type TradingViewReplayPreview =
  | { ok: false; reason: "header" | "limit" }
  | {
      ok: true;
      market: string;
      priceCurrency: string;
      pnlCurrency: string;
      trades: ReplayTrade[];
      unpairedTradeCount: number;
      unassignedRowCount: number;
    };

function excelWallTime(cell: unknown) {
  // The reader exposes the Excel serial as a Date. Keep the workbook's
  // wall-clock text without assigning the replay session a timezone.
  return cell instanceof Date && Number.isFinite(cell.getTime()) ? cell.toISOString().slice(0, 19) : null;
}

function numberCell(cell: unknown) {
  return typeof cell === "number" && Number.isFinite(cell) ? cell : null;
}

function getMoneyColumn(headers: string[], prefix: string) {
  const matches = headers.flatMap((header, index) => {
    const currency = header.startsWith(prefix) ? header.slice(prefix.length) : "";
    return /^[A-Z]{3}$/.test(currency) ? [{ index, currency }] : [];
  });
  return matches.length === 1 ? matches[0] : null;
}

export function buildTradingViewReplayPreview(market: string, data: readonly ReplayRow[]): TradingViewReplayPreview {
  if (
    data.length - 1 > CSV_IMPORT_LIMITS.maxRows ||
    data.some((row) => row.length > CSV_IMPORT_LIMITS.maxColumns || row.some(
      (cell) => typeof cell === "string" && cell.length > CSV_IMPORT_LIMITS.maxCellCharacters,
    ))
  ) return { ok: false, reason: "limit" };

  const [header = [], ...rows] = data;
  const columns = header.map((cell) => typeof cell === "string" ? cell.trim().replace(/\s+/g, " ") : "");
  const required = ["Trade-Nummer", "Typ", "Datum und Uhrzeit", "Größe (Menge)"];
  const price = getMoneyColumn(columns, "Preis ");
  const pnl = getMoneyColumn(columns, "Netto G&V ");
  const fee = getMoneyColumn(columns, "Provision ");
  if (required.some((name) => columns.filter((value) => value === name).length !== 1) || !price || !pnl || !fee || fee.currency !== pnl.currency) {
    return { ok: false, reason: "header" };
  }

  const [numberIndex, typeIndex, timeIndex, quantityIndex] = required.map((name) => columns.indexOf(name));
  const types = new Map<string, { direction: Direction; kind: "entry" | "exit" }>([
    ["Long-Einstieg", { direction: "long", kind: "entry" }],
    ["Long-Ausstieg", { direction: "long", kind: "exit" }],
    ["Short-Einstieg", { direction: "short", kind: "entry" }],
    ["Short-Ausstieg", { direction: "short", kind: "exit" }],
  ]);
  const groups = new Map<number, ReplayRow[]>();
  let unassignedRowCount = 0;
  for (const row of rows) {
    if (row.every((cell) => cell === null || cell === "")) continue;
    const tradeNumber = numberCell(row[numberIndex]);
    if (tradeNumber === null || !Number.isSafeInteger(tradeNumber) || tradeNumber < 1) {
      unassignedRowCount++;
      continue;
    }
    const group = groups.get(tradeNumber) ?? [];
    group.push(row);
    groups.set(tradeNumber, group);
  }

  const trades: ReplayTrade[] = [];
  for (const [number, group] of groups) {
    if (group.length !== 2) continue;
    const typeFor = (row: ReplayRow) => {
      const cell = row[typeIndex];
      return typeof cell === "string" ? types.get(cell.trim()) : undefined;
    };
    const entryRow = group.find((row) => typeFor(row)?.kind === "entry");
    const exitRow = group.find((row) => typeFor(row)?.kind === "exit");
    const direction = entryRow && typeFor(entryRow)?.direction;
    if (!entryRow || !exitRow || !direction || direction !== typeFor(exitRow)?.direction) continue;

    const openedAt = excelWallTime(entryRow[timeIndex]);
    const closedAt = excelWallTime(exitRow[timeIndex]);
    const entry = numberCell(entryRow[price.index]);
    const exit = numberCell(exitRow[price.index]);
    const quantity = numberCell(exitRow[quantityIndex]);
    const netPnL = numberCell(exitRow[pnl.index]);
    if (!openedAt || !closedAt || closedAt < openedAt || entry === null || exit === null || netPnL === null ||
        quantity === null || quantity <= 0 || numberCell(entryRow[quantityIndex]) !== quantity) continue;

    trades.push({
      number, direction, openedAt, closedAt, entry, exit, quantity, netPnL,
      commission: numberCell(exitRow[fee.index]),
    });
  }

  return {
    ok: true,
    market,
    priceCurrency: price.currency,
    pnlCurrency: pnl.currency,
    trades,
    unpairedTradeCount: groups.size - trades.length,
    unassignedRowCount,
  };
}
