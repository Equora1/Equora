import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'

import {
  buildWindowLabel,
  isTradeInRange,
  sortTradesChronologically,
} from '@/lib/utils/review-helpers'
import {
  buildErrorClusters,
  buildHeadline,
  buildNoteMoments,
  buildPatterns,
  buildPlaybook,
  buildReviewLayerSnapshot,
  buildSummary,
  buildTagCombinations,
  buildTagDrift,
  buildTagHeatmap,
  buildTagRadar,
  buildTopPerformers,
  buildWeakSpots,
} from '@/lib/utils/review-builders'
import { buildReviewImportInsights, buildReviewSetupInsights } from '@/lib/utils/review-import-setup-insights'
import { REVIEW_PERIOD_OPTIONS } from '@/lib/utils/review-types'
import { getMonetaryScopeMessage } from '@/lib/utils/currency'
import type {
  ReviewPeriodPreset,
  ReviewSnapshot,
  ReviewSnapshotCollection,
} from '@/lib/utils/review-types'

export { REVIEW_PERIOD_OPTIONS } from '@/lib/utils/review-types'
export type { ReviewPeriodPreset, ReviewSnapshot, ReviewSnapshotCollection } from '@/lib/utils/review-types'

export function getReviewPeriodPresetLabel(snapshotLike: { periodPreset: ReviewPeriodPreset; periodPresetLabel?: string | null }) {
  const explicitLabel = snapshotLike.periodPresetLabel?.trim()
  if (explicitLabel) return explicitLabel
  return REVIEW_PERIOD_OPTIONS.find((option) => option.key === snapshotLike.periodPreset)?.label ?? 'Review'
}

function getPeriodWindows(trades: Trade[], preset: ReviewPeriodPreset) {
  const chronological = sortTradesChronologically(trades)
  const latestTrade = chronological[chronological.length - 1]
  const latestTradeDate = latestTrade ? new Date(resolveTradeOccurredAt(latestTrade)) : new Date()
  const currentEnd = new Date(latestTradeDate)
  currentEnd.setHours(23, 59, 59, 999)

  const presetConfig = REVIEW_PERIOD_OPTIONS.find((item) => item.key === preset) ?? REVIEW_PERIOD_OPTIONS[0]
  const currentStart = new Date(currentEnd)
  currentStart.setDate(currentEnd.getDate() - (presetConfig.days - 1))
  currentStart.setHours(0, 0, 0, 0)

  const previousEnd = new Date(currentStart)
  previousEnd.setMilliseconds(-1)

  const previousStart = new Date(currentStart)
  previousStart.setDate(currentStart.getDate() - presetConfig.days)

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    presetConfig,
  }
}

