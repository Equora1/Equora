import { createSupabaseAuthServerClient } from '@/lib/supabase/server-auth'
import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ReviewSessionRow } from '@/lib/types/db'
import type { ReviewSessionPeriodPreset, ReviewSessionStatus, ReviewSessionType, ReviewSessionsPageResult, SavedReviewSession } from '@/lib/types/review-session'
import { parseTradingNumber } from '@/lib/utils/calculations'

type ReviewSessionsQueryOptions = {
  page?: number
  pageSize?: number
  search?: string
  sessionType?: 'all' | ReviewSessionType
  periodPreset?: 'all' | ReviewSessionPeriodPreset
  sessionStatus?: 'all' | ReviewSessionStatus
  pinnedOnly?: boolean
}

export function mapReviewSessionRow(
  row: ReviewSessionRow,
  source: 'supabase' | 'mock' = 'supabase',
): SavedReviewSession {
  return {
    id: row.id,
    title: row.title,
    note: row.note ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    focusTitle: row.focus_title ?? null,
    focusDescription: row.focus_description ?? null,
    chips: Array.isArray(row.chips) ? row.chips.filter(Boolean) : [],
    labels: Array.isArray(row.labels) ? row.labels.filter(Boolean) : [],
    tradeIds: Array.isArray(row.trade_ids) ? row.trade_ids.filter(Boolean) : [],
    tradeCount: row.trade_count ?? 0,
    visibleTradeCount: row.visible_trade_count ?? row.trade_count ?? 0,
    netPnL: parseTradingNumber(row.net_pnl) ?? 0,
    averageR: parseTradingNumber(row.average_r) ?? 0,
    winRate: parseTradingNumber(row.win_rate) ?? 0,
    winners: row.winners ?? 0,
    losers: row.losers ?? 0,
    breakeven: row.breakeven ?? 0,
    topTags: Array.isArray(row.top_tags) ? row.top_tags.filter(Boolean) : [],
    bestTradeId: row.best_trade_id ?? null,
    worstTradeId: row.worst_trade_id ?? null,
    sessionType: row.session_type ?? 'spotlight',
    sessionStatus: row.session_status ?? 'open',
    isPinned: Boolean(row.is_pinned),
    periodPreset: row.period_preset ?? null,
    periodLabel: row.period_label ?? null,
    periodStart: row.period_start ?? null,
    periodEnd: row.period_end ?? null,
    source,
  }
}

function clampPage(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 1
  return Math.max(1, Math.floor(value))
}

function clampPageSize(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return 24
  return Math.min(60, Math.max(1, Math.floor(value)))
}

function applyQueryOptions(query: any, options: ReviewSessionsQueryOptions) {
  let nextQuery = query

  if (options.sessionType && options.sessionType !== 'all') {
    nextQuery = nextQuery.eq('session_type', options.sessionType)
  }

  if (options.periodPreset && options.periodPreset !== 'all') {
    nextQuery = nextQuery.eq('period_preset', options.periodPreset)
  }

  if (options.sessionStatus && options.sessionStatus !== 'all') {
    nextQuery = nextQuery.eq('session_status', options.sessionStatus)
  }

  if (options.pinnedOnly) {
    nextQuery = nextQuery.eq('is_pinned', true)
  }

  const search = options.search?.trim()
  if (search) {
    const safe = search.replace(/[,%()]/g, ' ').trim()
    nextQuery = nextQuery.or(`title.ilike.%${safe}%,note.ilike.%${safe}%,focus_title.ilike.%${safe}%,focus_description.ilike.%${safe}%`)
  }

  return nextQuery
}

export async function getReviewSessionsPageServer(
  userId?: string | null,
  options: ReviewSessionsQueryOptions = {},
): Promise<ReviewSessionsPageResult> {
  const page = clampPage(options.page)
  const pageSize = clampPageSize(options.pageSize)

  if (!hasSupabaseClientEnv()) {
    return { sessions: [], total: 0, page, pageSize, totalPages: 1 }
  }

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const scopedUserId = userId ?? user?.id ?? null
    if (!scopedUserId || user?.id !== scopedUserId) {
      return { sessions: [], total: 0, page, pageSize, totalPages: 1 }
    }

    const baseCountQuery = supabase
      .from('review_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', scopedUserId)

    const countQuery = applyQueryOptions(baseCountQuery, options)
    const { count, error: countError } = await countQuery

    if (countError) {
      console.error('Review sessions count failed:', countError)
      return { sessions: [], total: 0, page, pageSize, totalPages: 1 }
    }

    const total = count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(page, totalPages)
    const from = (safePage - 1) * pageSize
    const to = from + pageSize - 1

    const baseDataQuery = supabase
      .from('review_sessions')
      .select('*')
      .eq('user_id', scopedUserId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    const dataQuery = applyQueryOptions(baseDataQuery, options)
    const { data, error } = await dataQuery

    if (error || !data) {
      console.error('Review sessions fetch failed:', error)
      return { sessions: [], total, page: safePage, pageSize, totalPages }
    }

    return {
      sessions: (data as ReviewSessionRow[]).map((row) => mapReviewSessionRow(row, 'supabase')),
      total,
      page: safePage,
      pageSize,
      totalPages,
    }
  } catch (error) {
    console.error('Review sessions fetch failed:', error)
    return { sessions: [], total: 0, page, pageSize, totalPages: 1 }
  }
}

export async function getReviewSessionsServer(userId?: string | null): Promise<SavedReviewSession[]> {
  const result = await getReviewSessionsPageServer(userId)
  return result.sessions
}

export async function getReviewSessionByIdServer(sessionId: string, userId?: string | null): Promise<SavedReviewSession | null> {
  if (!hasSupabaseClientEnv() || !sessionId.trim()) return null

  try {
    const supabase = await createSupabaseAuthServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const scopedUserId = userId ?? user?.id ?? null
    if (!scopedUserId || user?.id !== scopedUserId) return null

    const { data, error } = await supabase
      .from('review_sessions')
      .select('*')
      .eq('user_id', scopedUserId)
      .eq('id', sessionId)
      .single()

    if (error || !data) {
      console.error('Review session fetch failed:', error)
      return null
    }

    return mapReviewSessionRow(data as ReviewSessionRow, 'supabase')
  } catch (error) {
    console.error('Review session fetch failed:', error)
    return null
  }
}
