import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'

export const REVIEW_CALCULATION_VERSION = 'documented-outcomes-v2' as const

/** Shared by the live draft and the trusted server save path. */
export function buildReviewSnapshotSummary(trades: Trade[], tags: TradeTag[]) {
  const metrics = getCoreMetrics(trades)
  const ids = new Set(trades.map((trade) => trade.id))
  const counts = new Map<string, number>()
  for (const tag of tags) {
    if (!ids.has(tag.trade_id)) continue
    const name = tag.tag.trim()
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const topTags = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, 8).map(([name]) => name)
  const ranked = metrics.monetaryScope.isComparable
    ? trades.filter((trade) => trade.netPnL !== undefined && trade.netPnL !== null)
      .sort((a, b) => (b.netPnL! - a.netPnL!) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    : []
  const summary = {
    calculationVersion: REVIEW_CALCULATION_VERSION,
    tradeIds: trades.map((trade) => trade.id).sort(),
    tradeCount: trades.length,
    visibleTradeCount: trades.length,
    netPnL: metrics.netPnL,
    currency: metrics.currency,
    monetaryScopeKind: metrics.monetaryScope.kind,
    averageR: metrics.averageR,
    rCount: metrics.rCount,
    excludedRCount: trades.length - metrics.rCount,
    winRate: metrics.winRate,
    winners: metrics.winners,
    losers: metrics.losers,
    breakeven: metrics.breakeven,
    topTags,
    bestTradeId: ranked[0]?.id ?? null,
    worstTradeId: ranked.length ? [...ranked].sort((a, b) => (a.netPnL! - b.netPnL!) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0].id : null,
  }
  for (const value of [summary.netPnL, summary.winRate, summary.averageR]) {
    if (value !== null && !Number.isFinite(value)) throw new Error('NONFINITE_REVIEW_METRIC')
  }
  return summary
}

type ReviewR = { calculationVersion?: string | null; calculationVerified?: boolean; averageR: number | null; legacyAverageR?: number | null; rCount?: number | null; excludedRCount?: number | null; tradeCount: number }
export function isCurrentReviewCalculation(review: ReviewR) {
  return review.calculationVerified !== false && review.calculationVersion === REVIEW_CALCULATION_VERSION && Number.isSafeInteger(review.tradeCount) && review.tradeCount >= 0
    && Number.isSafeInteger(review.rCount) && review.rCount! >= 0 && Number.isSafeInteger(review.excludedRCount)
    && review.excludedRCount! >= 0 && review.rCount! + review.excludedRCount! === review.tradeCount
    && (review.rCount === 0 ? review.averageR === null : typeof review.averageR === 'number' && Number.isFinite(review.averageR))
}

/** Retain an unverified stored number without allowing normalization to repair its provenance. */
export function getSavedReviewRState(review: ReviewR) {
  const calculationVerified = isCurrentReviewCalculation(review)
  const stored = review.legacyAverageR ?? review.averageR
  return {
    calculationVerified,
    averageR: calculationVerified ? getSavedReviewRValue(review) : null,
    legacyAverageR: calculationVerified ? null : typeof stored === 'number' && Number.isFinite(stored) ? stored : null,
  }
}
export function getSavedReviewRValue(review: ReviewR): number | null {
  if (!isCurrentReviewCalculation(review) || review.rCount === 0) return null
  return review.averageR
}

export function haveComparableReviewCalculations(left: ReviewR, right: ReviewR) {
  return isCurrentReviewCalculation(left) && isCurrentReviewCalculation(right)
}
