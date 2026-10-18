import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import type { SavedReviewSession } from '@/lib/types/review-session'
import { ReviewSessionsHub } from '@/components/review/review-sessions-hub'
import { ReviewRhythmCard } from '@/components/review/review-rhythm-card'
import { ReviewSummaryCard } from '@/components/review/review-summary-card'
import { buildReviewSnapshots } from '@/lib/utils/review'
import { buildDailyNoteFlowSummary } from '@/lib/utils/daily-notes'
import { buildReviewTitle, formatReviewCalendarDay, formatReviewSavedDate, formatReviewSavedDay, getLatestReviewDateKey, getReviewTradeDateKey } from '@/lib/utils/review-display'

vi.mock('next/link', () => ({ default: ({ href, children, prefetch, ...props }: any) => React.createElement('a', { href, ...props }, children) }))
vi.mock('@/app/actions/review-sessions', () => ({ saveReviewSession: vi.fn(), updateReviewSession: vi.fn(), deleteReviewSession: vi.fn() }))

const originalTimezone = process.env.TZ
afterEach(() => { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; vi.useRealTimers() })
const zones = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati']
const rows: Trade[] = [{ id:'synthetic-trade',date:'2026-05-08T22:30:00Z',tradeOccurredAt:'2026-05-08T22:30:00Z',market:'TEST',setup:'Synthetic',result:'',r:'',emotion:'',quality:'B-Setup',session:'London',concept:'',captureStatus:'complete',netPnL:0,accountCurrency:'EUR' }]
const saved: SavedReviewSession = {id:'synthetic-review',title:'Synthetischer Review',note:'',createdAt:'2026-10-17T22:52:00Z',focusTitle:null,focusDescription:null,chips:[],labels:[],tradeIds:[],tradeCount:0,visibleTradeCount:0,netPnL:0,currency:null,monetaryScopeKind:'empty',averageR:null,winRate:0,winners:0,losers:0,breakeven:0,topTags:[],bestTradeId:null,worstTradeId:null,sessionType:'review',sessionStatus:'open',isPinned:false,periodPreset:'7d',periodLabel:null,periodStart:null,periodEnd:null,source:'mock'}

describe.sequential('Review display has an explicit day contract across server and browser zones', () => {
  it.each(zones)('formats saved instants and civil days independently of %s', zone => {
    process.env.TZ = zone
    expect(formatReviewSavedDay(saved.createdAt)).toBe('So., 18.10.')
    expect(formatReviewSavedDate(saved.createdAt)).toContain('18.10.2026')
    expect(formatReviewSavedDate(saved.createdAt)).toContain('00:52')
    expect(formatReviewCalendarDay('2026-05-09')).toBe('Samstag, 09. Mai 2026')
    expect(getReviewTradeDateKey(rows[0])).toBe('2026-05-09')
    expect(getReviewTradeDateKey({...rows[0],tradeOccurredAt:undefined,date:'2026-05-08'})).toBe('2026-05-08')
    expect(getReviewTradeDateKey({...rows[0],tradeOccurredAt:undefined,date:'14 Mär 2026'})).toBe('2026-03-14')
  })

  it.each([
    ['2026-03-28T22:59:00Z','2026-03-28'], ['2026-03-28T23:00:00Z','2026-03-29'],
    ['2026-03-29T00:30:00Z','2026-03-29'], ['2026-03-29T01:30:00Z','2026-03-29'],
    ['2026-10-24T21:59:00Z','2026-10-24'], ['2026-10-24T22:00:00Z','2026-10-25'],
    ['2026-10-25T00:30:00Z','2026-10-25'], ['2026-10-25T01:30:00Z','2026-10-25'],
    ['2026-05-09T00:30:00+02:00','2026-05-09'],
  ])('assigns %s to Berlin day %s including DST boundaries', (instant, day) => {
    for (const zone of zones) { process.env.TZ=zone; expect(getReviewTradeDateKey({...rows[0],tradeOccurredAt:instant})).toBe(day) }
  })

  it('uses the same day selector for the active day, count and unchanged metric calculation', () => {
    process.env.TZ='UTC'
    const before=structuredClone(rows),day=getLatestReviewDateKey(rows,'2026-10-18')
    const selected=buildDailyNoteFlowSummary(rows,[],day,getReviewTradeDateKey)
    expect(day).toBe('2026-05-09'); expect(selected.totalTrades).toBe(1); expect(selected.trustedPnL).toBe(0)
    expect(selected.dayTrades[0].id).toBe('synthetic-trade'); expect(rows).toEqual(before)
    // Other daily-note callers retain their previous default selector.
    expect(buildDailyNoteFlowSummary(rows,[],'2026-05-08').totalTrades).toBe(1)
    expect(buildDailyNoteFlowSummary(rows,[],'2026-05-09').totalTrades).toBe(0)
  })

  it('pins empty-day fallback and title to the server-provided reference across midnight', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T21:59:59Z'))
    const reference='2026-10-18',title=buildReviewTitle('14 Tage',reference)
    vi.setSystemTime(new Date('2026-10-18T22:00:01Z'))
    expect(buildReviewTitle('14 Tage',reference)).toBe(title)
    expect(title).toBe('Review 14 Tage · 18.10.2026')
    expect(getLatestReviewDateKey([],reference)).toBe(reference)
  })

  it.each(['collection','rhythm','summary'] as const)('renders identical real %s component markup across five machine zones', scenario => {
    const snapshots=buildReviewSnapshots(rows,[],[],'mock')
    const render=()=>renderToStaticMarkup(scenario==='collection'
      ? <ReviewSessionsHub initialSessions={[saved]} source="mock" />
      : scenario==='rhythm'
        ? <ReviewRhythmCard trades={rows} weeklySnapshot={snapshots['7d']} referenceDateKey="2026-10-18" />
        : <ReviewSummaryCard snapshots={snapshots} source="mock" savedSessions={[saved]} initialPreset="14d" referenceDateKey="2026-10-18" />)
    process.env.TZ='UTC'; const expected=render()
    for(const zone of zones){process.env.TZ=zone;expect(render()).toBe(expected)}
    if(scenario==='rhythm')expect(expected).toContain('Samstag, 09. Mai 2026')
    if(scenario==='summary')expect(expected).toContain('Review 14 Tage · 18.10.2026')
  })
})
