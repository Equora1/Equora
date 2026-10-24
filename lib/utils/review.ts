import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import { getCoreMetrics } from '@/lib/utils/analytics'
import { getFinalizedTrades } from '@/lib/utils/trade-trust'
import { buildReviewSnapshotSummary, REVIEW_CALCULATION_VERSION } from '@/lib/utils/review-snapshot-summary'
import { scopeReviewDrilldownLinks, type ReviewDrilldownScope } from '@/lib/utils/review-drilldown-scope'
import { buildTagStats } from '@/lib/utils/tag-analytics'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { journalPeriodEndingOn } from '@/lib/utils/journal-day'

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
  ReviewSignal,
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
  const presetConfig = REVIEW_PERIOD_OPTIONS.find((item) => item.key === preset) ?? REVIEW_PERIOD_OPTIONS[0]
  const { start: currentStart, end: currentEnd, previousStart, previousEnd } = journalPeriodEndingOn(latestTradeDate, presetConfig.days)

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
  const drilldownScope: ReviewDrilldownScope = { from: currentStart.toISOString(), to: currentEnd.toISOString(), calculation: REVIEW_CALCULATION_VERSION }
  const scoped = <T extends { href?: string }>(items: T[]) => scopeReviewDrilldownLinks(items, drilldownScope)
  const finalizedCurrent = getFinalizedTrades(tradesCurrent)
  const finalizedPrevious = getFinalizedTrades(tradesPrevious)
  const metricsCurrent = getCoreMetrics(finalizedCurrent)
  const metricsPrevious = getCoreMetrics(finalizedPrevious)
  const monetaryAvailable = metricsCurrent.monetaryScope.isComparable
  const periodsComparable = monetaryAvailable
    && metricsPrevious.monetaryScope.isComparable
    && metricsCurrent.currency === metricsPrevious.currency
  const errorClusters = scoped(monetaryAvailable ? buildErrorClusters(finalizedCurrent, tagsCurrent) : [])
  const tagDrift = scoped(periodsComparable ? buildTagDrift(finalizedCurrent, tagsCurrent, finalizedPrevious, tagsPrevious) : [])
  const comparablePreviousTrades = periodsComparable ? finalizedPrevious : []
  const comparablePreviousTags = periodsComparable ? tagsPrevious : []
  const headlineResult = !tradesCurrent.length
    ? buildHeadline(finalizedCurrent, metricsCurrent, tagDrift, errorClusters)
    : monetaryAvailable
      ? buildHeadline(finalizedCurrent, metricsCurrent, tagDrift, errorClusters)
      : {
          headline: metricsCurrent.monetaryScope.kind === 'empty' ? 'Trades erfasst, P&L noch offen' : 'Geld-Auswertung wegen Währungsdaten gesperrt',
          summary: getMonetaryScopeMessage(metricsCurrent.monetaryScope),
        }
  const reviewLayer = buildReviewLayerSnapshot(finalizedCurrent)
  const heatmap = monetaryAvailable ? buildTagHeatmap(finalizedCurrent, tagsCurrent) : { weekdays: [], tags: [], cells: [] }
  const unavailableSignal: ReviewSignal[] = [{
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
    topPerformers: scoped(monetaryAvailable ? buildTopPerformers(finalizedCurrent, tagsCurrent) : unavailableSignal),
    weakSpots: scoped(monetaryAvailable ? buildWeakSpots(finalizedCurrent, tagsCurrent) : unavailableSignal),
    patterns: monetaryAvailable ? buildPatterns(finalizedCurrent, tagsCurrent, comparablePreviousTrades, comparablePreviousTags) : [getMonetaryScopeMessage(metricsCurrent.monetaryScope)],
    playbook: monetaryAvailable ? buildPlaybook(finalizedCurrent, tagsCurrent, comparablePreviousTrades, comparablePreviousTags) : ['Kontowährungen vervollständigen oder nach genau einer Währung filtern; erst danach P&L-Muster bewerten.'],
    noteMoments: buildNoteMoments(dailyNotes, currentStart, currentEnd),
    tagRadar: scoped(monetaryAvailable ? buildTagRadar(finalizedCurrent, tagsCurrent) : []),
    errorClusters,
    tagDrift,
    tagCombinations: scoped(monetaryAvailable ? buildTagCombinations(finalizedCurrent, tagsCurrent) : []),
    tagHeatmap: { ...heatmap, cells: scoped(heatmap.cells) },
    setupInsights: scoped(monetaryAvailable ? buildReviewSetupInsights(finalizedCurrent) : []),
    importInsights: scoped(monetaryAvailable ? buildReviewImportInsights(finalizedCurrent) : []),
    reviewLayer: { ...reviewLayer, highlights: scoped(reviewLayer.highlights) },
    sessionDraft: {
      ...buildReviewSnapshotSummary(tradesCurrent, tagsCurrent),
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
