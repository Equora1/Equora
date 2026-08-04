import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTradeTagMap, buildTradesHref, getToneFromPnL, getWeekdayLabel, WEEKDAY_ORDER } from '@/lib/utils/review-helpers'
import type { ReviewTagHeatmap } from '@/lib/utils/review-types'

export function buildTagHeatmap(tradesCurrent: Trade[], tradeTags: TradeTag[]): ReviewTagHeatmap {
  const topTags = buildTagStats(tradesCurrent, tradeTags)
    .sort((left, right) => {
      if (right.totalTrades === left.totalTrades) return right.netPnL - left.netPnL
      return right.totalTrades - left.totalTrades
    })
    .slice(0, 5)
    .map((item) => item.tag)

  if (!topTags.length) {
    return {
      weekdays: WEEKDAY_ORDER,
      tags: [],
      cells: [],
    }
  }

  const tagMap = buildTradeTagMap(tradeTags)
  const rawCells = WEEKDAY_ORDER.flatMap((weekday) =>
    topTags.map((tag) => {
      const cellTrades = tradesCurrent.filter((trade) => getWeekdayLabel(trade) === weekday && (tagMap[trade.id] ?? []).includes(tag))
      const metrics = getCoreMetrics(cellTrades)

      return {
        weekday,
        tag,
        tradeCount: cellTrades.length,
        netPnL: metrics.netPnL,
        currency: metrics.currency,
        href: cellTrades.length ? buildTradesHref({ tag, weekday, reviewFocus: `Review Drilldown · Heatmap: ${weekday} × ${tag}` }) : undefined,
      }
    })
  )

  const maxTradeCount = Math.max(...rawCells.map((cell) => cell.tradeCount), 1)

  return {
    weekdays: WEEKDAY_ORDER,
    tags: topTags,
    cells: rawCells.map((cell) => ({
      ...cell,
      intensity: cell.tradeCount > 0 ? cell.tradeCount / maxTradeCount : 0,
      tone: getToneFromPnL(cell.netPnL),
    })),
  }
}

