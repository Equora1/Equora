import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import { buildTradeTagMap, buildTradeTableView, createDefaultTradeTableFilters, filterTradeTableRows, getTradeWeekdayLabel, paginateTradeTableRows, resolveTradeTableSort, sortTradeTableRows } from '@/lib/utils/trade-table'
import { buildTradeTableHref, parseTradeTableQuery } from '@/lib/utils/trade-table-query'

const rows: Trade[] = Array.from({ length: 95 }, (_, i) => ({
  id: `trade-${i}`, date: '2026-10-12T10:00:00Z', market: i >= 60 ? 'BTC/USD' : 'DAX',
  setup: 'Breakout', emotion: 'Ruhig', quality: 'A-Setup', session: 'London', concept: 'SMC',
  result: '+1 EUR', r: '+1R', netPnL: i, rValue: i, captureStatus: 'complete', captureResult: 'winner',
}))

describe('whole journal filtering before pagination', () => {
  it('checks money comparability after excluding non-review trades', () => {
    const journal = [{ ...rows[0], accountCurrency: 'EUR' as const, netPnL: 10 }, { ...rows[1], accountCurrency: 'EUR' as const, netPnL: 20 }, { ...rows[2], accountCurrency: 'USD' as const, netPnL: 100 }]
    const view = buildTradeTableView(journal, {}, createDefaultTradeTableFilters(), 'pnl-desc', 1, 30, ['trade-0', 'trade-1'])
    expect(view.effectiveSort).toBe('pnl-desc')
    expect(view.rows.map(row => row.id)).toEqual(['trade-1', 'trade-0'])
    expect(view.totalMatches).toBe(2)
    expect(buildTradeTableView(journal, {}, createDefaultTradeTableFilters(), 'pnl-desc', 1, 30).canSortByPnL).toBe(false)
    expect(buildTradeTableView(journal, {}, createDefaultTradeTableFilters(), 'pnl-desc', 1, 30, []).totalMatches).toBe(0)
    expect(buildTradeTableView([{ ...rows[0] }], {}, createDefaultTradeTableFilters(), 'pnl-desc', 1, 30, ['trade-0']).canSortByPnL).toBe(false)
  })
  it('uses the same Berlin weekday on the server and in the browser', () => {
    expect(getTradeWeekdayLabel({ ...rows[0], date: '2026-10-12T22:30:00Z' })).toBe('Dienstag')
  })
  it('allows money sorting only with a known shared account currency', () => {
    expect(resolveTradeTableSort([{ ...rows[0], accountCurrency: 'EUR' }, { ...rows[1], accountCurrency: 'USD' }], 'pnl-desc')).toBe('newest')
    expect(resolveTradeTableSort([rows[0]], 'pnl-asc')).toBe('newest')
    expect(resolveTradeTableSort([{ ...rows[0], accountCurrency: 'EUR' }], 'pnl-desc')).toBe('pnl-desc')
    expect(resolveTradeTableSort(rows, 'oldest')).toBe('oldest')
  })
  it('finds trades beyond the former loaded-page boundary and paginates only matches', () => {
    const filters = { ...createDefaultTradeTableFilters(), search: 'BTC London', dateFrom: '2026-10-12', dateTo: '2026-10-12' }
    const matches = sortTradeTableRows(filterTradeTableRows(rows, {}, filters), 'pnl-desc')
    const first = paginateTradeTableRows(matches, 1, 30)
    const second = paginateTradeTableRows(matches, 2, 30)
    expect(first).toMatchObject({ page: 1, totalPages: 2, totalMatches: 35 })
    expect(first.rows[0].id).toBe('trade-94')
    expect(first.rows).toHaveLength(30)
    expect(second.rows.map(row => row.id)).toEqual(['trade-64', 'trade-63', 'trade-62', 'trade-61', 'trade-60'])
    expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(35)
  })
  it('uses tag evidence anywhere in the journal, not only on page one', () => {
    const tags = buildTradeTagMap([{ id: 'tag', trade_id: 'trade-94', tag: 'Geduldig', created_at: '' }])
    const matches = filterTradeTableRows(rows, tags, { ...createDefaultTradeTableFilters(), requiredTags: ['Geduldig'] })
    expect(paginateTradeTableRows(matches, 1, 30).rows.map(row => row.id)).toEqual(['trade-94'])
  })
  it('clamps a former high page after filtering without losing matches', () => {
    const page = paginateTradeTableRows(rows.slice(0, 2), 999, 30)
    expect(page).toMatchObject({ page: 1, totalPages: 1, totalMatches: 2 })
    expect(page.rows).toHaveLength(2)
  })
  it('supports empty results and an exact page-size boundary', () => {
    expect(paginateTradeTableRows([], 3, 30)).toEqual({ rows: [], page: 1, totalPages: 1, totalMatches: 0 })
    expect(paginateTradeTableRows(rows.slice(0, 60), 2, 30).rows).toHaveLength(30)
    expect(paginateTradeTableRows(rows.slice(0, 60), 3, 30).page).toBe(2)
  })
  it('normalizes invalid page numbers and rejects invalid page sizes', () => {
    for (const page of [-1, 0, NaN, 1.2, Infinity]) expect(paginateTradeTableRows(rows, page, 30).page).toBe(1)
    expect(() => paginateTradeTableRows(rows, 1, 0)).toThrow('INVALID_TRADE_PAGE_SIZE')
  })
  it('does not mutate the source ordering', () => {
    const before = structuredClone(rows)
    paginateTradeTableRows(sortTradeTableRows(rows, 'pnl-desc'), 2, 30)
    expect(rows).toEqual(before)
  })
})

