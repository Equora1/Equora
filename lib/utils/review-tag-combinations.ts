import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'
import { buildTagPairStats, buildTradesHref, clampNumber, getToneFromPnL, parseTagPair } from '@/lib/utils/review-helpers'
import type { ReviewTagCombinationItem } from '@/lib/utils/review-types'
import { getCoreMetrics } from '@/lib/utils/analytics'

export function buildTagCombinations(tradesCurrent: Trade[], tradeTags: TradeTag[], locale: JournalLocale = 'de'): ReviewTagCombinationItem[] {
  const text = journalText(locale)
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
  const pairs = buildTagPairStats(tradesCurrent, tradeTags).filter((pair) => pair.metrics.totalTrades > 0)

  if (!pairs.length) {
    return [
      {
        label: 'Tag-Kombis',
        value: text('Noch zu wenig Daten', 'Too few tagged trades'),
        detail: text('Sobald Trades mit mehreren Tags im Review-Zeitraum liegen, verdichtet Equora hier die stärksten und gefährlichsten Kombinationen.', 'Apply multiple tags to your trades to compare how combinations performed.'),
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
    .filter((pair) => pair.metrics.totalTrades >= 2 && pair.metrics.averageR !== null)
    .sort((left, right) => {
      const leftScore = left.metrics.winRate - Math.abs(left.metrics.averageR!) * 10
      const rightScore = right.metrics.winRate - Math.abs(right.metrics.averageR!) * 10
      return leftScore - rightScore
    })[0]

  return [
    bestPair
      ? {
          label: 'Beste Kombi',
          value: bestPair.pair,
          detail: text(`${money(bestPair.metrics.netPnL)} · ${clampNumber(bestPair.metrics.winRate)}% Trefferquote in ${bestPair.metrics.totalTrades} Trades.`, `${money(bestPair.metrics.netPnL)} · ${clampNumber(bestPair.metrics.winRate)}% win rate across ${bestPair.metrics.totalTrades} trades.`),
          tone: getToneFromPnL(bestPair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(bestPair.pair), reviewFocus: `Review Drilldown · Beste Kombi: ${bestPair.pair}` }),
        }
      : null,
    worstPair && worstPair.metrics.netPnL < 0
      ? {
          label: 'Warn-Kombi',
          value: worstPair.pair,
          detail: text(`${money(worstPair.metrics.netPnL)} bei ${worstPair.metrics.totalTrades} Trades. Diese Paarung kippt aktuell zuverlässig rot.`, `${money(worstPair.metrics.netPnL)} across ${worstPair.metrics.totalTrades} trades in this period.`),
          tone: 'red',
          href: buildTradesHref({ tags: parseTagPair(worstPair.pair), outcome: 'Verlierer', reviewFocus: `Review Drilldown · Warn-Kombi: ${worstPair.pair}` }),
        }
      : null,
    mostRepeatedPair
      ? {
          label: 'Wiederkehrende Kombi',
          value: mostRepeatedPair.pair,
          detail: text(`${mostRepeatedPair.metrics.totalTrades} Trades · PF ${mostRepeatedPair.metrics.profitFactor === Infinity ? '∞' : clampNumber(mostRepeatedPair.metrics.profitFactor, 2)}.`, `${mostRepeatedPair.metrics.totalTrades} trades · profit factor ${mostRepeatedPair.metrics.profitFactor === Infinity ? '∞' : clampNumber(mostRepeatedPair.metrics.profitFactor, 2)}.`),
          tone: getToneFromPnL(mostRepeatedPair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(mostRepeatedPair.pair), reviewFocus: `Review Drilldown · Wiederkehrende Kombi: ${mostRepeatedPair.pair}` }),
        }
      : null,
    unstablePair && unstablePair.metrics.totalTrades >= 2
      ? {
          label: 'Volatile Kombi',
          value: unstablePair.pair,
          detail: text(`${clampNumber(unstablePair.metrics.winRate)}% Trefferquote bei ${formatRMultiple(unstablePair.metrics.averageR, 2, locale)} im Schnitt. Gute Kandidatin für einen Vor-Entry-Check.`, `${clampNumber(unstablePair.metrics.winRate)}% win rate and ${formatRMultiple(unstablePair.metrics.averageR, 2, locale)} on average. Review the trades behind this combination.`),
          tone: unstablePair.metrics.netPnL < 0 ? 'orange' : getToneFromPnL(unstablePair.metrics.netPnL),
          href: buildTradesHref({ tags: parseTagPair(unstablePair.pair), reviewFocus: `Review Drilldown · Volatile Kombi: ${unstablePair.pair}` }),
        }
      : null,
  ].filter(Boolean).slice(0, 4) as ReviewTagCombinationItem[]
}
