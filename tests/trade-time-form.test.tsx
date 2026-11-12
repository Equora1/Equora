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
const props = { markets: ['TEST'], setups: ['Test'], emotions: [], biases: ['Long', 'Short'], ruleFlags: [], tagOptions: [], mode: 'edit' as const, tradeId: 'test' }
it.each([
  ['2026-01-01T11:00:00Z', '2026-01-01T12:00'],
  ['2026-07-01T10:00:00Z', '2026-07-01T12:00'],
  ['2026-10-25T00:30:17Z', '2026-10-25T02:30'],
  ['2026-10-25T01:30:42Z', '2026-10-25T02:30'],
])('renders the real editor in Berlin for %s', (capturedAt, wall) => {
  const html = renderToStaticMarkup(<TradeForm {...props} initialValues={{ capturedAt, market: 'TEST', setup: 'Test', pnlMode: 'manual', accountCurrency: 'USDT' }} />)
  expect(html).toContain('Trade-Zeit (Berlin)')
  expect(html).toContain('Sommer- und Winterzeit werden berücksichtigt.')
  expect(html).toMatch(new RegExp('name="trade_occurred_at"[^>]*value="' + wall + '"'))
})
