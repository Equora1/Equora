import { describe, expect, it } from 'vitest'
import { startOfJournalDay } from '@/lib/utils/journal-day'
import { buildDailyNoteFlowSummary } from '@/lib/utils/daily-notes'
import { buildCalendarSummary, getCalendarTradeDay, getCalendarFeaturedResult } from '@/lib/utils/calendar'
import type { Trade } from '@/lib/types/trade'
const trade: Trade = { id: 'sample', date: '2026-10-16', market: 'TEST', setup: 'Test', result: '+10 EUR', r: '', emotion: '', quality: 'B-Setup', session: '', concept: '', netPnL: 10, accountCurrency: 'EUR', partialExits: [{ percent: 50, price: 120 }] }
describe('calendar featured result preserves price versus money', () => {
  it('does not substitute manual money for a missing exit price', () => {
    expect(getCalendarFeaturedResult({ ...trade, effectiveExit: null })).toEqual({ label: 'Gespeicherter Ausstieg', value: '—' })
  })
  it.each([115, 117.5])('displays the stored price without weighting or claiming an average (%s)', (effectiveExit) => {
    const result = getCalendarFeaturedResult({ ...trade, effectiveExit })
    expect(result.label).toBe('Gespeicherter Ausstieg')
    expect(Number(result.value.replace(',', '.'))).toBe(effectiveExit)
  })
  it('keeps a monetary result and a genuine zero under a monetary label without partial exits', () => {
    expect(getCalendarFeaturedResult({ ...trade, partialExits: [], netPnL: 0 })).toEqual({ label: 'P&L', value: '+0,00 EUR' })
  })
  it('preserves unsupported currency status when the normalized unit is absent', () => {
    expect(getCalendarFeaturedResult({ ...trade, partialExits: [], accountCurrency: null, accountCurrencyStatus: 'unsupported' }).value).toBe('Währung nicht unterstützt')
  })
})

describe('Berlin calendar and daily note grouping', () => {
  it.each([
    ['2026-03-31T21:59:59Z', '2026-03-31'],
    ['2026-03-31T22:00:00Z', '2026-04-01'],
    ['2026-10-31T22:59:59Z', '2026-10-31'],
    ['2026-10-31T23:00:00Z', '2026-11-01'],
    ['2026-10-25T00:30:00Z', '2026-10-25'],
    ['2026-10-25T01:30:00Z', '2026-10-25'],
    ['14 Mär 2026', '2026-03-14'],
    ['2026-03-14', '2026-03-14'],
  ])('groups %s on %s in both languages', (tradeOccurredAt, day) => {
    const rows = [{ ...trade, tradeOccurredAt, captureStatus: 'complete' as const }]
    expect(buildCalendarSummary(rows)[0]).toMatchObject({ dateKey: day, tradeCount: 1, netPnL: 10 })
    for (const locale of ['de', 'en'] as const) {
      expect(buildDailyNoteFlowSummary(rows, [], day, getCalendarTradeDay, locale)).toMatchObject({ totalTrades: 1 })
    }
  })

  it('does not turn an invalid legacy date into a March trade', () => {
    expect(buildCalendarSummary([{ ...trade, tradeOccurredAt: '31 Feb 2026' }])).toEqual([])
  })

  it('keeps the recorded note and the numeric result through a language change', () => {
    const rows = [{ ...trade, captureStatus: 'complete' as const, tradeOccurredAt: '2026-03-31T22:00:00Z' }]
    const saved = { id: 'note', trade_date: '2026-04-01', title: 'Mein Handelstag', note: 'Eigene Beobachtung.', focus: 'Geduld', mood: 'Ruhig' }
    const de = buildDailyNoteFlowSummary(rows, [saved], saved.trade_date, getCalendarTradeDay, 'de')
    const en = buildDailyNoteFlowSummary(rows, [saved], saved.trade_date, getCalendarTradeDay, 'en')
    expect(en).toMatchObject({ existingNote: saved, noteStarter: saved.note, trustedPnL: de.trustedPnL, totalTrades: de.totalTrades })
    expect(en.headline).not.toBe(de.headline)
    expect(startOfJournalDay(saved.trade_date).getTime()).toBe(Date.parse(rows[0].tradeOccurredAt))
  })
})
