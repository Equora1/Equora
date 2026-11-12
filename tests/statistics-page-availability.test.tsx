import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ availability: 'ready', count: 0, reader: vi.fn(), transform: vi.fn(), workbench: vi.fn() }))
vi.mock('@/lib/server/auth', () => ({ getJournalAccess: async () => ({ user: { id: 'owner' } }) }))
vi.mock('@/lib/server/journal', () => ({ getStatisticsSnapshotServer: async (id: string) => {
  state.reader(id)
  return { availability: state.availability, tradeRows: Array.from({ length: state.count }, (_, i) => ({ id: String(i) })), setupRows: [], setupTradeLinkRows: [], tradeTags: [] }
} }))
vi.mock('@/lib/server/transformers', () => ({ mapTradeRowToTrade: (row: { id: string }) => { state.transform(row); return { id: row.id } } }))
vi.mock('@/lib/server/performance', () => ({ measurePerformanceSync: (_name: string, _kind: string, run: () => unknown) => run() }))
vi.mock('@/components/layout/app-shell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/analytics/statistik-workbench', () => ({ StatistikWorkbench: ({ trades }: { trades: unknown[] }) => {
  state.workbench(trades.length)
  return <section>Statistik mit {trades.length} Trades</section>
} }))
import StatistikPage from '@/app/(journal)/statistik/page'

beforeEach(() => { state.availability = 'ready'; state.count = 0; state.reader.mockClear(); state.transform.mockClear(); state.workbench.mockClear() })

describe('statistics availability before calculation or rendering', () => {
  it('renders the complete loaded set rather than slicing the page input at 1000', async () => {
    state.count = 1272
    const html = renderToStaticMarkup(await StatistikPage({}))
    expect(html).toContain('Statistik mit 1272 Trades')
    expect(state.reader).toHaveBeenCalledWith('owner')
    expect(state.transform).toHaveBeenCalledTimes(1272)
    expect(state.workbench).toHaveBeenCalledWith(1272)
    expect(html).not.toContain('role="alert"')
  })
  it('shows an unavailable state before transforming or calculating partial rows', async () => {
    state.availability = 'unavailable'; state.count = 100
    const html = renderToStaticMarkup(await StatistikPage({}))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Statistik derzeit nicht verfügbar')
    expect(html).toContain('nicht vollständig geladen')
    expect(html).toContain('href="/statistik"')
    expect(state.transform).not.toHaveBeenCalled()
    expect(state.workbench).not.toHaveBeenCalled()
  })
  it('offers login when the reader cannot establish an owner', async () => {
    state.availability = 'unauthenticated'
    const html = renderToStaticMarkup(await StatistikPage({}))
    expect(html).toContain('href="/login"')
    expect(html).toContain('Einloggen')
    expect(state.workbench).not.toHaveBeenCalled()
  })
  it('treats a confirmed empty journal as a ready empty analysis', async () => {
    const html = renderToStaticMarkup(await StatistikPage({}))
    expect(html).toContain('Statistik mit 0 Trades')
    expect(html).not.toContain('role="alert"')
  })
})
