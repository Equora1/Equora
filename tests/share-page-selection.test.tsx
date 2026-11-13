import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Trade } from '@/lib/types/trade'
import SharePage from '@/app/(journal)/share/page'

const ownerId = 'owner'
const recentTradeId = '3511e278-50ef-4499-8ef3-b4b45a72f51b'
const olderTradeId = 'c03706f4-1fe8-431b-ae9d-ccf9a2a1bd7f'

const state = vi.hoisted(() => ({ getTradeByIdServer: vi.fn(), user: { id: 'owner' } as { id: string } | null }))
vi.mock('@/lib/server/auth', () => ({ getJournalAccess: async () => ({ user: state.user }) }))
vi.mock('@/lib/server/admin', () => ({ isEquoraAdminUser: async () => false }))
vi.mock('@/lib/server/shared-trades', () => ({
  getOwnSharedTradeSubmissionsServer: async () => [],
  getFeaturedSharedTradeSubmissionsServer: async () => [],
  getAdminSharedTradeSubmissionsServer: async () => [],
}))
vi.mock('@/lib/server/trades', () => ({ getTradeByIdServer: state.getTradeByIdServer }))
vi.mock('@/lib/server/journal', () => ({
  getShareSnapshotServer: async () => ({
    tradeRows: [{ id: recentTradeId, market: 'RECENT' }],
    setupRows: [],
    setupTradeLinkRows: [],
    source: 'supabase',
  }),
}))
vi.mock('@/lib/server/transformers', () => ({ mapTradeRowToTrade: (row: Trade) => row }))
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/share/equora-share-hub', () => ({
  EquoraShareHub: ({ trades, selectedTradeId }: { trades: Trade[]; selectedTradeId?: string }) => (
    <output>
      {trades.map((trade) => <span key={trade.id}>{trade.id === selectedTradeId ? 'Selected ' : ''}{trade.market}</span>)}
    </output>
  ),
}))

async function renderSelection(tradeId?: string) {
  const searchParams = Promise.resolve(tradeId ? { tradeId } : {})
  return renderToStaticMarkup(await SharePage({ searchParams }))
}

beforeEach(() => {
  state.getTradeByIdServer.mockReset()
  state.user = { id: ownerId }
})

describe('Trade selection through the share route', () => {
  it('selects an older owned trade without dropping the regular choices', async () => {
    state.getTradeByIdServer.mockResolvedValue({ id: olderTradeId, market: 'OLDER-TEST' })

    expect(await renderSelection(olderTradeId.toUpperCase())).toContain('Selected OLDER-TEST</span><span>RECENT')
    expect(state.getTradeByIdServer).toHaveBeenCalledExactlyOnceWith(olderTradeId, ownerId)
  })

  it('uses the existing choice for a trade already in the list', async () => {
    expect(await renderSelection(recentTradeId)).toContain('Selected RECENT')
    expect(state.getTradeByIdServer).not.toHaveBeenCalled()
  })

  it('keeps the regular choices if the requested trade cannot be read', async () => {
    state.getTradeByIdServer.mockRejectedValue(new Error('Trade could not be loaded'))

    expect(await renderSelection(olderTradeId)).toBe('<main><output><span>RECENT</span></output></main>')
    expect(state.getTradeByIdServer).toHaveBeenCalledExactlyOnceWith(olderTradeId, ownerId)
  })

  it('does not add a row whose ID does not match', async () => {
    state.getTradeByIdServer.mockResolvedValue({ id: recentTradeId, market: 'MISMATCH' })

    expect(await renderSelection(olderTradeId)).toBe('<main><output><span>RECENT</span></output></main>')
  })

  it.each([undefined, 'invalid-id'])('skips the extra lookup for %s', async (tradeId) => {
    await renderSelection(tradeId)
    expect(state.getTradeByIdServer).not.toHaveBeenCalled()
  })

  it('does not look up a hosted trade without a signed-in user', async () => {
    state.user = null
    await renderSelection(olderTradeId)
    expect(state.getTradeByIdServer).not.toHaveBeenCalled()
  })
})
