import { describe, expect, it } from 'vitest'
import { resolveTradeSelection } from '@/lib/utils/trade-selection'
import { buildTradeTableHref, parseTradeTableQuery } from '@/lib/utils/trade-table-query'

describe('explicit journal detail/editor selection', () => {
  it('leaves the list closed without an explicit trade request', () => {
    expect(resolveTradeSelection({})).toMatchObject({ mode: 'list', selectedTradeId: undefined, drawerTradeId: undefined })
  })
  it('opens only the explicitly requested trade', () => {
    expect(resolveTradeSelection({ tradeId: 'trade-b' })).toMatchObject({ mode: 'details', selectedTradeId: 'trade-b', drawerTradeId: 'trade-b' })
  })
  it('keeps the drawer closed while editing, even with a different detail ID', () => {
    expect(resolveTradeSelection({ tradeId: 'trade-a', editTradeId: 'trade-b' })).toMatchObject({ mode: 'edit', selectedTradeId: 'trade-b', drawerTradeId: undefined, editTradeId: 'trade-b' })
  })
  it('gives closing precedence over editing and detail selection', () => {
    expect(resolveTradeSelection({ tradeId: 'a', editTradeId: 'b', closeTradeId: 'c', capture: 'full' })).toMatchObject({ mode: 'close', selectedTradeId: 'c', drawerTradeId: undefined, closeTradeId: 'c', editTradeId: undefined, captureMode: undefined })
  })
  it.each(['quick', 'full', 'import'])('keeps the drawer closed for %s capture', capture => {
    expect(resolveTradeSelection({ tradeId: 'a', capture })).toMatchObject({ mode: 'capture', selectedTradeId: 'a', drawerTradeId: undefined, captureMode: capture })
  })
  it('ignores invalid capture modes and blank selection IDs', () => {
    expect(resolveTradeSelection({ tradeId: ' ', editTradeId: '', closeTradeId: '\t', capture: 'unknown' }).mode).toBe('list')
  })
  it('can reopen details on an explicit editor return without retaining editor mode', () => {
    const context = parseTradeTableQuery(new URLSearchParams('search=BTC+London&dateFrom=2026-10-01&reviewOnly=1&sort=oldest&page=2'))
    const href = buildTradeTableHref('editTradeId=a&capture=full&reviewSession=saved', { ...context, tradeId: 'a' })
    const params = new URL(href, 'http://local').searchParams
    expect(resolveTradeSelection(Object.fromEntries(params))).toMatchObject({ mode: 'details', drawerTradeId: 'a' })
    expect(parseTradeTableQuery(params)).toEqual(context)
    expect(params.get('reviewSession')).toBe('saved')
  })
  it('stays closed after removing selection while retaining a review and filters', () => {
    const params = new URLSearchParams('tradeId=a&reviewTradeIds=a%7Cb&reviewTitle=Review&search=BTC')
    const context = parseTradeTableQuery(params)
    const closed = new URL(buildTradeTableHref(params.toString(), context), 'http://local').searchParams
    expect(closed.get('reviewTradeIds')).toBe('a|b')
    expect(resolveTradeSelection(Object.fromEntries(closed)).mode).toBe('list')
    expect(parseTradeTableQuery(closed).filters.search).toBe('BTC')
  })
})
