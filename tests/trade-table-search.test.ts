import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import { createDefaultTradeTableFilters, filterTradeTableRows } from '@/lib/utils/trade-table'

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'btc-london',
    date: '2026-10-12T10:00:00Z',
    market: 'BTCUSDT',
    accountLabel: 'Swing-Konto',
    setup: 'Opening Range',
    session: 'London',
    concept: 'Breakout',
    emotion: 'Ruhig',
    quality: 'A-Setup',
    result: 'Gewinner',
    r: '+2.5R',
    netPnL: 125,
    captureStatus: 'complete',
    captureResult: 'winner',
    direction: 'long',
    ...overrides,
  }
}

const tags = { 'btc-london': ['Geduldig', 'Plan eingehalten'] }
const search = (rows: Trade[], query: string) => filterTradeTableRows(rows, tags, {
  ...createDefaultTradeTableFilters(),
  search: query,
})

describe('trade table multi-term search', () => {
  it('matches terms across market and session on the same trade', () => {
    const row = trade()
    expect(search([row], 'BTC London')).toEqual([row])
  })

  it('requires every term instead of returning trades matching just one', () => {
    expect(search([trade()], 'BTC Tokyo')).toEqual([])
  })

  it('does not combine matching fields from different trades', () => {
    expect(search([
      trade({ session: 'New York' }),
      trade({ id: 'eth-london', market: 'ETHUSDT' }),
    ], 'BTC London')).toEqual([])
  })

  it('ignores case and normalizes spaces, tabs and newlines', () => {
    const row = trade()
    expect(search([row], '  bTc\t  LONDON\n')).toEqual([row])
  })

  it('matches in any order and tolerates repeated terms', () => {
    const row = trade()
    expect(search([row], 'London BTC London')).toEqual([row])
  })

  it('searches account, setup, concept and separate tags together', () => {
    const row = trade()
    expect(search([row], 'Swing Opening Breakout Geduldig eingehalten')).toEqual([row])
  })

  it('retains single-term substring matching and multiword field searches', () => {
    const row = trade()
    expect(search([row], 'BTC')).toEqual([row])
    expect(search([row], 'Opening Range')).toEqual([row])
  })

  it('treats punctuation as literal text, not regular expressions', () => {
    const row = trade({ market: 'BTC[USD]' })
    expect(search([row], 'BTC[USD] London')).toEqual([row])
    expect(search([row], 'BTC.* London')).toEqual([])
  })

  it('leaves an empty or whitespace-only search unrestricted', () => {
    const rows = [trade(), trade({ id: 'eth', market: 'ETHUSDT' })]
    expect(search(rows, '')).toEqual(rows)
    expect(search(rows, ' \t\n ')).toEqual(rows)
  })

  it('combines all search terms with existing status and required-tag filters', () => {
    const row = trade()
    const filters = {
      ...createDefaultTradeTableFilters(),
      search: 'BTC London',
      requiredTags: ['Geduldig'],
    }
    expect(filterTradeTableRows([row], tags, filters)).toEqual([row])
    expect(filterTradeTableRows([row], tags, { ...filters, status: 'Offen' })).toEqual([])
    expect(filterTradeTableRows([row], tags, { ...filters, requiredTags: ['Fehlt'] })).toEqual([])
  })

  it('does not modify trades, tags or the search input', () => {
    const rows = [trade()]
    const filters = { ...createDefaultTradeTableFilters(), search: '  BTC London  ' }
    const before = structuredClone({ rows, tags, filters })
    filterTradeTableRows(rows, tags, filters)
    expect({ rows, tags, filters }).toEqual(before)
  })
})
