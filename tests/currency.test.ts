import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  normalizeTradeCurrency,
  resolveMonetaryScope,
  resolveTradeMonetaryScope,
} from '../lib/utils/currency'
import { buildCalendarSummary } from '../lib/utils/calendar'

describe('trade currency hard gate', () => {
  it('normalizes only the explicitly supported units', () => {
    expect(normalizeTradeCurrency(' eur ')).toBe('EUR')
    expect(normalizeTradeCurrency('usdt')).toBe('USDT')
    expect(normalizeTradeCurrency('BTC')).toBeNull()
    expect(normalizeTradeCurrency('')).toBeNull()
  })

  it('formats a value with an explicit ISO or stablecoin code', () => {
    expect(formatMoney(1250.5, 'EUR', 2)).toBe('+1.250,50 EUR')
    expect(formatMoney(-12, 'USDT')).toBe('-12 USDT')
    expect(formatMoney(12, null)).toBe('Währung fehlt')
  })

  it('permits a single known currency and blocks unknown or mixed scopes', () => {
    expect(resolveMonetaryScope(['EUR', 'eur']).kind).toBe('single')
    expect(resolveMonetaryScope(['EUR', null]).kind).toBe('unknown')
    expect(resolveMonetaryScope(['EUR', 'USD']).kind).toBe('mixed')
    expect(resolveMonetaryScope([]).kind).toBe('empty')
  })

  it('does not treat USD, USDT and USDC as interchangeable', () => {
    const scope = resolveMonetaryScope(['USD', 'USDT', 'USDC'])
    expect(scope.kind).toBe('mixed')
    expect(scope.isComparable).toBe(false)
    expect(scope.currencies).toEqual(['USD', 'USDC', 'USDT'])
  })

  it('ignores non-monetary quick captures but blocks a monetary trade without currency', () => {
    const scope = resolveTradeMonetaryScope([
      { id: 'quick', date: '', market: '', setup: '', result: '', r: '', emotion: '', quality: 'B-Setup', session: '', concept: '' },
      { id: 'money', date: '', market: '', setup: '', result: '', r: '', emotion: '', quality: 'B-Setup', session: '', concept: '', netPnL: 10 },
    ])
    expect(scope.kind).toBe('unknown')
    expect(scope.unknownCount).toBe(1)
  })

  it('keeps a calendar day visible but blocks its mixed-currency P&L badge', () => {
    const common = { date: '2026-08-02', market: 'Test', setup: 'Test', result: '', r: '', emotion: '', quality: 'B-Setup' as const, session: '', concept: '' }
    const [day] = buildCalendarSummary([
      { ...common, id: 'eur', netPnL: 100, accountCurrency: 'EUR' },
      { ...common, id: 'usd', netPnL: 120, accountCurrency: 'USD' },
    ])

    expect(day?.tradeCount).toBe(2)
    expect(day?.monetaryScope.kind).toBe('mixed')
    expect(day?.monetaryScope.isComparable).toBe(false)
  })
})
