import type { Trade, TradeCalculationSource } from '@/lib/types/trade'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { parseTradingNumber } from '@/lib/utils/calculations'
import type { MonetaryScopeKind } from '@/lib/utils/currency'
import { getAnalyticsEvidenceState } from '@/lib/utils/statistics-scope'
import { getTrustedTrades } from '@/lib/utils/trade-trust'

export const DASHBOARD_TRADE_WINDOW_LIMIT = 60

export type DashboardAvailability = 'ready' | 'unavailable' | 'unauthenticated'
export type DashboardDataState = 'demo' | 'live' | 'empty' | 'unavailable' | 'unauthenticated'

export function resolveDashboardDataState({
  source,
  availability,
  tradeCount,
}: {
  source: 'supabase' | 'mock'
  availability: DashboardAvailability
  tradeCount: number
}): DashboardDataState {
  if (availability === 'unavailable') return 'unavailable'
  if (availability === 'unauthenticated') return 'unauthenticated'
  if (source === 'mock') return 'demo'
  return tradeCount > 0 ? 'live' : 'empty'
}

export function getDashboardMoneyLockReason({
  scopeKind,
  trustedTradeCount,
}: {
  scopeKind: MonetaryScopeKind
  trustedTradeCount: number
}) {
  if (trustedTradeCount === 0) return 'Keine belastbaren Abschlüsse'
  if (scopeKind === 'mixed') return 'Mehrere Währungen ohne Umrechnungskurs'
  if (scopeKind === 'unknown') return 'Mindestens eine Währung fehlt oder wird nicht unterstützt'
  if (scopeKind === 'empty') return 'Keine monetären Abschlüsse'
  return null
}

export type DashboardRObservation = {
  source: TradeCalculationSource
  value: number | null
  documented: boolean
}

export function getDashboardRObservation(trade: Trade): DashboardRObservation {
  const source = trade.rSource ?? 'missing'
  const numericValue = Number.isFinite(trade.rValue)
    ? trade.rValue ?? null
    : parseTradeRText(trade.r)
  const documented = source === 'realized' || source === 'realized_partial' || source === 'manual'

  return {
    source,
    value: source === 'missing' ? null : numericValue,
    documented: documented && numericValue !== null,
  }
}

export function getDocumentedRSummary(trades: readonly Trade[]) {
  const values = trades
    .map(getDashboardRObservation)
    .filter((observation) => observation.documented && observation.value !== null)
    .map((observation) => observation.value as number)

  return {
    averageR: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    documentedCount: values.length,
    eligibleCount: trades.length,
  }
}

export function buildDashboardMetricModel(trades: readonly Trade[]) {
  const trustedTrades = getTrustedTrades([...trades])
  const metrics = getCoreMetrics(trustedTrades)

  return {
    trustedTrades,
    metrics,
    moneyComparable: metrics.monetaryScope.isComparable,
    documentedR: getDocumentedRSummary(trustedTrades),
    evidenceState: getAnalyticsEvidenceState(trades.length, trustedTrades.length),
  }
}

function parseTradeRText(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  return parseTradingNumber(trimmed)
}
