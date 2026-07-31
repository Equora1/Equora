import type { Trade } from '@/lib/types/trade'
import type { TagStat } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'

export function buildTagStats(
  trades: Trade[],
  tradeTags: Array<{ trade_id: string; tag: string }>
): TagStat[] {
  const grouped = tradeTags.reduce<Record<string, string[]>>((acc, item) => {
    ;(acc[item.tag] ||= []).push(item.trade_id)
    return acc
  }, {})

  return Object.entries(grouped)
    .map(([tag, tradeIds]) => {
      const taggedTrades = trades.filter((trade) => tradeIds.includes(trade.id))
      const metrics = getCoreMetrics(taggedTrades)
      return {
        tag,
        totalTrades: metrics.totalTrades,
        winRate: metrics.winRate,
        avgR: metrics.averageR,
        netPnL: metrics.netPnL,
        profitFactor: metrics.profitFactor,
      }
    })
    .sort((a, b) => b.netPnL - a.netPnL)
}
