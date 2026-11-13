import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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
  options?: { preset?: ReviewPeriodPreset; locale?: JournalLocale }
): ReviewSnapshot {
  const locale = options?.locale ?? 'de'
  const text = journalText(locale)
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
  const errorClusters = scoped(monetaryAvailable ? buildErrorClusters(finalizedCurrent, tagsCurrent, locale) : [])
  const tagDrift = scoped(periodsComparable ? buildTagDrift(finalizedCurrent, tagsCurrent, finalizedPrevious, tagsPrevious, locale) : [])
  const comparablePreviousTrades = periodsComparable ? finalizedPrevious : []
  const comparablePreviousTags = periodsComparable ? tagsPrevious : []
  const headlineResult = !tradesCurrent.length
    ? buildHeadline(finalizedCurrent, metricsCurrent, tagDrift, errorClusters, locale)
    : monetaryAvailable
      ? buildHeadline(finalizedCurrent, metricsCurrent, tagDrift, errorClusters, locale)
      : {
          headline: metricsCurrent.monetaryScope.kind === 'empty' ? text('Trades erfasst, P&L noch offen', 'Trades recorded. P&L is pending.') : text('Geld-Auswertung wegen Währungsdaten gesperrt', 'P&L is unavailable due to currency information.'),
          summary: getMonetaryScopeMessage(metricsCurrent.monetaryScope, locale),
        }
  const reviewLayer = buildReviewLayerSnapshot(finalizedCurrent, locale)
  const heatmap = monetaryAvailable ? buildTagHeatmap(finalizedCurrent, tagsCurrent) : { weekdays: [], tags: [], cells: [] }
  const unavailableSignal: ReviewSignal[] = [{
    label: text('Geld-Auswertung', 'P&L analysis'),
    value: metricsCurrent.monetaryScope.kind === 'empty' ? text('P&L offen', 'P&L pending') : text('Gesperrt', 'Unavailable'),
    detail: getMonetaryScopeMessage(metricsCurrent.monetaryScope, locale),
  }]

  return {
    periodPreset: preset,
    periodPresetLabel: presetConfig.label,
    periodLabel: buildWindowLabel(currentStart, currentEnd),
    previousPeriodLabel: buildWindowLabel(previousStart, previousEnd),
    ...(locale === 'en' ? {
      displayPeriod: { current: buildWindowLabel(currentStart, currentEnd, locale), previous: buildWindowLabel(previousStart, previousEnd, locale) },
    } : {}),
    previousNetPnL: metricsPrevious.netPnL,
    currency: metricsCurrent.currency,
    monetaryScopeKind: metricsCurrent.monetaryScope.kind,
    periodStart: currentStart.toISOString(),
    periodEnd: currentEnd.toISOString(),
    sourceLabel: source === 'supabase' ? 'Live-Review' : 'Demo-Review',
    headline: headlineResult.headline,
    summary: headlineResult.summary,
    stats: buildSummary(metricsCurrent, metricsPrevious, locale),
    topPerformers: scoped(monetaryAvailable ? buildTopPerformers(finalizedCurrent, tagsCurrent, locale) : unavailableSignal),
    weakSpots: scoped(monetaryAvailable ? buildWeakSpots(finalizedCurrent, tagsCurrent, locale) : unavailableSignal),
    patterns: monetaryAvailable ? buildPatterns(finalizedCurrent, tagsCurrent, comparablePreviousTrades, comparablePreviousTags, locale) : [getMonetaryScopeMessage(metricsCurrent.monetaryScope, locale)],
    playbook: monetaryAvailable ? buildPlaybook(finalizedCurrent, tagsCurrent, comparablePreviousTrades, comparablePreviousTags, locale) : [text('Kontowährungen vervollständigen oder nach genau einer Währung filtern; erst danach P&L-Muster bewerten.', 'Complete the currency information or filter to one currency before reviewing P&L patterns.')],
    noteMoments: buildNoteMoments(dailyNotes, currentStart, currentEnd, locale),
    tagRadar: scoped(monetaryAvailable ? buildTagRadar(finalizedCurrent, tagsCurrent, locale) : []),
    errorClusters,
    tagDrift,
    tagCombinations: scoped(monetaryAvailable ? buildTagCombinations(finalizedCurrent, tagsCurrent, locale) : []),
    tagHeatmap: { ...heatmap, cells: scoped(heatmap.cells) },
    setupInsights: scoped(monetaryAvailable ? buildReviewSetupInsights(finalizedCurrent, locale) : []),
    importInsights: scoped(monetaryAvailable ? buildReviewImportInsights(finalizedCurrent, locale) : []),
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
  source: 'supabase' | 'mock',
  locale: JournalLocale = 'de',
): ReviewSnapshotCollection {
  return REVIEW_PERIOD_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.key] = buildReviewSnapshot(trades, tradeTags, dailyNotes, source, { preset: option.key, locale })
    return accumulator
  }, {} as ReviewSnapshotCollection)
}
