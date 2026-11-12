import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ row: null as any, form: null as any }))
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }))
vi.mock('@/lib/server/auth', () => ({ getJournalAccess: async () => ({ user: { id: 'owner' } }) }))
vi.mock('@/lib/server/journal', () => ({ getTradesWorkspaceSnapshotServer: async () => ({ availability: 'ready', tradeRows: [state.row], tradeTags: [], setupRows: [], setupTradeLinkRows: [], dailyNotes: [], tradeMediaCounts: {}, source: 'supabase' }) }))
vi.mock('@/lib/server/review-sessions', () => ({ getReviewSessionsServer: async () => [], getReviewSessionByIdServer: async () => null }))
vi.mock('@/lib/server/user-cost-profiles', () => ({ getUserCostProfilesServer: async () => [] }))
vi.mock('@/lib/server/trades', () => ({ getTradeByIdServer: async () => state.row, getTradeMediaServer: async () => [], getTradeTagsServer: async () => [] }))
vi.mock('@/lib/server/performance', () => ({ measurePerformance: (_n: any, _k: any, run: any) => run(), measurePerformanceSync: (_n: any, _k: any, run: any) => run() }))
vi.mock('@/components/layout/app-shell', () => ({ AppShell: ({ children }: any) => <main>{children}</main> }))
vi.mock('@/components/trades/quick-trade-form', () => ({ QuickTradeForm: () => null }))
vi.mock('@/components/trades/trade-ledger-capture', () => ({ TradeLedgerCapture: () => null }))
vi.mock('@/components/trades/trade-form', () => ({ TradeForm: (props: any) => { state.form = props; return null } }))
vi.mock('@/components/trades/trade-capture-deck', () => ({ TradeCaptureDeck: () => null }))
vi.mock('@/components/trades/close-trade-form', () => ({ CloseTradeForm: () => null }))
vi.mock('@/components/trades/trade-import-panel', () => ({ TradeImportPanel: () => null }))
vi.mock('@/components/trades/trades-workbench', () => ({ TradesWorkbench: () => null }))
import TradesPage from '@/app/(journal)/trades/page'
import { validateTradeCaptureInput } from '@/lib/utils/trade-validation'

it.each(['2026-10-25T00:30:17.123Z', '2026-10-25T01:30:42.987Z'])('passes the exact owned fold reference through the real route for %s', async capturedAt => {
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  state.form = null
  state.row = { id, created_at: '2026-01-01T00:00:00Z', captured_at: capturedAt, market: 'TEST', setup: 'Test', account_currency: 'USDT', net_pnl: 1, pnl_mode: 'manual' }
  renderToStaticMarkup(await TradesPage({ searchParams: Promise.resolve({ tradeId: id, editTradeId: id }) }))
  expect(state.form?.initialValues).toMatchObject({ tradeOccurredAt: '2026-10-25T02:30', capturedAt, createdAt: state.row.created_at })
  const values = { ...state.form.initialValues, tags: [] }
  expect(validateTradeCaptureInput(values, values.capturedAt).errors.tradeOccurredAt).toBeUndefined()
  expect(validateTradeCaptureInput(values).errors.tradeOccurredAt).toContain('zweimal')
})