describe('journal navigation query contract', () => {
  it('roundtrips all filters, sort, page and review restriction', () => {
    const filters = { ...createDefaultTradeTableFilters(), search: 'BTC London +', dateFrom: '2026-10-01', dateTo: '2026-10-14', market: 'BTC/USD', account: 'Konto A', setup: 'Breakout', session: 'London', concept: 'SMC', quality: 'A-Setup', emotion: 'Ruhig', tag: 'Plan', weekday: 'Montag', tagging: 'Getaggt' as const, outcome: 'Gewinner' as const, direction: 'Long' as const, status: 'Vollständig' as const, requiredTags: ['Komma, im Tag', 'A&B'] }
    const href = buildTradeTableHref('reviewSession=saved&tradeId=old&editTradeId=old&closeTradeId=old', { filters, sort: 'pnl-desc', page: 2, reviewOnly: true, tradeId: 'trade / +ä' })
    const params = new URL(href, 'http://local').searchParams
    expect(parseTradeTableQuery(params)).toEqual({ filters, sort: 'pnl-desc', page: 2, reviewOnly: true })
    expect(params.get('reviewSession')).toBe('saved')
    expect(params.get('tradeId')).toBe('trade / +ä')
    expect(params.has('editTradeId')).toBe(false)
    expect(params.has('closeTradeId')).toBe(false)
  })
  it('clears obsolete filters and selection when building a reset/page link', () => {
    const href = buildTradeTableHref('search=old&dateFrom=2020-01-01&tags=old&requiredTag=old&sort=pnl-desc&reviewOnly=1&tradeId=old&capture=full', { filters: createDefaultTradeTableFilters(), sort: 'newest', page: 1, reviewOnly: false })
    expect(href).toBe('/trades?page=1')
  })
  it('retains legacy comma-separated review tags as required tags', () => {
    expect(parseTradeTableQuery(new URLSearchParams('tags=Plan,Geduldig')).filters.requiredTags).toEqual(['Plan', 'Geduldig'])
  })
  it('normalizes invalid enumerations, sort and page values', () => {
    for (const page of ['-1', '1e3', '2bad', '1.5', 'Infinity', '9999999999999999999']) {
      const parsed = parseTradeTableQuery(new URLSearchParams({ page, sort: 'unknown', status: 'unknown', direction: 'bad' }))
      expect(parsed.page).toBe(1)
      expect(parsed.sort).toBe('newest')
      expect(parsed.filters.status).toBe('Alle')
      expect(parsed.filters.direction).toBe('Alle')
    }
  })
  it('keeps a reversed date range available for explicit UI validation', () => {
    expect(parseTradeTableQuery(new URLSearchParams('dateFrom=2026-10-14&dateTo=2026-10-01')).filters.dateFrom).toBe('2026-10-14')
  })
})
