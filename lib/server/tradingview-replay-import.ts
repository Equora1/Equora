import "server-only";
import { createHash } from "node:crypto";
import { normalizeTradeCurrency } from "@/lib/utils/currency";
import {
  buildTradingViewReplayPreview,
  getTradingViewReplayMarket,
} from "@/lib/utils/tradingview-replay-preview";
import { deriveReplayRisk, readReplayPrice, type ReplayRiskDraft } from "@/lib/utils/tradingview-replay-risk";
import { resolveTradingViewReplayExportTimes } from "@/lib/utils/tradingview-replay-time";

type ReviewedRisk = ReplayRiskDraft & { tradeNumber: number };

type ReplayImportInput = {
  sessionId: string;
  fileName: string;
  worksheet: Parameters<typeof buildTradingViewReplayPreview>[1];
  exportOffset: string;
  riskDrafts: readonly ReviewedRisk[];
};

type ReplayImportFailure = {
  ok: false;
  reason: "invalid-session" | "invalid-filename" | "invalid-worksheet" | "incomplete-worksheet"
    | "unsupported-pnl-currency" | "missing-offset" | "invalid-offset" | "invalid-trade-time" | "invalid-risk";
  tradeNumber?: number;
};

function sha256(value: readonly unknown[]) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function prepareTradingViewReplayImport(input: ReplayImportInput) {
  const sessionId = input.sessionId.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sessionId)) {
    return { ok: false, reason: "invalid-session" } satisfies ReplayImportFailure;
  }

  const market = input.fileName.length <= 255 ? getTradingViewReplayMarket(input.fileName) : null;
  if (!market) return { ok: false, reason: "invalid-filename" } satisfies ReplayImportFailure;
  const preview = buildTradingViewReplayPreview(market, input.worksheet);
  if (!preview.ok) return { ok: false, reason: "invalid-worksheet" } satisfies ReplayImportFailure;
  if (!preview.trades.length || preview.unpairedTradeCount || preview.unassignedRowCount) {
    return { ok: false, reason: "incomplete-worksheet" } satisfies ReplayImportFailure;
  }

  const pnlCurrency = normalizeTradeCurrency(preview.pnlCurrency);
  if (!pnlCurrency) return { ok: false, reason: "unsupported-pnl-currency" } satisfies ReplayImportFailure;

  const sourceTrades = preview.trades.sort((a, b) => a.number - b.number);
  const resolved = resolveTradingViewReplayExportTimes(sourceTrades, input.exportOffset);
  if (!resolved.ok) return resolved satisfies ReplayImportFailure;

  const tradeNumbers = new Set(sourceTrades.map((trade) => trade.number));
  if (input.riskDrafts.length > tradeNumbers.size) return { ok: false, reason: "invalid-risk" } satisfies ReplayImportFailure;
  const drafts = new Map<number, ReviewedRisk>();
  for (const draft of input.riskDrafts) {
    if (!draft || !tradeNumbers.has(draft.tradeNumber) || drafts.has(draft.tradeNumber)
      || typeof draft.stopLoss !== "string" || typeof draft.takeProfit !== "string"
      || draft.stopLoss.length > 64 || draft.takeProfit.length > 64) {
      return { ok: false, reason: "invalid-risk" } satisfies ReplayImportFailure;
    }
    drafts.set(draft.tradeNumber, draft);
  }

  const trades = [];
  for (const [index, trade] of sourceTrades.entries()) {
    const draft = drafts.get(trade.number);
    if (draft) {
      const risk = deriveReplayRisk(trade, draft);
      if (risk.stopIssue || risk.targetIssue) {
        return { ok: false, reason: "invalid-risk", tradeNumber: trade.number } satisfies ReplayImportFailure;
      }
    }
    trades.push({
      tradeNumber: trade.number,
      direction: trade.direction,
      openedAtExport: trade.openedAt,
      closedAtExport: trade.closedAt,
      ...resolved.times[index],
      entry: trade.entry,
      exit: trade.exit,
      quantity: trade.quantity,
      netPnL: trade.netPnL,
      commission: trade.commission,
      stopLoss: draft ? readReplayPrice(draft.stopLoss) : null,
      takeProfit: draft ? readReplayPrice(draft.takeProfit) : null,
    });
  }

  const sourceDigest = sha256([
    "tradingview-replay-source-v1", market, preview.priceCurrency, pnlCurrency,
    sourceTrades.map((trade) => [
      trade.number, trade.direction, trade.openedAt, trade.closedAt, trade.entry, trade.exit,
      trade.quantity, trade.netPnL, trade.commission,
    ]),
  ]);
  const submissionDigest = sha256([
    "tradingview-replay-submission-v1", sessionId, sourceDigest, resolved.offset,
    trades.map((trade) => [trade.tradeNumber, trade.stopLoss, trade.takeProfit]),
  ]);

  return {
    ok: true as const,
    batch: {
      source: "tradingview_replay" as const,
      mode: "simulation" as const,
      sessionId,
      market,
      priceCurrency: preview.priceCurrency,
      pnlCurrency,
      exportOffset: resolved.offset,
      sourceDigest,
      submissionDigest,
      trades,
    },
  };
}
