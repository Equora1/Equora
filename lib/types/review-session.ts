export type ReviewSessionType = 'spotlight' | 'review'
export type ReviewSessionPeriodPreset = '7d' | '14d' | '30d' | '90d'
export type ReviewSessionStatus = 'open' | 'watch' | 'closed'

export type SavedReviewSession = {
  id: string
  title: string
  note: string
  createdAt: string
  focusTitle: string | null
  focusDescription: string | null
  chips: string[]
  labels: string[]
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
  sessionType: ReviewSessionType
  sessionStatus: ReviewSessionStatus
  isPinned: boolean
  periodPreset: ReviewSessionPeriodPreset | null
  periodLabel: string | null
  periodStart: string | null
  periodEnd: string | null
  source: 'supabase' | 'mock'
}

export type SaveReviewSessionInput = {
  title: string
  note?: string
  focusTitle?: string | null
  focusDescription?: string | null
  chips?: string[]
  labels?: string[]
  tradeIds: string[]
  tradeCount: number
  visibleTradeCount: number
  netPnL?: number | null
  averageR?: number | null
  winRate?: number | null
  winners?: number
  losers?: number
  breakeven?: number
  topTags?: string[]
  bestTradeId?: string | null
  worstTradeId?: string | null
  sessionType?: ReviewSessionType
  sessionStatus?: ReviewSessionStatus
  isPinned?: boolean
  periodPreset?: ReviewSessionPeriodPreset | null
  periodLabel?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}

export type UpdateReviewSessionInput = {
  title: string
  note?: string
  labels?: string[]
  sessionStatus?: ReviewSessionStatus
  isPinned?: boolean
}


export type ReviewSessionsPageResult = {
  sessions: SavedReviewSession[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
