import type { Trade } from '@/lib/types/trade'
import { getCoreMetrics } from '@/lib/utils/analytics'

export type CompareDimension = 'setup' | 'session' | 'emotion' | 'market' | 'quality' | 'concept' | 'tag'

export type CompareResult = {
  label: string
  totalTrades: number
  winRate: number
  avgR: number
  netPnL: number
  profitFactor: number
}

export type CompareTradeTag = {
  trade_id: string
  tag: string
}

function getDimensionValue(trade: Trade, dimension: Exclude<CompareDimension, 'tag'>): string {
  if (dimension === 'setup') return trade.setup
  if (dimension === 'session') return trade.session
  if (dimension === 'emotion') return trade.emotion
  if (dimension === 'market') return trade.market
  if (dimension === 'quality') return trade.quality
  return trade.concept
}

function buildRow(label: string, groupTrades: Trade[]): CompareResult {
  const metrics = getCoreMetrics(groupTrades)

  return {
    label,
    totalTrades: metrics.totalTrades,
    winRate: metrics.winRate,
    avgR: metrics.averageR,
    netPnL: metrics.netPnL,
    profitFactor: metrics.profitFactor,
  }
}

function buildTagComparison(trades: Trade[], tradeTags: CompareTradeTag[]): CompareResult[] {
  const tradeMap = new Map(trades.map((trade) => [trade.id, trade]))
  const grouped = tradeTags.reduce<Record<string, Map<string, Trade>>>((acc, item) => {
    const trade = tradeMap.get(item.trade_id)
    if (!trade) return acc

    const tagKey = item.tag || '—'
    ;(acc[tagKey] ||= new Map()).set(trade.id, trade)
    return acc
  }, {})

  return Object.entries(grouped)
    .map(([label, tradeMapForTag]) => buildRow(label, Array.from(tradeMapForTag.values())))
    .sort((a, b) => b.netPnL - a.netPnL)
}

export function buildComparison(
  trades: Trade[],
  dimension: CompareDimension,
  tradeTags: CompareTradeTag[] = [],
): CompareResult[] {
  if (dimension === 'tag') {
    return buildTagComparison(trades, tradeTags)
  }

  const grouped = trades.reduce<Record<string, Trade[]>>((acc, trade) => {
    const key = getDimensionValue(trade, dimension) || '—'
    ;(acc[key] ||= []).push(trade)
    return acc
  }, {})

  return Object.entries(grouped)
    .map(([label, groupTrades]) => buildRow(label, groupTrades))
    .sort((a, b) => b.netPnL - a.netPnL)
}
