import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { buildTradeTagMap, groupTradesByKey, hasKeywordMatch, normalizeTag, PROCESS_TAG_KEYWORDS } from '@/lib/utils/review-helpers'
import type { TagComparison } from '@/lib/utils/review-types'

export function getTagCoverage(trades: Trade[], tradeTags: TradeTag[]) {
  if (!trades.length) return 0
  const taggedTradeIds = new Set(tradeTags.map((tag) => tag.trade_id))
  return (trades.filter((trade) => taggedTradeIds.has(trade.id)).length / trades.length) * 100
}

export function getProcessTagShare(trades: Trade[], tradeTags: TradeTag[]) {
  if (!trades.length) return 0
  const tagMap = buildTradeTagMap(tradeTags)
  const processTaggedTrades = trades.filter((trade) => (tagMap[trade.id] ?? []).some((tag) => hasKeywordMatch(tag, PROCESS_TAG_KEYWORDS)))
  return (processTaggedTrades.length / trades.length) * 100
}

export function buildTagComparisons(currentTags: TradeTag[], previousTags: TradeTag[], tradesCurrent: Trade[], tradesPrevious: Trade[]) {
  const currentStats = buildTagStats(tradesCurrent, currentTags)
  const previousStats = buildTagStats(tradesPrevious, previousTags)
  const currentMap = new Map(currentStats.map((item) => [normalizeTag(item.tag), item]))
  const previousMap = new Map(previousStats.map((item) => [normalizeTag(item.tag), item]))
  const allTags = new Set([...currentMap.keys(), ...previousMap.keys()])

  return Array.from(allTags).map<TagComparison>((key) => {
    const current = currentMap.get(key) ?? null
    const previous = previousMap.get(key) ?? null

    return {
      tag: current?.tag ?? previous?.tag ?? key,
      current,
      previous,
      pnlDelta: (current?.netPnL ?? 0) - (previous?.netPnL ?? 0),
      winRateDelta: (current?.winRate ?? 0) - (previous?.winRate ?? 0),
      tradeDelta: (current?.totalTrades ?? 0) - (previous?.totalTrades ?? 0),
    }
  })
}

export function getBestAndWorstBucket(trades: Trade[], getKey: (trade: Trade) => string) {
  const grouped = Object.entries(groupTradesByKey(trades, getKey)).map(([key, bucketTrades]) => ({
    key,
    trades: bucketTrades,
    metrics: getCoreMetrics(bucketTrades),
  }))

  if (!grouped.length) return { best: null, worst: null }

  const ranked = grouped.sort((a, b) => {
    if (b.metrics.netPnL === a.metrics.netPnL) return b.metrics.winRate - a.metrics.winRate
    return b.metrics.netPnL - a.metrics.netPnL
  })

  return {
    best: ranked[0] ?? null,
    worst: [...ranked].reverse()[0] ?? null,
  }
}

