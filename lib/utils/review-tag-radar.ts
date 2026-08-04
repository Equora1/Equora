import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { formatCurrency } from '@/lib/utils/calculations'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTagPairStats, buildTradesHref, clampNumber, hasKeywordMatch, parseTagPair, PROCESS_TAG_KEYWORDS } from '@/lib/utils/review-helpers'
import type { ReviewTagRadarItem } from '@/lib/utils/review-types'
import { getCoreMetrics } from '@/lib/utils/analytics'

export function buildTagRadar(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewTagRadarItem[] {
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
  const stats = buildTagStats(tradesCurrent, tradeTags).filter((tag) => tag.totalTrades > 0)
  if (!stats.length) {
    return [
      {
        label: 'Tag-Radar',
        value: 'Noch keine Tag-Daten',
        detail: 'Sobald Trades im Zeitraum sauber getaggt sind, markiert Equora hier Prozess-Anker, Wiederholungsfehler und starke Kombinationen.',
        tone: 'orange',
      },
    ]
  }

  const tagPairs = buildTagPairStats(tradesCurrent, tradeTags)
    .filter((pair) => pair.metrics.totalTrades > 0)
    .sort((left, right) => right.metrics.netPnL - left.metrics.netPnL)
  const losingTradeIds = new Set(tradesCurrent.filter((trade) => (trade.netPnL ?? 0) < 0).map((trade) => trade.id))
  const repeatLossMap = tradeTags
    .filter((tag) => losingTradeIds.has(tag.trade_id))
    .reduce<Record<string, number>>((accumulator, tag) => {
      accumulator[tag.tag] = (accumulator[tag.tag] ?? 0) + 1
      return accumulator
    }, {})
  const repeatLossEntry = Object.entries(repeatLossMap).sort((left, right) => right[1] - left[1])[0]
  const processAnchor = stats.filter((tag) => hasKeywordMatch(tag.tag, PROCESS_TAG_KEYWORDS)).sort((left, right) => right.netPnL - left.netPnL)[0]
  const bestTag = [...stats].sort((left, right) => right.netPnL - left.netPnL)[0]
  const worstTag = [...stats].sort((left, right) => left.netPnL - right.netPnL)[0]

  return [
    bestTag
      ? {
          label: 'Stärkster Tag',
          value: bestTag.tag,
          detail: `${money(bestTag.netPnL)} · ${clampNumber(bestTag.winRate)}% Win Rate in ${bestTag.totalTrades} Trades.`,
          tone: 'emerald',
          href: buildTradesHref({ tag: bestTag.tag, reviewFocus: `Review Drilldown · Stärkster Tag: ${bestTag.tag}` }),
        }
      : null,
    processAnchor
      ? {
          label: 'Prozess-Anker',
          value: processAnchor.tag,
          detail: `${money(processAnchor.netPnL)} und PF ${processAnchor.profitFactor === Infinity ? '∞' : clampNumber(processAnchor.profitFactor, 2)}. Diesen Zustand willst du replizieren.`,
          tone: 'emerald',
          href: buildTradesHref({ tag: processAnchor.tag, reviewFocus: `Review Drilldown · Prozess-Anker: ${processAnchor.tag}` }),
        }
      : null,
    worstTag && worstTag.netPnL < 0
      ? {
          label: 'Warn-Tag',
          value: worstTag.tag,
          detail: `${money(worstTag.netPnL)} über ${worstTag.totalTrades} markierte Trades.`,
          tone: 'red',
          href: buildTradesHref({ tag: worstTag.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Warn-Tag: ${worstTag.tag}` }),
        }
      : null,
    repeatLossEntry
      ? {
          label: 'Wiederholer bei Verlusten',
          value: repeatLossEntry[0],
          detail: `Tauchte ${repeatLossEntry[1]}× in Verlusttrades auf und verdient einen Vor-Entry-Check.`,
          tone: repeatLossEntry[1] >= 2 ? 'red' : 'orange',
          href: buildTradesHref({ tag: repeatLossEntry[0], outcome: 'Verlierer', reviewFocus: `Review Drilldown · Wiederholer bei Verlusten: ${repeatLossEntry[0]}` }),
        }
      : null,
    tagPairs[0]
      ? {
          label: 'Stärkste Tag-Kombi',
          value: tagPairs[0].pair,
          detail: `${money(tagPairs[0].metrics.netPnL)} in ${tagPairs[0].metrics.totalTrades} Trades.`,
          tone: tagPairs[0].metrics.netPnL >= 0 ? 'emerald' : 'orange',
          href: buildTradesHref({ tags: parseTagPair(tagPairs[0].pair), reviewFocus: `Review Drilldown · Stärkste Tag-Kombi: ${tagPairs[0].pair}` }),
        }
      : null,
  ].filter(Boolean).slice(0, 4) as ReviewTagRadarItem[]
}
