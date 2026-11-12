import type { Trade } from '@/lib/types/trade'
import { getFinalizedTrades } from '@/lib/utils/trade-trust'
import { hasTradeReview, normalizeReviewValue, resolveTradeReviewState } from '@/lib/utils/review-layer-snapshot'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { REVIEW_CALCULATION_VERSION } from '@/lib/utils/review-snapshot-summary'

type ReviewSignalMatch = { kind: 'reviewed' } | { kind: 'repeatability' } | { kind: 'state'; value: string } | { kind: 'trade'; value: string }
export type ReviewDrilldownScope = { from: string; to: string; calculation: typeof REVIEW_CALCULATION_VERSION; match?: ReviewSignalMatch }
type ScopeRead = { kind: 'none' } | { kind: 'invalid' } | { kind: 'valid'; scope: ReviewDrilldownScope }
const keys = ['reviewFrom', 'reviewTo', 'reviewCalculation'] as const

/** Invalid or partial scope must never silently widen the signal selection. */
export function readReviewDrilldownScope(params: URLSearchParams): ScopeRead {
  if (![...keys, 'reviewMatch', 'reviewValue'].some(key => params.has(key))) return { kind: 'none' }
  if (keys.some(key => params.getAll(key).length !== 1)) return { kind: 'invalid' }
  const from = params.get('reviewFrom')!, to = params.get('reviewTo')!
  const start = new Date(from), end = new Date(to)
  if (params.get('reviewCalculation') !== REVIEW_CALCULATION_VERSION
    || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())
    || start.toISOString() !== from || end.toISOString() !== to || start > end) return { kind: 'invalid' }
  const matchName = params.get('reviewMatch'), value = params.get('reviewValue')
  if (params.getAll('reviewMatch').length > 1 || params.getAll('reviewValue').length > 1) return { kind: 'invalid' }
  let match: ReviewSignalMatch | undefined
  if ((matchName === 'reviewed' || matchName === 'repeatability') && value === null) match = { kind: matchName }
  else if ((matchName === 'state' || matchName === 'trade') && value && value.trim() === value && value.length <= 200) match = { kind: matchName, value }
  else if (matchName !== null || value !== null) return { kind: 'invalid' }
  return { kind: 'valid', scope: { from, to, calculation: REVIEW_CALCULATION_VERSION, ...(match ? { match } : {}) } }
}

export function bindReviewDrilldownHref(href: string, scope: ReviewDrilldownScope) {
  const url = new URL(href, 'https://equora.invalid')
  if (url.origin !== 'https://equora.invalid' || url.pathname !== '/trades') return href
  url.searchParams.set('reviewFrom', scope.from)
  url.searchParams.set('reviewTo', scope.to)
  url.searchParams.set('reviewCalculation', scope.calculation)
  url.searchParams.set('reviewOnly', '1')
  if (scope.match) {
    url.searchParams.set('reviewMatch', scope.match.kind)
    if (scope.match.kind === 'reviewed' || scope.match.kind === 'repeatability') url.searchParams.delete('reviewValue')
    else url.searchParams.set('reviewValue', scope.match.value)
  }
  if (!url.searchParams.get('reviewFocus')) url.searchParams.set('reviewFocus', 'Reviewzeitraum')
  return url.pathname + url.search + url.hash
}

export function scopeReviewDrilldownLinks<T extends { href?: string }>(items: T[], scope: ReviewDrilldownScope): T[] {
  return items.map(item => item.href ? { ...item, href: bindReviewDrilldownHref(item.href, scope) } : item)
}

export function selectReviewDrilldownTrades(trades: Trade[], scope: ReviewDrilldownScope) {
  const start = new Date(scope.from).getTime(), end = new Date(scope.to).getTime()
  const match = scope.match
  return getFinalizedTrades(trades).filter(trade => {
    const at = new Date(resolveTradeOccurredAt(trade)).getTime()
    if (at < start || at > end || !Number.isFinite(at)) return false
    if (!match) return true
    if (match.kind === 'trade') return trade.id === match.value
    if (!hasTradeReview(trade)) return false
    if (match.kind === 'reviewed') return true
    if (match.kind === 'repeatability') return Boolean(normalizeReviewValue(trade.reviewRepeatability))
    return resolveTradeReviewState(trade) === match.value
  })
}
