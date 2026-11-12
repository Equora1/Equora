import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ client: vi.fn(), env: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.env }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/media-cleanup', () => ({ processMediaCleanupForPaths: vi.fn() }))
import { createTradeEntry, updateTradeEntry } from '@/app/actions/trades'
import { formatTradeTimeInputValue } from '@/lib/utils/trade-time'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { validateTradeCaptureInput, type TradeCaptureInput } from '@/lib/utils/trade-validation'
const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
function input(patch: Partial<TradeCaptureInput> = {}): TradeCaptureInput {
  const fields = 'market setup emotion bias ruleCheck reviewRepeatability reviewState reviewLesson tradeOccurredAt entry stopLoss takeProfit exit netPnL riskPercent accountSize marginUsed rMultiple pnlMode costProfile brokerProfile instrumentType accountTemplate marketTemplate positionSize pointValue fees exchangeFees fundingFees fundingRateBps fundingIntervals spreadCost slippage accountCurrency cryptoMarketType executionType fundingDirection quoteAsset leverage userCostProfileId notes'.split(' ')
  return { ...Object.fromEntries(fields.map(k => [k, ''])), market: 'TEST-USDT.P', setup: 'Test', bias: 'Long', tradeOccurredAt: '2026-01-01T12:00', entry: '100', stopLoss: '90', exit: '115', positionSize: '2', pnlMode: 'auto', costProfile: 'none', brokerProfile: 'manual', instrumentType: 'crypto', cryptoMarketType: 'perps', accountCurrency: 'USDT', quoteAsset: 'USDT', partialExit1Percent: '50', partialExit1Price: '120', tags: [], ...patch } as TradeCaptureInput
}
function client(original = '2026-01-01T11:00:09.123Z') {
  const row = { id, created_at: '2026-01-01T10:00:00Z', captured_at: original, notes: '' }
  const rpc = vi.fn().mockResolvedValue({ data: { tradeId: id }, error: null })
  const tradeQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: row, error: null })) }
  const setupQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) }
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: owner } } })) }, rpc, from: vi.fn(table => table === 'trades' ? tradeQuery : setupQuery) })
  return { rpc, row }
}
beforeEach(() => { vi.clearAllMocks(); mocks.env.mockReturnValue(true) })

describe('owned Create/Update time contract with mocked persistence', () => {
  it.each(['create', 'update'])('%s interprets a changed summer wall time as Berlin and retains partial-close metrics', async kind => {
    const { rpc } = client()
    const values = input({ tradeOccurredAt: '2026-07-01T12:00' })
    const result = kind === 'create' ? await createTradeEntry(values) : await updateTradeEntry(id, values)
    expect(result.success, result.message).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(1)
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload).toMatchObject({ captured_at: '2026-07-01T10:00:00.000Z', exit: 117.5, exit_price_basis: 'weighted-remainder-v1' })
    expect(mapTradeRowToTrade({ ...payload, id })).toMatchObject({ netPnL: 35, rValue: 1.75 })
  })
  it('creates the original winter regression case at 11:00Z', async () => {
    const { rpc } = client()
    expect((await createTradeEntry(input())).success).toBe(true)
    expect(rpc.mock.calls[0][1].p_trade.captured_at).toBe('2026-01-01T11:00:00.000Z')
  })
  it.each(['2026-10-25T00:30:17.123Z', '2026-10-25T01:30:42.987Z', '2026-01-01T11:00:09.123Z'])('retains the owned instant across two unchanged saves: %s', original => clientRoundtrip(original))
  async function clientRoundtrip(original: string) {
    const { rpc, row } = client(original)
    for (let i = 0; i < 2; i++) {
      const values = input({ tradeOccurredAt: formatTradeTimeInputValue(row.captured_at) })
      expect(validateTradeCaptureInput(values, row.captured_at).isValid).toBe(true)
      expect((await updateTradeEntry(id, values)).success).toBe(true)
      const payload = rpc.mock.calls[i][1].p_trade
      expect(payload.captured_at).toBe(original)
      expect(payload.exit).toBe(117.5)
      expect(mapTradeRowToTrade({ ...payload, id })).toMatchObject({ netPnL: 35, rValue: 1.75 })
      row.captured_at = payload.captured_at
    }
    expect(rpc).toHaveBeenCalledTimes(2)
  }
  it.each(['2026-03-29T02:30', '2026-10-25T02:30', '2026-02-30T12:00'])('rejects invalid or ambiguous creation before RPC: %s', wall => {
    const { rpc } = client()
    return createTradeEntry(input({ tradeOccurredAt: wall })).then(result => {
      expect(result).toMatchObject({ success: false, fieldErrors: { tradeOccurredAt: expect.any(String) } })
      expect(rpc).not.toHaveBeenCalled()
    })
  })
  it.each(['2026-03-29T02:30', '2026-10-25T02:30', '2026-02-30T12:00'])('rejects a changed invalid/ambiguous update before RPC: %s', async wall => {
    const { rpc } = client()
    const result = await updateTradeEntry(id, input({ tradeOccurredAt: wall }))
    expect(result).toMatchObject({ success: false, fieldErrors: { tradeOccurredAt: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not trust a supplied reference instead of the owned stored instant', async () => {
    const { rpc } = client()
    const values = { ...input({ tradeOccurredAt: '2026-10-25T02:30' }), originalTradeTimeIso: '2026-10-25T01:30:00Z' }
    expect((await updateTradeEntry(id, values)).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('preserves the stored instant when an edit leaves time blank', async () => {
    const { rpc } = client()
    expect((await updateTradeEntry(id, input({ tradeOccurredAt: '' }))).success).toBe(true)
    expect(rpc.mock.calls[0][1].p_trade.captured_at).toBe('2026-01-01T11:00:09.123Z')
  })
  it('keeps the creation default as the actual timestamp when time is blank', async () => {
    const { rpc } = client()
    expect((await createTradeEntry(input({ tradeOccurredAt: '' }))).success).toBe(true)
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload.captured_at).toBe(payload.created_at)
  })
})
