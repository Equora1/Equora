import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getReviewCheckInSummaries } from '@/lib/server/review-check-in'
import { journalPeriodEndingOn } from '@/lib/utils/journal-day'

const request = vi.hoisted(() => vi.fn<typeof fetch>())
vi.mock('@/lib/supabase/server-auth', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://check-in-fixture.invalid', 'test-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: request },
  })
  return { createSupabaseAuthServerClient: async () => client }
})

function reviewWindow(days: number) {
  const { start, end } = journalPeriodEndingOn(new Date('2026-10-25T01:15:00Z'), days)
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() }
}

const snapshots = { '7d': reviewWindow(7), '14d': reviewWindow(14), '30d': reviewWindow(30), '90d': reviewWindow(90) }
const rating = (day: string, value: number | null, noTrades = false) => ({
  trade_date: day, plan_adherence: value, no_trades: noTrades,
})

function respond(rows: unknown[], total = rows.length) {
  const range = rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`
  request.mockResolvedValueOnce(new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json', 'Content-Range': range },
  }))
}

beforeEach(() => request.mockReset())

describe('check-in summaries read only the owner’s after-trading days', () => {
  it('uses one exact, bounded read and groups inclusive Berlin days for every preset', async () => {
    respond([
      rating('2026-07-28', 3),
      rating('2026-10-18', 2),
      rating('2026-10-19', 4),
      rating('2026-10-22', null),
      rating('2026-10-24', null, true),
      rating('2026-10-25', 5),
    ])
    expect(await getReviewCheckInSummaries('owner-a', snapshots)).toEqual({
      '7d': { ratedDays: 2, averageAdherence: 4.5, reportedNoTradeDays: 1 },
      '14d': { ratedDays: 3, averageAdherence: 11 / 3, reportedNoTradeDays: 1 },
      '30d': { ratedDays: 3, averageAdherence: 11 / 3, reportedNoTradeDays: 1 },
      '90d': { ratedDays: 4, averageAdherence: 3.5, reportedNoTradeDays: 1 },
    })
    expect(request).toHaveBeenCalledOnce()
    const [input, options] = request.mock.calls[0]
    const url = new URL(String(input))
    expect(url.pathname).toBe('/rest/v1/trading_check_ins')
    expect(url.searchParams.get('select')).toBe('trade_date,plan_adherence,no_trades')
    expect(url.searchParams.get('user_id')).toBe('eq.owner-a')
    expect(url.searchParams.get('phase')).toBe('eq.after')
    expect(url.searchParams.getAll('trade_date')).toEqual(['gte.2026-07-28', 'lte.2026-10-25'])
    expect(url.searchParams.get('limit')).toBe('90')
    expect(options?.method).toBe('GET')
    expect(new Headers(options?.headers).get('prefer')).toContain('count=exact')
  })

  it('distinguishes a completed empty read from unavailable values', async () => {
    respond([])
    expect((await getReviewCheckInSummaries('owner-a', snapshots))?.['7d'])
      .toEqual({ ratedDays: 0, averageAdherence: null, reportedNoTradeDays: 0 })
    respond([rating('2026-10-25', null, true)])
    expect((await getReviewCheckInSummaries('owner-a', snapshots))?.['7d'])
      .toEqual({ ratedDays: 0, averageAdherence: null, reportedNoTradeDays: 1 })
  })

  it.each([
    [rating('2026-10-26', 4)],
    [rating('2026-10-25', 6)],
    [rating('2026-10-25', 4, true)],
    [rating('2026-10-25', 2), rating('2026-10-25', 5)],
  ].map((rows) => ({ rows })))('declines invalid or duplicate days %#', async ({ rows }) => {
    respond(rows)
    expect(await getReviewCheckInSummaries('owner-a', snapshots)).toBeNull()
  })

  it('declines partial results and a failed read', async () => {
    respond([rating('2026-10-25', 4)], 2)
    expect(await getReviewCheckInSummaries('owner-a', snapshots)).toBeNull()
    request.mockRejectedValueOnce(new Error('fixture unavailable'))
    expect(await getReviewCheckInSummaries('owner-a', snapshots)).toBeNull()
  })

  it('does not read when an existing review window is invalid', async () => {
    const invalid = { ...snapshots, '7d': { ...snapshots['7d'], periodStart: 'invalid' } }
    expect(await getReviewCheckInSummaries('owner-a', invalid)).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
})
