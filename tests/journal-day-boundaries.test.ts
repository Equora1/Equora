import { afterEach, describe, expect, it } from 'vitest'
import { journalPeriodEndingOn, shiftJournalDay, startOfJournalDay } from '@/lib/utils/journal-day'
import { buildStreakMetrics } from '@/lib/utils/analytics'
import { buildReviewSnapshot } from '@/lib/utils/review'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { selectReviewDrilldownTrades } from '@/lib/utils/review-drilldown-scope'
import { formatTradeDateLabel } from '@/lib/utils/date-format'
import { getWeekdayLabel } from '@/lib/utils/review-helpers'
import { buildNoteMoments } from '@/lib/utils/review-summary-builders'
import { REVIEW_CALCULATION_VERSION } from '@/lib/utils/review-snapshot-summary'
const initialTZ = process.env.TZ
afterEach(() => { if (initialTZ === undefined) delete process.env.TZ; else process.env.TZ = initialTZ })
function trade(id: string, at: string) {
  return mapTradeRowToTrade({ id, created_at: at, captured_at: at, market: 'TEST', setup: 'Test', net_pnl: 1, pnl_mode: 'manual', account_currency: 'USDT', capture_status: 'complete' } as any)
}
describe.each(['UTC', 'Europe/Berlin', 'America/New_York'])('Berlin calendar independent of host TZ %s', zone => {
  it.each([
    ['2026-01-01T23:30:00Z', '2026-01-01T23:00:00Z', '2026-01-01T00:15:00Z'],
    ['2026-07-01T22:30:00Z', '2026-07-01T22:00:00Z', '2026-07-01T00:15:00Z'],
  ])('counts Today on the Berlin day at %s', (now, inside, outside) => {
    process.env.TZ = zone
    const result = buildStreakMetrics([trade('inside', inside), trade('outside', outside)], new Date(now))
    expect(result).toMatchObject({ todayTrades: 1, todayWins: 1, todayLosses: 0 })
  })
  it('selects current/previous review, stored metadata and drilldown at the same Berlin boundaries', () => {
    process.env.TZ = zone
    const trades = [trade('previous', '2026-05-02T21:59:59.999Z'), trade('first', '2026-05-02T22:00:00.000Z'), trade('latest', '2026-05-08T22:30:00.000Z')]
    const snapshot = buildReviewSnapshot(trades, [], [], 'supabase')
    expect(snapshot.periodStart).toBe('2026-05-02T22:00:00.000Z')
    expect(snapshot.periodEnd).toBe('2026-05-09T21:59:59.999Z')
    expect(snapshot.periodLabel).toBe('03 Mai 2026 bis 09 Mai 2026')
    expect(snapshot.previousPeriodLabel).toBe('26 Apr 2026 bis 02 Mai 2026')
    expect(snapshot.sessionDraft.tradeIds.sort()).toEqual(['first', 'latest'])
    expect(snapshot.previousNetPnL).toBe(1)
    expect(selectReviewDrilldownTrades(trades, { from: snapshot.periodStart, to: snapshot.periodEnd, calculation: REVIEW_CALCULATION_VERSION }).map(t => t.id).sort()).toEqual(['first', 'latest'])
    expect(formatTradeDateLabel('2026-05-08T22:30:00Z')).toBe('09 Mai 2026')
    expect(getWeekdayLabel(trades[2])).toBe('Samstag')
  })
  it.each([['2026-03-29', 23], ['2026-10-25', 25]] as const)('uses the actual %s day length of %s hours', (day, hours) => {
    process.env.TZ = zone
    const start = startOfJournalDay(day), next = startOfJournalDay(shiftJournalDay(day, 1))
    expect((next.getTime() - start.getTime()) / 3600000).toBe(hours)
    const window = journalPeriodEndingOn(new Date(`${day}T12:00:00Z`), 1)
    expect(window.start.toISOString()).toBe(start.toISOString())
    expect(window.end.getTime() + 1).toBe(next.getTime())
    expect(window.previousEnd.getTime() + 1).toBe(start.getTime())
    const samples = [trade('before', new Date(start.getTime() - 1).toISOString()), trade('start', start.toISOString()), trade('end', window.end.toISOString()), trade('after', next.toISOString())]
    const selected = selectReviewDrilldownTrades(samples, { from: window.start.toISOString(), to: window.end.toISOString(), calculation: REVIEW_CALCULATION_VERSION })
    expect(selected.map(t => t.id)).toEqual(['start', 'end'])
    const notes = [shiftJournalDay(day, -1), day, shiftJournalDay(day, 1)].map((key, i) => ({ id: String(i), trade_date: key, title: key }))
    expect(buildNoteMoments(notes as any, window.start, window.end).map(n => n.title)).toEqual([day])
  })
  it('moves calendar years and months without depending on elapsed hours', () => {
    process.env.TZ = zone
    const period = journalPeriodEndingOn(new Date('2026-01-01T23:30:00Z'), 7)
    expect(formatTradeDateLabel(period.start)).toBe('27 Dez 2025')
    expect(formatTradeDateLabel(period.end)).toBe('02 Jan 2026')
    expect(shiftJournalDay('2026-03-01', -1)).toBe('2026-02-28')
  })
})
