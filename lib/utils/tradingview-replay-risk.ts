import { derivePlannedRMultiple } from "@/lib/utils/calculations";
import type { TradingViewReplayPreview } from "@/lib/utils/tradingview-replay-preview";

type ReplayTrade = Extract<TradingViewReplayPreview, { ok: true }>["trades"][number];
export type ReplayRiskDraft = { stopLoss: string; takeProfit: string };
type PriceIssue = "format" | "side" | null;

export function readReplayPrice(input: string): number | null {
  const value = input.trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) return null;
  const price = Number(value.replace(",", "."));
  return Number.isFinite(price) ? price : null;
}

export function deriveReplayRisk(
  { entry, exit, direction }: Pick<ReplayTrade, "entry" | "exit" | "direction">,
  { stopLoss, takeProfit }: ReplayRiskDraft,
) {
  const stop = readReplayPrice(stopLoss);
  const target = readReplayPrice(takeProfit);
  const directionSign = direction === "long" ? 1 : -1;
  const risk = stop === null ? null : (entry - stop) * directionSign;
  const reward = target === null ? null : (target - entry) * directionSign;
  const stopIssue: PriceIssue = !stopLoss.trim() ? null
    : risk === null || !Number.isFinite(risk) ? "format" : risk <= 0 ? "side" : null;
  const targetIssue: PriceIssue = !takeProfit.trim() ? null
    : reward === null || !Number.isFinite(reward) ? "format" : reward <= 0 ? "side" : null;
  const hasRisk = risk !== null && Number.isFinite(risk) && risk > 0;
  const priceMove = direction === "long" ? exit - entry : entry - exit;
  const priceR = hasRisk ? priceMove / risk : null;

  return {
    stopIssue,
    targetIssue,
    priceR: priceR === 0 ? 0 : Number.isFinite(priceR) ? priceR : null,
    plannedR: hasRisk && !targetIssue
      ? derivePlannedRMultiple({ entry, stopLoss: stop, takeProfit: target, bias: direction })
      : null,
  };
}
