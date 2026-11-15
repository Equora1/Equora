import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency } from '@/lib/utils/calculations'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTagPairStats, buildTradeTagMap, buildTradesHref, ERROR_TAG_KEYWORDS, hasKeywordMatch, parseTagPair } from '@/lib/utils/review-helpers'
import type { ReviewSignal } from '@/lib/utils/review-types'

export function buildErrorClusters(tradesCurrent: Trade[], tradeTags: TradeTag[], locale: JournalLocale = 'de'): ReviewSignal[] {
  const text = journalText(locale)
  const currency = getCoreMetrics(tradesCurrent).currency
  const money = (value: number) => formatCurrency(value, 0, currency, locale)
  const losingTrades = tradesCurrent.filter((trade) => (trade.netPnL ?? 0) < 0)
  if (!losingTrades.length) {
    return [{ label: 'Fehlercluster', value: text('Noch kein Verlustmuster', 'No loss pattern yet'), detail: text('Wenn Verlusttrades auftauchen, verdichtet Equora hier die wiederkehrenden Fehler-Tags und Kombinationen.', 'Recurring tags and combinations will appear here when there are losing trades.') }]
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
          detail: text(`${worstLossTag.totalTrades} Verlusttrades · ${money(worstLossTag.netPnL)} im roten Bereich.`, `${worstLossTag.totalTrades} losing trades · ${money(worstLossTag.netPnL)}.`),
          href: buildTradesHref({ tag: worstLossTag.tag, outcome: 'Verlierer', reviewFocus: `Review Drilldown · Häufigster Fehler-Tag: ${worstLossTag.tag}` }),
        }
      : null,
    errorTaggedTrades.length
      ? {
          label: 'Fehler-Familie',
          value: text('Prozessbruch-Tags', 'Process mistakes'),
          detail: text(`${money(errorMetrics.netPnL)} über ${errorTaggedTrades.length} Verlusttrades mit FOMO-, Revenge- oder Regelbruch-Mustern.`, `${money(errorMetrics.netPnL)} across ${errorTaggedTrades.length} losing trades tagged with FOMO, revenge trading or rule breaks.`),
        }
      : null,
    lossPairs[0]
      ? {
          label: 'Härteste Verlust-Kombi',
          value: lossPairs[0].pair,
          detail: text(`${lossPairs[0].trades.length} Trades · ${money(lossPairs[0].metrics.netPnL)} zusammen.`, `${lossPairs[0].trades.length} trades · ${money(lossPairs[0].metrics.netPnL)} combined.`),
          href: buildTradesHref({ tags: parseTagPair(lossPairs[0].pair), outcome: 'Verlierer', reviewFocus: `Review Drilldown · Härteste Verlust-Kombi: ${lossPairs[0].pair}` }),
        }
      : null,
    untaggedLosses > 0
      ? {
          label: 'Blinde Verluste',
          value: text(`${untaggedLosses} ungetaggt`, `${untaggedLosses} untagged`),
          detail: text('Ein Teil der Verlusttrades trägt noch keine Fehler- oder Kontext-Tags. Damit versickert Review-Wissen im Dunkeln.', 'Add mistake or context tags to losing trades so you can review them together.'),
          href: buildTradesHref({ outcome: 'Verlierer', tagging: 'Ungetaggt', reviewFocus: 'Review Drilldown · Blinde Verluste' }),
        }
      : null,
  ].filter(Boolean) as ReviewSignal[]

  return items.length ? items : [{ label: 'Fehlercluster', value: text('Noch unscharf', 'No clear pattern yet'), detail: text('Mit mehr Verlusttrades und sauberem Tagging wird hier sichtbar, welche Muster wieder zuschlagen.', 'Patterns will appear as you tag more losing trades.') }]
}
