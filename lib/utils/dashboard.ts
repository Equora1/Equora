import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade, TradeCalculationSource } from '@/lib/types/trade'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { getTradeRValue, getDocumentedTradeRValue } from '@/lib/utils/trade-r'
import { resolveTradeMonetaryScope, type MonetaryScopeKind } from '@/lib/utils/currency'
import { getAnalyticsEvidenceState } from '@/lib/utils/statistics-scope'
import { getFinalizedTrades, getTrustedTrades } from '@/lib/utils/trade-trust'
import { getTradeAccountKey, getTradeAccountLabel } from '@/lib/utils/account-context'
import { getCalendarTradeDay } from '@/lib/utils/calendar'
import { shiftJournalDay } from '@/lib/utils/journal-day'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'

const periodDays = { '7': 7, '30': 30, '90': 90 } as const
const dashboardPeriods = ['all', '7', '30', '90'] as const
type DashboardPeriod = typeof dashboardPeriods[number]
export type DashboardSearchParams = Record<string, string | string[] | undefined>

export function scopeDashboardTrades(trades: readonly Trade[], params: DashboardSearchParams, today: string, locale: JournalLocale) {
  const period: DashboardPeriod = dashboardPeriods.find((value) => value === params.period) ?? 'all'
  const firstDay = period === 'all' ? null : shiftJournalDay(today, 1 - periodDays[period])
  const ordered = trades.map((trade) => {
    const day = getCalendarTradeDay(trade)
    const timestamp = Date.parse(resolveTradeOccurredAt(trade))
    const sortTime = Number.isFinite(timestamp) ? timestamp : day ? Date.parse(day) : Number.NEGATIVE_INFINITY
    return { trade, day, sortTime }
  }).sort((left, right) => (right.sortTime - left.sortTime) || left.trade.id.localeCompare(right.trade.id))
  const accountLabels = new Map<string, string>()
  const labelCounts = new Map<string, number>()
  for (const { trade } of ordered) {
    const key = getTradeAccountKey(trade)
    if (accountLabels.has(key)) continue
    const label = getTradeAccountLabel(trade, locale)
    accountLabels.set(key, label)
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1)
  }
  const account = typeof params.account === 'string' ? params.account : ''
  const isKnownAccount = account === '' || accountLabels.has(account)
  const scoped = isKnownAccount ? ordered.filter(({ trade, day }) => {
    if (account && getTradeAccountKey(trade) !== account) return false
    if (!firstDay) return true
    return day !== null && day >= firstDay && day <= today
  }).map(({ trade }) => trade) : []
  return {
    trades: scoped,
    firstDay,
    period,
    account,
    isKnownAccount,
    accounts: [...accountLabels].map(([key, label]) => ({
      key, label: (labelCounts.get(label) ?? 0) > 1 ? `${label} · ${key.slice(-6)}` : label,
    })),
  }
}

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
}, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  if (scopeKind === 'mixed') return text('Mehrere Währungen ohne Umrechnungskurs', 'Multiple currencies without an exchange rate')
  if (scopeKind === 'unknown') return text('Mindestens eine Währung fehlt oder wird nicht unterstützt', 'At least one currency is missing or unsupported')
  if (trustedTradeCount === 0) return text('Keine belastbaren Abschlüsse', 'No completed trades with reliable results')
  if (scopeKind === 'empty') return text('Keine monetären Abschlüsse', 'No closed trades with P&L')
  return null
}

export type DashboardRObservation = {
  source: TradeCalculationSource
  value: number | null
  documented: boolean
}

export function getDashboardRObservation(trade: Trade): DashboardRObservation {
  const source = trade.rSource ?? 'missing'
  const numericValue = getTradeRValue(trade)
  const documented = source !== 'missing' && getDocumentedTradeRValue(trade) !== null

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
  const monetaryScope = resolveTradeMonetaryScope(getFinalizedTrades([...trades]))

  return {
    trustedTrades,
    metrics,
    monetaryScope,
    moneyComparable: monetaryScope.isComparable && metrics.monetaryScope.isComparable,
    documentedR: getDocumentedRSummary(trustedTrades),
    evidenceState: getAnalyticsEvidenceState(trades.length, trustedTrades.length),
  }
}
