import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { buildTagPairStats, buildTradesHref, clampNumber, getToneFromPnL, parseTagPair } from '@/lib/utils/review-helpers'
import type { ReviewTagCombinationItem } from '@/lib/utils/review-types'
import { getCoreMetrics } from '@/lib/utils/analytics'

export function buildTagCombinations(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewTagCombinationItem[] {
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
  const pairs = buildTagPairStats(tradesCurrent, tradeTags).filter((pair) => pair.metrics.totalTrades > 0)

  if (!pairs.length) {
    return [
      {
        label: 'Tag-Kombis',
        value: 'Noch zu wenig Daten',
        detail: 'Sobald Trades mit mehreren Tags im Review-Zeitraum liegen, verdichtet Equora hier die stärksten und gefährlichsten Kombinationen.',
        tone: 'orange',
      },
    ]
  }

  const bestPair = [...pairs].sort((left, right) => {
    if (right.metrics.netPnL === left.metrics.netPnL) return right.metrics.winRate - left.metrics.winRate
    return right.metrics.netPnL - left.metrics.netPnL
  })[0]
  const worstPair = [...pairs].sort((left, right) => {
    if (left.metrics.netPnL === right.metrics.netPnL) return left.metrics.winRate - right.metrics.winRate
    return left.metrics.netPnL - right.metrics.netPnL
  })[0]
  const mostRepeatedPair = [...pairs].sort((left, right) => {
    if (right.metrics.totalTrades === left.metrics.totalTrades) return right.metrics.netPnL - left.metrics.netPnL
    return right.metrics.totalTrades - left.metrics.totalTrades
  })[0]
  const unstablePair = [...pairs]
    .filter((pair) => pair.metrics.totalTrades >= 2)
    .sort((left, right) => {
      const leftScore = left.metrics.winRate - Math.abs(left.metrics.averageR) * 10
      const rightScore = right.metrics.winRate - Math.abs(right.metrics.averageR) * 10
      return leftScore - rightScore
    })[0]

  return [
    bestPair
      ? {
          label: 'Beste Kombi',
          value: bestPair.pair,
          detail: `${money(bestPair.metrics.netPnL)} · ${clampNumber(bestPair.metrics.winRate)}% Win Rate in ${bestPair.metrics.totalTrades} Trades.`,
          tone: getToneFromPnL(bestPair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(bestPair.pair), reviewFocus: `Review Drilldown · Beste Kombi: ${bestPair.pair}` }),
        }
      : null,
    worstPair && worstPair.metrics.netPnL < 0
      ? {
          label: 'Warn-Kombi',
          value: worstPair.pair,
          detail: `${money(worstPair.metrics.netPnL)} bei ${worstPair.metrics.totalTrades} Trades. Diese Paarung kippt aktuell zuverlässig rot.`,
          tone: 'red',
          href: buildTradesHref({ tags: parseTagPair(worstPair.pair), outcome: 'Verlierer', reviewFocus: `Review Drilldown · Warn-Kombi: ${worstPair.pair}` }),
        }
      : null,
    mostRepeatedPair
      ? {
          label: 'Wiederkehrende Kombi',
          value: mostRepeatedPair.pair,
          detail: `${mostRepeatedPair.metrics.totalTrades} Trades · PF ${mostRepeatedPair.metrics.profitFactor === Infinity ? '∞' : clampNumber(mostRepeatedPair.metrics.profitFactor, 2)}.`,
          tone: getToneFromPnL(mostRepeatedPair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(mostRepeatedPair.pair), reviewFocus: `Review Drilldown · Wiederkehrende Kombi: ${mostRepeatedPair.pair}` }),
        }
      : null,
    unstablePair && unstablePair.metrics.totalTrades >= 2
      ? {
          label: 'Volatile Kombi',
          value: unstablePair.pair,
          detail: `${clampNumber(unstablePair.metrics.winRate)}% Win Rate bei ${formatRMultiple(unstablePair.metrics.averageR)} im Schnitt. Gute Kandidatin für einen Vor-Entry-Check.`,
          tone: unstablePair.metrics.netPnL < 0 ? 'orange' : getToneFromPnL(unstablePair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(unstablePair.pair), reviewFocus: `Review Drilldown · Volatile Kombi: ${unstablePair.pair}` }),
        }
      : null,
  ].filter(Boolean).slice(0, 4) as ReviewTagCombinationItem[]
}
