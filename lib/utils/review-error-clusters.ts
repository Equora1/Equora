import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency } from '@/lib/utils/calculations'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTagPairStats, buildTradeTagMap, buildTradesHref, ERROR_TAG_KEYWORDS, hasKeywordMatch, parseTagPair } from '@/lib/utils/review-helpers'
import type { ReviewSignal } from '@/lib/utils/review-types'

export function buildErrorClusters(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewSignal[] {
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency)
  const losingTrades = tradesCurrent.filter((trade) => (trade.netPnL ?? 0) < 0)
  if (!losingTrades.length) {
    return [{ label: 'Fehlercluster', value: 'Noch kein Verlustmuster', detail: 'Wenn Verlusttrades auftauchen, verdichtet Equora hier die wiederkehrenden Fehler-Tags und Kombinationen.' }]
  }

  const lossTags = buildTagStats(losingTrades, tradeTags)
  const tagMap = buildTradeTagMap(tradeTags)
  const worstLossTag = [...lossTags].sort((left, right) => {
    if (right.totalTrades === left.totalTrades) return left.netPnL - right.netPnL
    return right.totalTrades - left.totalTrades
  })[0]
  const errorTaggedTrades = losingTrades.filter((trade) => (tagMap[trade.id] ?? []).some((tag) => hasKeywordMatch(tag, ERROR_TAG_KEYWORDS)))
  const errorMetrics = getCoreMetrics(errorTaggedTrades)
  const lossPairs = buildTagPairStats(losingTrades, tradeTags).sort((left, right) => {
    if (right.trades.length === left.trades.length) return left.metrics.netPnL - right.metrics.netPnL
    return right.trades.length - left.trades.length
  })
  const untaggedLosses = losingTrades.filter((trade) => !(tagMap[trade.id] ?? []).length).length

  const items = [
    worstLossTag
      ? {
          label: 'Häufigster Fehler-Tag',
          value: worstLossTag.tag,
          detail: `${worstLossTag.totalTrades} Verlusttrades · ${money(worstLossTag.netPnL)} im roten Bereich.`,
          href: buildTradesHref({ tag: worstLossTag.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Häufigster Fehler-Tag: ${worstLossTag.tag}` }),
        }
      : null,
    errorTaggedTrades.length
      ? {
          label: 'Fehler-Familie',
          value: 'Prozessbruch-Tags',
          detail: `${money(errorMetrics.netPnL)} über ${errorTaggedTrades.length} Verlusttrades mit FOMO-, Revenge- oder Regelbruch-Mustern.`,
        }
      : null,
    lossPairs[0]
      ? {
          label: 'Härteste Verlust-Kombi',
          value: lossPairs[0].pair,
          detail: `${lossPairs[0].trades.length} Trades · ${money(lossPairs[0].metrics.netPnL)} zusammen.`,
          href: buildTradesHref({ tags: parseTagPair(lossPairs[0].pair), outcome: 'Verlierer', reviewFocus: `Review Drilldown · Härteste Verlust-Kombi: ${lossPairs[0].pair}` }),
        }
      : null,
    untaggedLosses > 0
      ? {
          label: 'Blinde Verluste',
          value: `${untaggedLosses} ungetaggt`,
          detail: 'Ein Teil der Verlusttrades trägt noch keine Fehler- oder Kontext-Tags. Damit versickert Review-Wissen im Dunkeln.',
          href: buildTradesHref({ outcome: 'Verlierer', tagging: 'Ungetaggt', reviewFocus: 'Review Drilldown · Blinde Verluste' }),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length ? items : [{ label: 'Fehlercluster', value: 'Noch unscharf', detail: 'Mit mehr Verlusttrades und sauberem Tagging wird hier sichtbar, welche Muster wieder zuschlagen.' }]
}
