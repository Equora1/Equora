import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }))
vi.mock('@/app/actions/trade-currency', () => ({ previewTradeCurrencyCorrection: vi.fn(), applyTradeCurrencyCorrection: vi.fn() }))
vi.mock('@/app/actions/trades', () => ({ createTradeEntry: vi.fn(), updateTradeEntry: vi.fn(), syncTradeMedia: vi.fn() }))
vi.mock('@/app/actions/media-cleanup', () => ({ requestUncommittedMediaCleanup: vi.fn() }))
vi.mock('@/app/actions/user-cost-profiles', () => ({ deleteUserCostProfile: vi.fn(), saveUserCostProfile: vi.fn() }))
vi.mock('@/components/trades/snipping-assist-dynamic', () => ({ SnippingAssistCard: () => null }))
import { TradeCurrencyCorrection, SaveTradeCurrencyOnly } from '@/components/trades/trade-currency-correction'
import { TradeForm } from '@/components/trades/trade-form'

const props = { markets: ['BTCUSDT.P'], setups: ['Test'], emotions: [], biases: ['Long', 'Short'], ruleFlags: [], tagOptions: [], mode: 'edit' as const, tradeId: '00000000-0000-0000-0000-000000000001' }
function renderForm(pnlMode: 'manual' | 'auto' = 'manual') {
  return renderToStaticMarkup(<TradeForm {...props} initialValues={{ market: 'BTCUSDT.P', setup: 'Test', netPnL: '0', accountCurrency: '', pnlMode, bias: 'Long', entry: '', exit: '', notes: 'Vorhandene Notiz', tradeOccurredAt: '2026-10-18T12:00' }} />)
}
describe('currency correction and progressive trade form', () => {
  it('prevents a bulk change alongside an editor with unsaved values', () => {
    const html = renderToStaticMarkup(<TradeCurrencyCorrection editingTrade />)
    expect(html).toContain('Beende zuerst')
    expect(html).not.toContain('Vorschau laden')
  })
  it('keeps all-journal scope explicit and requires a server preview before offering a save', () => {
    const html = renderToStaticMarkup(<TradeCurrencyCorrection />)
    expect(html).toContain('Alle meine Trades')
    expect(html).toContain('Nur Trades ohne Währung')
    expect(html).toContain('<option selected="">USDT</option>')
    expect(html).toContain('Auswahl gilt unabhängig von deinen Suchfiltern')
    expect(html).toContain('Vorschau laden')
    expect(html).not.toContain('Trades speichern')
    expect(html).not.toContain('open=""')
  })
  it('disables currency-only save without a selected currency', () => {
    const html = renderToStaticMarkup(<SaveTradeCurrencyOnly tradeId={props.tradeId} currency="" />)
    expect(html).toContain('disabled=""')
    expect(html).toContain('Keine Entry- oder Exit-Preise nötig')
    expect(html).toContain('Weitere Formulareingaben bleiben ungespeichert')
  })
  it('puts the single result and currency fields before optional calculation details', () => {
    const html = renderForm()
    const result = html.indexOf('aria-label="Ergebnis und Währung"')
    const advanced = html.indexOf('Berechnung &amp; Kosten')
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(advanced)
    expect(html.match(/name="net_pnl"/g)).toHaveLength(1)
    expect(html.match(/name="account_currency"/g)).toHaveLength(1)
    expect(html.indexOf('name="account_currency"')).toBeLessThan(advanced)
    expect(html.indexOf('name="net_pnl"')).toBeLessThan(advanced)
    expect(html).toContain('Nur Währung speichern')
    expect(html).toContain('value="0"')
  })
  it('starts manual editing with optional sections collapsed but retains their values', () => {
    const html = renderForm()
    expect(html).toContain('Trade bearbeiten')
    expect(html).toContain('Nachbereitung · optional')
    const priceOpening = html.slice(0, html.indexOf('Preise &amp; Ausführung')).match(/<details[^>]*>/g)!.at(-1)!
    expect(priceOpening).not.toContain('open=')
    expect(html).toContain('name="entry"')
    expect(html).toContain('name="exit"')
    expect(html).toContain('name="review_lesson"')
  })
  it('keeps prices immediately accessible when automatic calculation requires them', () => {
    const html = renderForm('auto')
    const priceOpening = html.slice(0, html.indexOf('Preise &amp; Ausführung')).match(/<details[^>]*>/g)!.at(-1)!
    expect(priceOpening).toContain('open=""')
  })
})
