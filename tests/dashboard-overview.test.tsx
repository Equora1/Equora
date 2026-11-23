import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardOverview } from '@/components/dashboard/dashboard-overview'
import type { Trade } from '@/lib/types/trade'
import { buildEquitySeries } from '@/lib/utils/chart-series'
import { buildDashboardMetricModel, scopeDashboardTrades } from '@/lib/utils/dashboard'

function trade(id: string, tradeOccurredAt: string, overrides: Partial<Trade> = {}): Trade {
  return {
    id, date: tradeOccurredAt, tradeOccurredAt, market: id, setup: 'Test Setup',
    result: '+10 EUR', r: '—', emotion: '', quality: 'A-Setup', session: '', concept: '',
    accountId: 'primary', accountLabel: 'Same label', accountCurrency: 'EUR',
    direction: 'long', netPnL: 10, ...overrides,
  }
}

describe('Dashboard filters and results', () => {
  const today = '2026-04-04'
  const first = trade('EDGE-START', '2026-03-28T23:00:00Z')
  const before = trade('OUTSIDE-EARLY', '2026-03-28T22:59:59Z')
  const last = trade('EDGE-END', '2026-04-04T21:59:59Z', { netPnL: -4, direction: 'short' })
  const after = trade('OUTSIDE-LATE', '2026-04-04T22:00:00Z')
  const other = trade('OTHER-ACCOUNT', '2026-04-01T20:00:00Z', { accountId: 'other', accountCurrency: 'USD' })
  const all = [first, other, after, before, last]

  it('uses inclusive Berlin dates across the spring time change and account IDs', () => {
    const state = scopeDashboardTrades(all, { period: '7', account: 'primary' }, today, 'de')
    expect(state.trades.map(({ id }) => id)).toEqual(['EDGE-END', 'EDGE-START'])
    expect(state.firstDay).toBe('2026-03-29')
    expect(state.accounts.map(({ key }) => key).sort()).toEqual(['other', 'primary'])
    expect(new Set(state.accounts.map(({ label }) => label)).size).toBe(2)
    expect(scopeDashboardTrades(all, { account: 'unavailable' }, today, 'de')).toMatchObject({ isKnownAccount: false, trades: [] })
  })

  it('uses one filtered scope for metrics, the curve, recent trades and the calendar', () => {
    const html = renderToStaticMarkup(<DashboardOverview trades={all} dailyNotes={[]} source="supabase" availability="ready"
      locale="en" params={{ period: '7', account: 'primary' }} today={today} />)

    expect(html).toContain('Net P&amp;L across 2 closed trades')
    expect(html).toContain('tradeId=EDGE-START')
    expect(html).toContain('tradeId=EDGE-END')
    for (const excluded of ['OTHER-ACCOUNT', 'OUTSIDE-EARLY', 'OUTSIDE-LATE']) {
      expect(html).not.toContain(`tradeId=${excluded}`)
    }
    expect(html).toContain('month=2026-04&amp;day=2026-04-04')
    expect(html).toContain('+6 EUR')
    expect(html).toContain('-4 EUR')
    expect(html).toContain('Value unavailable')
    expect(html.indexOf('P&amp;L over time')).toBeLessThan(html.indexOf('Trading calendar'))
  })

  it.each([null, 'USD'] as const)('keeps the total, curve and drawdown unavailable with currency %s', currency => {
    const second = trade('CURRENCY-CHECK', '2026-04-03T17:00:00Z', { accountCurrency: currency })
    const trades = [first, second]
    const html = renderToStaticMarkup(<DashboardOverview trades={trades} dailyNotes={[]} source="supabase" availability="ready"
      locale="en" today={today} />)
    expect(buildDashboardMetricModel(trades).moneyComparable).toBe(false)
    expect(html).not.toContain('Net P&amp;L across')
    expect(html).not.toContain('+20 EUR')
    expect(html).toContain(currency ? 'Multiple currencies without an exchange rate' : 'At least one currency is missing or unsupported')
  })

  it('starts the result chart at zero and shows the first loss', () => {
    const series = buildEquitySeries([last])
    expect(series.points.map(({ value }) => value)).toEqual([0, -4])
    expect(series.totalPoints).toBe(1)
    expect(series.points[0].y).toBe(series.zeroLineY)
  })
})
