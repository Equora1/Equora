import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade, TradeCalculationSource } from '@/lib/types/trade'
import { parseTradingNumber, formatRMultiple } from '@/lib/utils/calculations'

export function formatTradeRValue(value: number | null, source: TradeCalculationSource, locale: JournalLocale = 'de'): string {
  const text = journalText(locale)
  if (source === 'missing') return text('R offen', 'R unavailable')
  const label = formatRMultiple(value, 2, locale)
  return source === 'planned' ? text(`${label} (geplant)`, `${label} (planned)`) : source === 'realized_partial' ? text(`${label} (teilrealisiert)`, `${label} (partially realised)`) : label
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
