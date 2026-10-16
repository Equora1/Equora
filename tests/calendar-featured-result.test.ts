import { describe, expect, it } from 'vitest'
import { getCalendarFeaturedResult } from '@/lib/utils/calendar'
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
