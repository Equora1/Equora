import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import { countActiveTradeTableFilters, createDefaultTradeTableFilters, filterTradeTableRows } from '@/lib/utils/trade-table'
import { createTradeTableDateRange, getTradeTableDateRangeError } from '@/lib/utils/trade-table-date-range'

function trade(id: string, date: string, overrides: Partial<Trade> = {}): Trade {
  return { id, date, market: 'BTC/USD', setup: 'Breakout', session: 'London', concept: 'Breakout', emotion: 'Ruhig', quality: 'A-Setup', result: 'Gewinner', r: '+2R', ...overrides }
}

const filters = (dateFrom = '', dateTo = '') => ({ ...createDefaultTradeTableFilters(), dateFrom, dateTo })
const rows = [trade('before', '2026-10-11T21:59:59Z'), trade('start', '2026-10-11T22:00:00Z'), trade('end', '2026-10-12T21:59:59.999Z'), trade('after', '2026-10-12T22:00:00Z')]
const ids = (selection: Trade[]) => selection.map((row) => row.id)

describe('journal date range in Europe/Berlin', () => {
  it('includes both calendar-day boundaries, including the final millisecond', () => {
    expect(ids(filterTradeTableRows(rows, {}, filters('2026-10-12', '2026-10-12')))).toEqual(['start', 'end'])
  })
  it('supports a lower bound alone', () => {
    expect(ids(filterTradeTableRows(rows, {}, filters('2026-10-12')))).toEqual(['start', 'end', 'after'])
  })
  it('supports an upper bound alone', () => {
    expect(ids(filterTradeTableRows(rows, {}, filters('', '2026-10-12')))).toEqual(['before', 'start', 'end'])
  })
  it.each([
    ['2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T21:59:59.999Z', '2026-03-29T22:00:00Z'],
    ['2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T22:59:59.999Z', '2026-10-25T23:00:00Z'],
  ])('includes the complete clock-change day %s', (day, start, end, next) => {
    const selection = [trade('start', start), trade('end', end), trade('next', next)]
    expect(ids(filterTradeTableRows(selection, {}, filters(day, day)))).toEqual(['start', 'end'])
  })
  it('uses the trade timestamp ahead of capture/create/display dates', () => {
    const row = trade('priority', '2026-10-01', { tradeOccurredAt: '2026-10-12T10:00:00Z', capturedAt: '2026-10-13T10:00:00Z', createdAt: '2026-10-14T10:00:00Z' })
    expect(filterTradeTableRows([row], {}, filters('2026-10-12', '2026-10-12'))).toEqual([row])
  })
  it('uses the existing capture/create/date fallback order', () => {
    const selection = [trade('capture', '', { capturedAt: '2026-10-12T10:00:00Z' }), trade('create', '', { createdAt: '2026-10-12T10:00:00Z' }), trade('date', '2026-10-12')]
    expect(filterTradeTableRows(selection, {}, filters('2026-10-12', '2026-10-12'))).toEqual(selection)
  })
  it('excludes missing/invalid timestamps only when a date range is active', () => {
    const selection = [trade('missing', ''), trade('bad', 'not-a-date')]
    expect(filterTradeTableRows(selection, {}, filters('2026-10-12'))).toEqual([])
    expect(filterTradeTableRows(selection, {}, filters())).toEqual(selection)
  })
  it('shows an explicit error and no results for a reversed range', () => {
    const reversed = filters('2026-10-13', '2026-10-12')
    expect(getTradeTableDateRangeError(reversed)).toBe('Das Von-Datum muss vor oder am Bis-Datum liegen.')
    expect(filterTradeTableRows(rows, {}, reversed)).toEqual([])
  })
  it.each(['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'garbage', '0000-01-01'])('rejects invalid calendar input %s', (date) => {
    expect(getTradeTableDateRangeError(filters(date))).toBe('Bitte gültige Datumswerte eingeben.')
    expect(getTradeTableDateRangeError(filters('', date))).toBeTruthy()
    expect(filterTradeTableRows(rows, {}, filters(date))).toEqual([])
  })
  it('accepts a leap day and equal endpoints', () => {
    expect(getTradeTableDateRangeError(filters('2024-02-29', '2024-02-29'))).toBeNull()
  })
  it('combines date range with multiword search, status and required tags', () => {
    const row = trade('match', '2026-10-12T10:00:00Z', { captureStatus: 'complete' })
    const combined = { ...filters('2026-10-12', '2026-10-12'), search: 'BTC London', status: 'Vollständig' as const, requiredTags: ['Geduldig'] }
    expect(filterTradeTableRows([row], { match: ['Geduldig'] }, combined)).toEqual([row])
    expect(filterTradeTableRows([row], { match: ['Geduldig'] }, { ...combined, search: 'BTC Tokyo' })).toEqual([])
    expect(filterTradeTableRows([row], {}, combined)).toEqual([])
    expect(filterTradeTableRows([row], { match: ['Geduldig'] }, { ...combined, status: 'Offen' })).toEqual([])
  })
  it('counts a date range as one filter and clears it with defaults', () => {
    expect(countActiveTradeTableFilters(filters('2026-10-12'))).toBe(1)
    expect(countActiveTradeTableFilters(filters('', '2026-10-12'))).toBe(1)
    expect(countActiveTradeTableFilters(filters('2026-10-12', '2026-10-13'))).toBe(1)
    expect(countActiveTradeTableFilters(createDefaultTradeTableFilters())).toBe(0)
  })
  it('does not mutate the source rows, tags or filters', () => {
    const input = { rows, tags: { start: ['Geduldig'] }, filters: filters('2026-10-12', '2026-10-12') }
    const before = structuredClone(input)
    filterTradeTableRows(input.rows, input.tags, input.filters)
    expect(input).toEqual(before)
  })
})

describe('journal calendar presets', () => {
  it('uses Berlin today even when UTC is still the previous day', () => {
    expect(createTradeTableDateRange('today', new Date('2026-10-13T22:30:00Z'))).toEqual({ dateFrom: '2026-10-14', dateTo: '2026-10-14' })
  })
  it.each([
    ['2026-03-30T10:00:00Z', '2026-03-24', '2026-03-30'],
    ['2026-10-26T10:00:00Z', '2026-10-20', '2026-10-26'],
    ['2026-01-03T10:00:00Z', '2025-12-28', '2026-01-03'],
  ])('covers exactly seven calendar dates for %s', (now, from, to) => {
    expect(createTradeTableDateRange('last-seven-days', new Date(now))).toEqual({ dateFrom: from, dateTo: to })
  })
  it('runs from month start through Berlin today, including the first day', () => {
    expect(createTradeTableDateRange('this-month', new Date('2026-09-30T22:30:00Z'))).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-01' })
    expect(createTradeTableDateRange('this-month', new Date('2026-10-14T10:00:00Z'))).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-14' })
  })
})
