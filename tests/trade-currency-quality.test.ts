import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import type { TradeRow } from '@/lib/types/db'
import { getTradeCurrencyStatus, summarizeTradeCurrencyQuality, resolveTradeMonetaryScope, formatMoney } from '@/lib/utils/currency'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import { buildTradeTableView, countActiveTradeTableFilters, createDefaultTradeTableFilters } from '@/lib/utils/trade-table'
import { buildTradeTableHref, parseTradeTableQuery } from '@/lib/utils/trade-table-query'

const base: Trade = { id: 'sample', date: '2026-10-01', market: 'BTCUSDT', setup: 'Import', result: '', r: '', emotion: '', quality: 'B-Setup', session: '', concept: '', netPnL: 0, captureStatus: 'complete' }
const row: TradeRow = { id: 'sample', created_at: '2026-10-01T12:00:00Z', market: 'BTCUSDT', setup: 'CSV Import', emotion: null, bias: 'Long', rule_check: null, entry: null, stop_loss: null, take_profit: null, exit: null, net_pnl: 10, pnl_mode: 'manual', risk_percent: null, r_multiple: null, notes: null, screenshot_url: null }

describe('journal currency quality without historical inference', () => {
  it('distinguishes absent, unsupported and supported currencies', () => {
    expect(getTradeCurrencyStatus(null)).toBe('missing')
    expect(getTradeCurrencyStatus('  ')).toBe('missing')
    expect(getTradeCurrencyStatus('JPY')).toBe('unsupported')
    expect(getTradeCurrencyStatus(' usdt ')).toBe('known')
    expect(formatMoney(12, 'JPY')).toBe('Währung nicht unterstützt')
    expect(formatMoney(Number.NaN, 'EUR')).toBe('Betrag fehlt')
  })
  it('preserves missing and unsupported metadata instead of deriving currency from a market or broker', () => {
    const missing = mapTradeRowToTrade({ ...row, broker_profile: 'mexc-perps', quote_asset: 'USDT' })
    const unsupported = mapTradeRowToTrade({ ...row, account_currency: 'JPY' })
    expect(missing.accountCurrency).toBeNull()
    expect(missing.accountCurrencyStatus).toBe('missing')
    expect(missing.result).toBe('Währung fehlt')
    expect(missing.netPnL).toBe(10)
    expect(unsupported.accountCurrency).toBeNull()
    expect(unsupported.accountCurrencyStatus).toBe('unsupported')
    expect(unsupported.result).toBe('Währung nicht unterstützt')
    expect(mapTradeRowToTradeDetail({ ...row, account_currency: 'JPY' }).pnl).toContain('Währung nicht unterstützt')
    expect(mapTradeRowToTrade({ ...row, account_currency: ' eur ' }).result).toBe('+10 EUR')
  })
  it('counts completed and zero-result trades without confusing capture status with currency quality', () => {
    const trades = [{ ...base, id: 'known', accountCurrency: 'EUR' as const }, { ...base, id: 'missing' }, { ...base, id: 'unsupported', accountCurrencyStatus: 'unsupported' as const }]
    expect(summarizeTradeCurrencyQuality(trades)).toEqual({ total: 3, known: 1, missing: 1, unsupported: 1, needsReview: 2 })
    expect(resolveTradeMonetaryScope(trades).isComparable).toBe(false)
  })
  it('filters across the complete journal before pagination and intersects review subsets', () => {
    const trades = Array.from({ length: 1103 }, (_, i): Trade => ({ ...base, id: String(i), accountCurrency: i < 1000 ? 'EUR' : null, accountCurrencyStatus: i < 1000 ? 'known' : i < 1100 ? 'missing' : 'unsupported' }))
    const filters = { ...createDefaultTradeTableFilters(), currencyCheck: 'Fehlt' as const }
    const view = buildTradeTableView(trades, {}, filters, 'newest', 2, 30)
    expect(view.totalMatches).toBe(100)
    expect(view.rows).toHaveLength(30)
    expect(view.rows.every(trade => trade.accountCurrencyStatus === 'missing')).toBe(true)
    expect(buildTradeTableView(trades, {}, { ...filters, currencyCheck: 'Prüfen' }, 'newest', 1, 30).totalMatches).toBe(103)
    expect(buildTradeTableView(trades, {}, { ...filters, currencyCheck: 'Nicht unterstützt' }, 'newest', 1, 30).totalMatches).toBe(3)
    expect(buildTradeTableView(trades, {}, filters, 'newest', 1, 30, ['0', '1001']).matches.map(trade => trade.id)).toEqual(['1001'])
    expect(countActiveTradeTableFilters(filters)).toBe(1)
    expect(summarizeTradeCurrencyQuality(trades).total).toBe(1103)
  })
  it('retains search and the quality filter through detail and page links, and clears it on reset', () => {
    const filters = { ...createDefaultTradeTableFilters(), search: 'BTC London', currencyCheck: 'Nicht unterstützt' as const }
    const href = buildTradeTableHref('reviewSession=saved&currencyCheck=Fehlt', { filters, sort: 'newest', page: 2, reviewOnly: true, tradeId: 'selected' })
    const parsed = parseTradeTableQuery(new URL(href, 'http://local').searchParams)
    expect(parsed.filters).toEqual(filters)
    expect(parsed.page).toBe(2)
    expect(parsed.reviewOnly).toBe(true)
    expect(new URL(href, 'http://local').searchParams.get('tradeId')).toBe('selected')
    expect(parseTradeTableQuery(new URLSearchParams('currencyCheck=invalid')).filters.currencyCheck).toBe('Alle')
    expect(buildTradeTableHref('currencyCheck=Fehlt', { filters: createDefaultTradeTableFilters(), sort: 'newest', page: 1, reviewOnly: false })).toBe('/trades?page=1')
  })
  it('does not unblock monetary sorting for known but different units', () => {
    const trades = [{ ...base, id: 'usd', accountCurrency: 'USD' as const }, { ...base, id: 'usdt', accountCurrency: 'USDT' as const }]
    expect(summarizeTradeCurrencyQuality(trades).needsReview).toBe(0)
    expect(buildTradeTableView(trades, {}, createDefaultTradeTableFilters(), 'pnl-desc', 1, 30).canSortByPnL).toBe(false)
  })
})
