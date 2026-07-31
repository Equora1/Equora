import type { Trade } from '@/lib/types/trade'
import type { TagStat } from '@/lib/types/tag'

export type ReviewTone = 'emerald' | 'red' | 'orange'

export type ReviewStat = {
  label: string
  value: string
  hint: string
  tone: ReviewTone
}

export type ReviewSignal = {
  label: string
  value: string
  detail: string
  href?: string
}

export type ReviewNoteMoment = {
  title: string
  meta: string
  body: string
}

export type ReviewTagRadarItem = {
  label: string
  value: string
  detail: string
  tone: ReviewTone
  href?: string
}

export type ReviewTagComparisonItem = {
  label: string
  value: string
  detail: string
  tone: ReviewTone
  href?: string
}

export type ReviewTagCombinationItem = {
  label: string
  value: string
  detail: string
  tone: ReviewTone
  href?: string
}

export type ReviewTagHeatmapCell = {
  weekday: string
  tag: string
  tradeCount: number
  netPnL: number
  intensity: number
  tone: ReviewTone
  href?: string
}

export type ReviewTagHeatmap = {
  weekdays: string[]
  tags: string[]
  cells: ReviewTagHeatmapCell[]
}

export type ReviewLayerSnapshot = {
  reviewedTrades: number
  totalTrades: number
  coverage: number
  summary: string
  headline: string
  highlights: ReviewTagRadarItem[]
  checklist: string[]
  latestLesson: string | null
}

export type ReviewPeriodPreset = '7d' | '14d' | '30d' | '90d'

export const REVIEW_PERIOD_OPTIONS: { key: ReviewPeriodPreset; label: string; hint: string; days: number }[] = [
  { key: '7d', label: '7 Tage', hint: 'Wochenfokus', days: 7 },
  { key: '14d', label: '14 Tage', hint: 'Zwei Wochen', days: 14 },
  { key: '30d', label: '30 Tage', hint: 'Monatsblick', days: 30 },
  { key: '90d', label: '90 Tage', hint: 'Quartalsmuster', days: 90 },
]

export type ReviewSnapshot = {
  periodPreset: ReviewPeriodPreset
  periodPresetLabel: string
  periodLabel: string
  previousPeriodLabel: string
  previousNetPnL: number
  periodStart: string
  periodEnd: string
  sourceLabel: string
  headline: string
  summary: string
  stats: ReviewStat[]
  topPerformers: ReviewSignal[]
  weakSpots: ReviewSignal[]
  patterns: string[]
  playbook: string[]
  noteMoments: ReviewNoteMoment[]
  tagRadar: ReviewTagRadarItem[]
  errorClusters: ReviewSignal[]
  tagDrift: ReviewTagComparisonItem[]
  tagCombinations: ReviewTagCombinationItem[]
  tagHeatmap: ReviewTagHeatmap
  setupInsights: ReviewTagRadarItem[]
  importInsights: ReviewTagRadarItem[]
  reviewLayer: ReviewLayerSnapshot
  sessionDraft: {
    tradeIds: string[]
    tradeCount: number
    visibleTradeCount: number
    netPnL: number
    averageR: number
    winRate: number
    winners: number
    losers: number
    breakeven: number
    topTags: string[]
    bestTradeId: string | null
    worstTradeId: string | null
  }
}

export type ReviewSnapshotCollection = Record<ReviewPeriodPreset, ReviewSnapshot>

export type ReviewTradeDrilldown = {
  search?: string
  market?: string
  setup?: string
  session?: string
  concept?: string
  quality?: string
  emotion?: string
  tag?: string
  tags?: string[]
  weekday?: string
  tagging?: 'Getaggt' | 'Ungetaggt'
  outcome?: 'Gewinner' | 'Verlierer' | 'Breakeven'
  direction?: 'Long' | 'Short' | 'Neutral'
  reviewFocus?: string
}

export type TagComparison = {
  tag: string
  current: TagStat | null
  previous: TagStat | null
  pnlDelta: number
  winRateDelta: number
  tradeDelta: number
}

export type ReviewBucket = {
  key: string
  trades: Trade[]
  metrics: {
    netPnL: number
    winRate: number
    totalTrades: number
    profitFactor: number
    averageR: number
  }
}
