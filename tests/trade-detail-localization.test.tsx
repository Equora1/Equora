import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { JournalLocaleProvider } from '@/components/layout/journal-locale-provider'
import { CloseTradeForm } from '@/components/trades/close-trade-form'
import { TradeDetailCard } from '@/components/trades/trade-detail-card'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import type { TradeRow } from '@/lib/types/db'

vi.mock('next/navigation', () => ({ useRouter: () => ({}) }))
vi.mock('@/app/actions/trades', () => ({ closeTradeEntry: vi.fn(), removeTradeMediaItem: vi.fn() }))

const row: TradeRow = {
  id: 'synthetic',
  created_at: '2026-10-25T01:30:00Z',
  captured_at: '2026-10-25T01:30:00Z',
  market: 'BTCUSDT.P',
  setup: 'Eigener Setupname',
  emotion: null,
  bias: 'Long',
  rule_check: null,
  entry: 100,
  stop_loss: 90,
  take_profit: 120,
  exit: null,
  net_pnl: 0.004,
  pnl_mode: 'manual',
  risk_percent: null,
  r_multiple: null,
  notes: 'Unveränderte Notiz',
  screenshot_url: null,
  account_currency: 'USDT',
  capture_result: 'open',
  position_size: 2,
}

describe('bilingual trade details and close form', () => {
  it('uses the stable open status to link to quick close in English', () => {
    const trade = mapTradeRowToTrade(row)
    const detail = mapTradeRowToTradeDetail(row, [], null, 'en')
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale="en"><TradeDetailCard trade={trade} detail={detail} tradeId={row.id} /></JournalLocaleProvider>,
    )

    expect(detail).toMatchObject({ captureResultLabel: 'Open', pnl: '+0.004 USDT', lesson: 'Unveränderte Notiz' })
    expect(detail.tradeTimeLabel).toContain('02:30')
    expect(html).toContain('Time (Berlin)')
    expect(html).toContain('closeTradeId=synthetic#trade-editor')
    expect(html).toContain('>Open trade</h3>')
    expect(html).toContain('>Journal entry</p>')
    expect(html).toContain('Eigener Setupname')
  })

  it('shows the open remainder even when a result and completion time were previously recorded', () => {
    const partialRow: TradeRow = {
      ...row, partial_exits: [{ percent: 50, price: 120 }], capture_result: 'winner', completed_at: '2026-10-25T02:30:00Z',
    }
    const trade = mapTradeRowToTrade(partialRow)
    const detail = mapTradeRowToTradeDetail(partialRow, [], null, 'en')
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale="en"><TradeDetailCard trade={trade} detail={detail} tradeId={row.id} /></JournalLocaleProvider>,
    )

    expect(detail.pnl).toBe('+0.004 USDT realised so far · remaining position open')
    expect(html).toContain('50% open · 1.0000 size')
    expect(html).toContain('>Interim result</p>')
    expect(html).toContain('editTradeId=synthetic#trade-editor')
    expect(html).not.toContain('closeTradeId=synthetic')
    expect(html).not.toContain('>Closed</span>')
    expect(html).not.toContain(partialRow.completed_at!)
  })

  it('keeps outcome codes in the close form and sends partial positions to the full editor', () => {
    const props = { tradeId: row.id, market: row.market, setup: row.setup, cancelHref: '/trades', editHref: '/trades?editTradeId=synthetic' }
    const renderClose = (partial: boolean) => renderToStaticMarkup(
      <JournalLocaleProvider locale="en">
        <CloseTradeForm {...props} trade={mapTradeRowToTrade({ ...row, partial_exits: partial ? [{ percent: 50, price: 120 }] : [] })} />
      </JournalLocaleProvider>,
    )
    const quick = renderClose(false)
    expect(quick).toContain('Net P&amp;L at close')
    expect(quick).toMatch(/value="winner"[^>]*>Win<\/option>/)
    expect(quick).toMatch(/value="loser"[^>]*>Loss<\/option>/)
    expect(quick).toContain('aria-label="Closing note"')

    const partial = renderClose(true)
    expect(partial).toContain('Close the remaining position')
    expect(partial).toContain('href="/trades?editTradeId=synthetic"')
    expect(partial).not.toContain('value="winner"')
  })

  it('keeps a recorded outcome separate from missing P&L and missing or unsupported currency', () => {
    const wonWithoutAmount = mapTradeRowToTradeDetail({ ...row, capture_result: 'winner', net_pnl: null }, [], null, 'en')
    expect(wonWithoutAmount).toMatchObject({ captureResultLabel: 'Win', pnl: 'No P&L recorded' })
    expect(mapTradeRowToTradeDetail({ ...row, account_currency: null }, [], null, 'en').pnl).toBe('Currency missing')
    expect(mapTradeRowToTradeDetail({ ...row, account_currency: 'JPY' }, [], null, 'en').pnl).toBe('Unsupported currency')
  })
})
