import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }))
vi.mock('@/app/actions/trade-currency', () => ({ previewTradeCurrencyCorrection: vi.fn(), applyTradeCurrencyCorrection: vi.fn() }))
vi.mock('@/app/actions/trades', () => ({ createTradeEntry: vi.fn(), updateTradeEntry: vi.fn(), syncTradeMedia: vi.fn() }))
vi.mock('@/app/actions/media-cleanup', () => ({ requestUncommittedMediaCleanup: vi.fn() }))
vi.mock('@/app/actions/user-cost-profiles', () => ({ deleteUserCostProfile: vi.fn(), saveUserCostProfile: vi.fn() }))
vi.mock('@/components/trades/snipping-assist-dynamic', () => ({ SnippingAssistCard: () => null }))
import { TradeForm } from '@/components/trades/trade-form'

const props = { markets: ['MGC'], setups: ['Test'], emotions: [], biases: ['Long', 'Short'], ruleFlags: [], tagOptions: [] }

describe('futures trade form', () => {
  it('selects USD and neutral costs when a fresh MGC draft would inherit stock defaults', () => {
    const html = renderToStaticMarkup(<TradeForm {...props} />)
    expect(html.match(/<select name="instrument_type"[^>]*>(.*?)<\/select>/)?.[1]).toMatch(/<option value="futures"[^>]*selected="">/)
    expect(html.match(/<select name="account_currency"[^>]*>(.*?)<\/select>/)?.[1]).toMatch(/<option value="USD"[^>]*selected="">/)
    expect(html.match(/<select name="broker_profile"[^>]*>(.*?)<\/select>/)?.[1]).toMatch(/<option value="manual"[^>]*selected="">/)
    expect(html.match(/<select name="cost_profile"[^>]*>(.*?)<\/select>/)?.[1]).toMatch(/<option value="none"[^>]*selected="">/)
    expect(html).toMatch(/name="fees"[^>]*value="0"/)
    expect(html).toMatch(/name="spread_cost"[^>]*value="0"/)
    expect(html).toContain('placeholder="1"')
  })

  it('reopens valid stored percentages as whole counts and preserves an explicit account and fee', () => {
    const html = renderToStaticMarkup(<TradeForm {...props} mode="edit" tradeId="test" initialValues={{
      market: 'MGCZ6', setup: 'Test', instrumentType: 'futures', accountCurrency: 'EUR', fees: '1.37',
      positionSize: '5', partialExit1Percent: '40', partialExit1Price: '3898',
      partialExit2Percent: '60', partialExit2Price: '3899',
    }} />)
    expect(html.match(/<select name="account_currency"[^>]*>(.*?)<\/select>/)?.[1]).toMatch(/<option value="EUR"[^>]*selected="">/)
    expect(html).toMatch(/name="fees"[^>]*value="1.37"/)
    expect(html).toMatch(/inputMode="numeric"[^>]*value="2"/)
    expect(html).toMatch(/inputMode="numeric"[^>]*value="3"/)
  })

  it('explains a continuous chart symbol and preserves a deliberate CFD choice', () => {
    const chart = renderToStaticMarkup(<TradeForm {...props} markets={['MGC1!']} />)
    expect(chart).toContain('wähle den gehandelten Kontrakt')
    const cfd = renderToStaticMarkup(<TradeForm {...props} initialValues={{ market: 'MGC', instrumentType: 'cfd' }} />)
    expect(cfd.match(/<select name="instrument_type"[^>]*>(.*?)<\/select>/)?.[1]).toMatch(/<option value="cfd"[^>]*selected="">/)
    expect(cfd).toContain('Anteil %')
  })
})