export function buildReviewSnapshot(
  trades: Trade[],
  tradeTags: TradeTag[],
  dailyNotes: DailyNoteRow[],
  source: 'supabase' | 'mock',
  options?: { preset?: ReviewPeriodPreset }
): ReviewSnapshot {
  const preset = options?.preset ?? '7d'
  const { currentStart, currentEnd, previousStart, previousEnd, presetConfig } = getPeriodWindows(trades, preset)
  const tradesCurrent = trades.filter((trade) => isTradeInRange(trade, currentStart, currentEnd))
  const tradesPrevious = trades.filter((trade) => isTradeInRange(trade, previousStart, previousEnd))
  const currentTradeIds = new Set(tradesCurrent.map((trade) => trade.id))
  const previousTradeIds = new Set(tradesPrevious.map((trade) => trade.id))
  const tagsCurrent = tradeTags.filter((tag) => currentTradeIds.has(tag.trade_id))
  const tagsPrevious = tradeTags.filter((tag) => previousTradeIds.has(tag.trade_id))
  const metricsCurrent = getCoreMetrics(tradesCurrent)
  const metricsPrevious = getCoreMetrics(tradesPrevious)
  const monetaryAvailable = metricsCurrent.monetaryScope.isComparable
  const periodsComparable = monetaryAvailable
    && metricsPrevious.monetaryScope.isComparable
    && metricsCurrent.currency === metricsPrevious.currency
  const errorClusters = monetaryAvailable ? buildErrorClusters(tradesCurrent, tagsCurrent) : []
  const tagDrift = periodsComparable ? buildTagDrift(tradesCurrent, tagsCurrent, tradesPrevious, tagsPrevious) : []
  const comparablePreviousTrades = periodsComparable ? tradesPrevious : []
  const comparablePreviousTags = periodsComparable ? tagsPrevious : []
  const headlineResult = !tradesCurrent.length
    ? buildHeadline(tradesCurrent, metricsCurrent, tagDrift, errorClusters)
    : monetaryAvailable
      ? buildHeadline(tradesCurrent, metricsCurrent, tagDrift, errorClusters)
      : {
          headline: metricsCurrent.monetaryScope.kind === 'empty' ? 'Trades erfasst, P&L noch offen' : 'Geld-Auswertung wegen Währungsdaten gesperrt',
          summary: getMonetaryScopeMessage(metricsCurrent.monetaryScope),
        }
  const rankedTrades = monetaryAvailable
    ? [...tradesCurrent].sort((left, right) => (right.netPnL ?? 0) - (left.netPnL ?? 0))
    : []
  const topTags = Array.from(tagsCurrent.reduce<Map<string, number>>((counts, item) => {
    counts.set(item.tag, (counts.get(item.tag) ?? 0) + 1)
    return counts
  }, new Map()))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([tag]) => tag)
  const unavailableSignal = [{
    label: 'Geld-Auswertung',
    value: metricsCurrent.monetaryScope.kind === 'empty' ? 'P&L offen' : 'Gesperrt',
    detail: getMonetaryScopeMessage(metricsCurrent.monetaryScope),
  }]

  return {
    periodPreset: preset,
    periodPresetLabel: presetConfig.label,
    periodLabel: buildWindowLabel(currentStart, currentEnd),
    previousPeriodLabel: buildWindowLabel(previousStart, previousEnd),
    previousNetPnL: metricsPrevious.netPnL,
    currency: metricsCurrent.currency,
    monetaryScopeKind: metricsCurrent.monetaryScope.kind,
    periodStart: currentStart.toISOString(),
    periodEnd: currentEnd.toISOString(),
    sourceLabel: source === 'supabase' ? 'Live-Review' : 'Demo-Review',
    headline: headlineResult.headline,
    summary: headlineResult.summary,
    stats: buildSummary(metricsCurrent, metricsPrevious),
    topPerformers: monetaryAvailable ? buildTopPerformers(tradesCurrent, tagsCurrent) : unavailableSignal,
    weakSpots: monetaryAvailable ? buildWeakSpots(tradesCurrent, tagsCurrent) : unavailableSignal,
    patterns: monetaryAvailable ? buildPatterns(tradesCurrent, tagsCurrent, comparablePreviousTrades, comparablePreviousTags) : [getMonetaryScopeMessage(metricsCurrent.monetaryScope)],
    playbook: monetaryAvailable ? buildPlaybook(tradesCurrent, tagsCurrent, comparablePreviousTrades, comparablePreviousTags) : ['Kontowährungen vervollständigen oder nach genau einer Währung filtern; erst danach P&L-Muster bewerten.'],
    noteMoments: buildNoteMoments(dailyNotes, currentStart, currentEnd),
    tagRadar: monetaryAvailable ? buildTagRadar(tradesCurrent, tagsCurrent) : [],
    errorClusters,
    tagDrift,
    tagCombinations: monetaryAvailable ? buildTagCombinations(tradesCurrent, tagsCurrent) : [],
    tagHeatmap: monetaryAvailable ? buildTagHeatmap(tradesCurrent, tagsCurrent) : { weekdays: [], tags: [], cells: [] },
    setupInsights: monetaryAvailable ? buildReviewSetupInsights(tradesCurrent) : [],
    importInsights: monetaryAvailable ? buildReviewImportInsights(tradesCurrent) : [],
    reviewLayer: buildReviewLayerSnapshot(tradesCurrent),
    sessionDraft: {
      tradeIds: tradesCurrent.map((trade) => trade.id),
      tradeCount: metricsCurrent.totalTrades,
      visibleTradeCount: metricsCurrent.totalTrades,
      netPnL: metricsCurrent.netPnL,
      currency: metricsCurrent.currency,
      monetaryScopeKind: metricsCurrent.monetaryScope.kind,
      averageR: metricsCurrent.averageR,
      winRate: metricsCurrent.winRate,
      winners: metricsCurrent.winners,
      losers: metricsCurrent.losers,
      breakeven: metricsCurrent.breakeven,
      topTags,
      bestTradeId: rankedTrades[0]?.id ?? null,
      worstTradeId: rankedTrades[rankedTrades.length - 1]?.id ?? null,
    },
  }
}


export function buildReviewSnapshots(
  trades: Trade[],
  tradeTags: TradeTag[],
  dailyNotes: DailyNoteRow[],
  source: 'supabase' | 'mock'
): ReviewSnapshotCollection {
  return REVIEW_PERIOD_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.key] = buildReviewSnapshot(trades, tradeTags, dailyNotes, source, { preset: option.key })
    return accumulator
  }, {} as ReviewSnapshotCollection)
}
