import { describe, expect, it, vi } from 'vitest'
import { getFeaturedSharedTradeSubmissionsServer } from '@/lib/server/shared-trades'

const { createAuthClient } = vi.hoisted(() => ({ createAuthClient: vi.fn() }))

vi.mock('@/lib/supabase/server-auth', () => ({
  createSupabaseAuthServerClient: createAuthClient,
}))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: () => true }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }))
vi.mock('@/lib/server/admin', () => ({ isEquoraAdminUser: vi.fn() }))

describe('featured trade sharing', () => {
  it('returns only card fields and excludes the name of an anonymous submitter', async () => {
    const featuredCard = {
      id: 'submission-1',
      status: 'featured',
      learning_category: 'execution',
      visibility: 'anonymous',
      submitted_by_name: null,
      shared_market: 'ES',
      shared_setup: 'Breakout',
      shared_result: 'win',
      shared_net_pnl: 25,
      shared_currency: 'USD',
      shared_r_multiple: 1.25,
      shared_screenshot_url: null,
      vault_blurb: 'Shared learning point',
      coach_feedback: 'Shared feedback',
      review_labels: ['risk'],
    }
    const anonymousRow = {
      ...featuredCard,
      submitted_by_name: 'Private name',
      user_id: 'private-user',
      trade_id: 'private-trade',
      user_note: 'Private context',
      admin_note: 'Internal context',
      shared_notes: 'Journal notes',
    }
    const namedCard = { ...featuredCard, id: 'submission-2', visibility: 'named', submitted_by_name: 'Display name' }
    const rpc = vi.fn().mockResolvedValue({ data: [anonymousRow, { ...anonymousRow, ...namedCard }], error: null })
    const from = vi.fn()
    createAuthClient.mockResolvedValueOnce({ from, rpc })

    await expect(getFeaturedSharedTradeSubmissionsServer()).resolves.toEqual([featuredCard, namedCard])
    expect(rpc).toHaveBeenCalledExactlyOnceWith('equora_featured_shared_trades_v1')
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    { data: null, error: { code: 'PGRST202' } },
    { data: { unexpected: true }, error: null },
  ])('does not read the base table if the card response is unavailable or invalid (%j)', async (response) => {
    const rpc = vi.fn().mockResolvedValue(response)
    const from = vi.fn()
    createAuthClient.mockResolvedValueOnce({ from, rpc })

    await expect(getFeaturedSharedTradeSubmissionsServer()).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })
})
