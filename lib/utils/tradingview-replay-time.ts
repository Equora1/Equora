import { resolveTradeTimeInputToIso } from "@/lib/utils/trade-time";
import type { TradingViewReplayPreview } from "@/lib/utils/tradingview-replay-preview";

type ReplayTrade = Extract<TradingViewReplayPreview, { ok: true }>["trades"][number];
type ReplayUtcTimes = { openedAt: string; closedAt: string };

type ReplayTimeResult =
  | { ok: true; offset: string; times: ReplayUtcTimes[] }
  | { ok: false; reason: "missing-offset" | "invalid-offset" }
  | { ok: false; reason: "invalid-trade-time"; tradeNumber: number };

function isUtcOffset(value: string) {
  const match = /^[+-](\d{2}):(\d{2})$/.exec(value);
  if (!match || value === "-00:00") return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return minutes < 60 && hours * 60 + minutes <= 14 * 60;
}

function readExportTime(wallTime: string, offset: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wallTime)) return null;
  try {
    const utc = resolveTradeTimeInputToIso(`${wallTime}${offset}`, "");
    return utc.length === 24 && !utc.startsWith("0000-") ? utc : null;
  } catch {
    return null;
  }
}

export function resolveTradingViewReplayExportTimes(
  trades: readonly Pick<ReplayTrade, "number" | "openedAt" | "closedAt">[],
  exportOffset: string,
): ReplayTimeResult {
  const offset = exportOffset.trim().replace(/^−/, "-");
  if (!offset) return { ok: false, reason: "missing-offset" };
  if (!isUtcOffset(offset)) return { ok: false, reason: "invalid-offset" };

  const times: ReplayUtcTimes[] = [];
  for (const trade of trades) {
    const openedAt = readExportTime(trade.openedAt, offset);
    const closedAt = readExportTime(trade.closedAt, offset);
    if (!openedAt || !closedAt || Date.parse(closedAt) < Date.parse(openedAt)) {
      return { ok: false, reason: "invalid-trade-time", tradeNumber: trade.number };
    }
    times.push({ openedAt, closedAt });
  }
  return { ok: true, offset, times };
}
