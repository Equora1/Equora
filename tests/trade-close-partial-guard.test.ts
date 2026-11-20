import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ client: vi.fn(), env: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.env }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/media-cleanup', () => ({ processMediaCleanupForPaths: vi.fn() }))
import { closeTradeEntry } from '@/app/actions/trades'

const input = { tradeId: 'trade', exit: '115', netPnL: '35', captureResult: 'winner' as const }
function setup(partial_exits: unknown, user = 'owner', error: unknown = null, applied = true) {
  const write = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: applied ? { id: 'trade' } : null, error: null }) }
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'trade', user_id: user, market: 'TEST', setup: 'Test', notes: null, account_currency: 'EUR', instrument_type: 'cfd', partial_exits }, error }), update: vi.fn().mockReturnValue(write) }
  const from = vi.fn().mockReturnValue(query)
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: user ? { id: user } : null } }) }, from })
  return { query, from, write }
}
beforeEach(() => { vi.clearAllMocks(); mocks.env.mockReturnValue(true) })

describe('recognized futures quick close', () => {
  function futuresRow(overrides: Record<string, unknown> = {}, applied = true) {
    const row = {
      market: 'MGCZ6', instrument_type: 'futures', setup: 'Test', account_currency: 'USD',
      point_value: 10, position_size: 5, entry: 3897.3, bias: 'Short',
      cost_profile: 'none', broker_profile: 'manual', partial_exits: null, notes: 'Initial note',
      capture_status: 'complete', capture_result: 'open', completed_at: null, exit: null, net_pnl: null,
      ...overrides,
    }
    const write = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: applied ? { id: 'trade' } : null, error: null }) }
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }), update: vi.fn().mockReturnValue(write) }
    mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner' } } }) }, from: vi.fn().mockReturnValue(query) })
    return { query, write }
  }

  it.each([{ account_currency: 'EUR' }, { point_value: 1 }, { position_size: 0.5 }])('blocks price-based close for an unverified basis %j', async patch => {
    const { query } = futuresRow(patch)
    expect(await closeTradeEntry({ ...input, exit: '3857.2', netPnL: '' }, 'en')).toMatchObject({ success: false, message: expect.stringContaining('verified USD contract details') })
    expect(query.update).not.toHaveBeenCalled()
  })

  it.each([true, false])('checks the stored basis and requires a confirmed write (%s)', async applied => {
    const { query, write } = futuresRow({}, applied)
    expect(await closeTradeEntry({ ...input, exit: '3857.2', netPnL: '' }, 'en')).toMatchObject({ success: applied })
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ exit: 3857.2, net_pnl: null, pnl_mode: 'auto' }))
    expect(write.eq).toHaveBeenCalledWith('account_currency', 'USD')
    expect(write.eq).toHaveBeenCalledWith('point_value', 10)
    expect(write.eq).toHaveBeenCalledWith('entry', 3897.3)
    expect(write.eq).toHaveBeenCalledWith('bias', 'Short')
    expect(write.eq).toHaveBeenCalledWith('notes', 'Initial note')
    expect(write.eq).toHaveBeenCalledWith('capture_status', 'complete')
    expect(write.eq).toHaveBeenCalledWith('capture_result', 'open')
    expect(write.is).toHaveBeenCalledWith('completed_at', null)
    expect(write.is).toHaveBeenCalledWith('partial_exits', null)
  })

  it.each([{ entry: null }, { bias: null }, { bias: 'Neutral' }])('rejects an incomplete automatic price calculation %j', async patch => {
    const { query } = futuresRow(patch)
    expect(await closeTradeEntry({ ...input, exit: '3857.2', netPnL: '' }, 'en')).toMatchObject({
      success: false, message: expect.stringContaining('trade direction'),
    })
    expect(query.update).not.toHaveBeenCalled()
  })

  it('uses net after costs to decide the outcome and guards those costs on the write', async () => {
    const { query, write } = futuresRow({ bias: 'Long', position_size: 1, fees: 1.01 })
    expect(await closeTradeEntry({ ...input, exit: '3897.4', netPnL: '' }, 'en')).toMatchObject({
      success: true, message: expect.stringContaining('Outcome based on P&L: Loss.'),
    })
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ net_pnl: null, capture_result: 'loser', pnl_mode: 'auto' }))
    expect(write.eq).toHaveBeenCalledWith('fees', 1.01)
  })

  it('lets a draft with a selected outcome accept a manual account statement', async () => {
    const { query, write } = futuresRow({ entry: null, account_currency: 'EUR', capture_status: 'incomplete', capture_result: 'winner' })
    expect(await closeTradeEntry({ ...input, exit: '', netPnL: '12.345' }, 'en')).toMatchObject({ success: true })
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ net_pnl: 12.345, capture_result: 'winner', pnl_mode: 'manual' }))
    expect(write.eq).toHaveBeenCalledWith('capture_status', 'incomplete')
  })

  it('preserves a previously completed close', async () => {
    const { query } = futuresRow({ exit: 3897.4, capture_result: 'loser' })
    expect(await closeTradeEntry({ ...input, exit: '3857.2', netPnL: '' }, 'en')).toMatchObject({ success: false })
    expect(query.update).not.toHaveBeenCalled()
  })
})
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

  it('does not report a successful close after the stored trade has been reclassified', async () => {
    const { write } = setup([], 'owner', null, false)
    expect(await closeTradeEntry(input)).toMatchObject({ success: false })
    expect(write.eq).toHaveBeenCalledWith('market', 'TEST')
    expect(write.eq).toHaveBeenCalledWith('instrument_type', 'cfd')
    expect(write.eq).toHaveBeenCalledWith('partial_exits', '[]')
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it('uses English feedback without changing the result inferred from P&L', async () => {
    const { query } = setup([])
    expect(await closeTradeEntry({ ...input, netPnL: '-0.12' }, 'en')).toMatchObject({
      success: true,
      message: expect.stringContaining('Outcome based on P&L: Loss.'),
    })
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      exit: 115,
      net_pnl: -0.12,
      capture_status: 'complete',
      capture_result: 'loser',
    }))
  })
  it('does not query trades for an unauthenticated request', async () => {
    const { from } = setup([], '')
    expect(await closeTradeEntry(input)).toMatchObject({ success: false })
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects an English P&L with a comma before querying or writing', async () => {
    expect(await closeTradeEntry({ ...input, netPnL: '1,234' }, 'en')).toMatchObject({
      success: false,
      message: expect.stringContaining('no thousands separators'),
    })
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it('rejects an ambiguous exit price before closing the trade', async () => {
    expect(await closeTradeEntry({ ...input, exit: '1,234' }, 'en')).toMatchObject({
      success: false,
      message: expect.stringContaining('no thousands separators'),
    })
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it.each([['', null], ['0', 0], ['0,004', 0.004]] as const)('preserves the German close amount %j', async (netPnL, expected) => {
    const { query } = setup([])
    expect((await closeTradeEntry({ ...input, netPnL })).success).toBe(true)
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ net_pnl: expected }))
  })
  it('does not write when the owned read fails', async () => {
    const { query } = setup([], 'owner', { message: 'read failed' })
    expect(await closeTradeEntry(input)).toMatchObject({ success: false })
    expect(query.update).not.toHaveBeenCalled()
  })
})
