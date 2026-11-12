import type { Trade, TradeCalculationSource } from '@/lib/types/trade'
import { parseTradingNumber, formatRMultiple } from '@/lib/utils/calculations'

export function formatTradeRValue(value: number | null, source: TradeCalculationSource): string {
  if (source === 'missing') return 'R offen'
  const label = formatRMultiple(value)
  return source === 'planned' ? `${label} (geplant)` : source === 'realized_partial' ? `${label} (teilrealisiert)` : label
}

/** A missing source overrides stale numeric/display fallbacks, including zero. */
export function getTradeRValue(trade: Trade): number | null {
  if (trade.rSource === 'missing') return null
  if (trade.rValue !== undefined) {
    return trade.rValue !== null && Number.isFinite(trade.rValue) ? trade.rValue : null
  }
  if (trade.rMultiple !== undefined) {
    return trade.rMultiple !== null && Number.isFinite(trade.rMultiple) ? trade.rMultiple : null
  }
  // Legacy text-only view models: accept numeric R labels, never empty/garbage text.
  const text = trade.r?.trim()
  if (!text || !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*R?$/i.test(text)) return null
  return parseTradingNumber(text)
}

export function getDocumentedTradeRValue(trade: Trade): number | null {
  // Legacy display numbers without source metadata are not confirmed results.
  if (trade.rSource !== 'manual' && trade.rSource !== 'realized') return null
  if (trade.captureResult === 'open' || trade.captureStatus === 'incomplete' || trade.partialExitHasOpenRemainder) return null
  return getTradeRValue(trade)
}

export function summarizeTradeR(trades: readonly Trade[]) {
  const values = trades.map(getDocumentedTradeRValue).filter((value): value is number => value !== null)
  return {
    averageR: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    rCount: values.length,
    eligibleCount: trades.length,
  }
}
