import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ client: vi.fn(), env: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.env }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/media-cleanup', () => ({ processMediaCleanupForPaths: vi.fn() }))
import { closeTradeEntry } from '@/app/actions/trades'

const input = { tradeId: 'trade', exit: '115', netPnL: '35', captureResult: 'winner' as const }
function setup(partial_exits: unknown, user = 'owner', error: unknown = null) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'trade', user_id: user, market: 'TEST', setup: 'Test', notes: null, account_currency: 'EUR', partial_exits }, error }), update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) }
  const from = vi.fn().mockReturnValue(query)
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: user ? { id: user } : null } }) }, from })
  return { query, from }
}
beforeEach(() => { vi.clearAllMocks(); mocks.env.mockReturnValue(true) })
describe('quick close rejects partial positions before any write', () => {
  it('reads owned partial exits and directs the user to full editing', async () => {
    const { query } = setup([{ percent: 50, price: 120 }])
    expect(await closeTradeEntry(input)).toMatchObject({ success: false, message: expect.stringContaining('Teilverkäufe') })
    expect(query.eq).toHaveBeenCalledWith('user_id', 'owner')
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('partial_exits'))
    expect(query.update).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it.each([[], null])('keeps ordinary closing available without partial exits (%j)', async (legs) => {
    const { query } = setup(legs)
    expect(await closeTradeEntry(input)).toMatchObject({ success: true })
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ exit: 115, net_pnl: 35 }))
  })
  it('does not query trades for an unauthenticated request', async () => {
    const { from } = setup([], '')
    expect(await closeTradeEntry(input)).toMatchObject({ success: false })
    expect(from).not.toHaveBeenCalled()
  })
  it('does not write when the owned read fails', async () => {
    const { query } = setup([], 'owner', { message: 'read failed' })
    expect(await closeTradeEntry(input)).toMatchObject({ success: false })
    expect(query.update).not.toHaveBeenCalled()
  })
})
