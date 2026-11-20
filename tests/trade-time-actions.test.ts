import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ client: vi.fn(), env: vi.fn(), revalidate: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: mocks.env }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: mocks.client }))
vi.mock('@/lib/server/media-cleanup', () => ({ processMediaCleanupForPaths: vi.fn() }))
import { createQuickTradeEntry, createTradeEntry, updateTradeEntry } from '@/app/actions/trades'
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

function futuresInput(patch: Partial<TradeCaptureInput> = {}) {
  return input({
    market: 'MGCZ6', instrumentType: 'unknown', positionSize: '5', bias: 'Short',
    entry: '3897.3', stopLoss: '3898.3', exit: '3857.2', pointValue: '1', accountCurrency: 'USD',
    partialExit1Percent: '', partialExit1Price: '', ...patch,
  })
}

describe('journal futures pricing on owned writes and reads', () => {
  it.each(['create', 'update'])('%s uses USD per price point and reloads five MGC contracts correctly', async kind => {
    const { rpc } = client()
    const result = kind === 'create' ? await createTradeEntry(futuresInput()) : await updateTradeEntry(id, futuresInput())
    expect(result.success, result.message).toBe(true)
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload).toMatchObject({ market: 'MGCZ6', instrument_type: 'futures', point_value: 10, position_size: 5 })
    const trade = mapTradeRowToTrade({ ...payload, id })
    expect(trade.netPnL).toBeCloseTo(2005)
    expect(trade.riskAmount).toBeCloseTo(50)
    expect(trade.rValue).toBeCloseTo(40.1)
  })

  it('converts a known NQ root into a 20 USD point instead of the submitted tick value', async () => {
    const { rpc } = client()
    const values = futuresInput({ market: 'NQ', bias: 'Long', entry: '20000', stopLoss: '19990', exit: '20010', positionSize: '1', pointValue: '5' })
    expect((await createTradeEntry(values)).success).toBe(true)
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload.point_value).toBe(20)
    expect(mapTradeRowToTrade({ ...payload, id }).netPnL).toBe(200)
    expect(mapTradeRowToTrade({ ...payload, id, point_value: 5 }).netPnL).toBeUndefined()
  })

  it('prepares a recognized screenshot capture with a contract multiplier and no settlement amount', async () => {
    const { rpc } = client()
    expect((await createQuickTradeEntry({ market: 'MGCZ6', setup: 'Test', notes: '', captureResult: 'open', tags: [] })).success).toBe(true)
    expect(rpc.mock.calls[0][1].p_trade).toMatchObject({ market: 'MGCZ6', instrument_type: 'futures', point_value: 10, net_pnl: null })
  })

  it('blocks automatic EUR results and fractional contracts before writes', async () => {
    const { rpc } = client()
    expect(await createTradeEntry(futuresInput({ accountCurrency: 'EUR' }))).toMatchObject({ success: false, fieldErrors: { accountCurrency: expect.any(String) } })
    expect(await updateTradeEntry(id, futuresInput({ positionSize: '1.5' }))).toMatchObject({ success: false, fieldErrors: { positionSize: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('keeps the broker statement in EUR while suppressing price-based partial P&L and realised R', async () => {
    const { rpc } = client()
    const values = futuresInput({
      pnlMode: 'manual', netPnL: '35', accountCurrency: 'EUR', exit: '',
      partialExit1Percent: '40', partialExit1Price: '3896.3',
    })
    expect((await updateTradeEntry(id, values)).success).toBe(true)
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload).toMatchObject({ account_currency: 'EUR', net_pnl: 35 })
    const trade = mapTradeRowToTrade({ ...payload, id })
    expect(trade).toMatchObject({ netPnL: 35, riskAmount: null, rValue: null })
    expect(mapTradeRowToTrade({ ...payload, id, net_pnl: null }).netPnL).toBeUndefined()
  })

  it('preserves an explicitly classified CFD and its separate point value', async () => {
    const { rpc } = client()
    expect((await createTradeEntry(futuresInput({ instrumentType: 'cfd', pointValue: '2' }))).success).toBe(true)
    expect(rpc.mock.calls[0][1].p_trade).toMatchObject({ instrument_type: 'cfd', point_value: 2 })
  })

  it.each(['1', '5'])('rejects a half-position split that implies fractional contracts (%s MGC)', async positionSize => {
    const { rpc } = client()
    const values = futuresInput({ positionSize, partialExit1Percent: '50', partialExit1Price: '3896.3' })
    expect(await createTradeEntry(values)).toMatchObject({ success: false, fieldErrors: { exit: expect.any(String) } })
    expect(await updateTradeEntry(id, values)).toMatchObject({ success: false, fieldErrors: { exit: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('persists each execution price and reloads a third and two-thirds as whole quantities', async () => {
    const { rpc } = client()
    const values = futuresInput({
      positionSize: '3', exit: '3894.3', partialExit1Percent: String(100 / 3), partialExit1Price: '3896.3',
    })
    expect(await createTradeEntry(values)).toMatchObject({ success: true })
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload.exit_price_basis).toBeNull()
    expect(payload.exit).toBeCloseTo((3896.3 + 2 * 3894.3) / 3, 10)
    expect(payload.partial_exits).toEqual([{ percent: 100 / 3, price: 3896.3 }, { percent: (2 / 3) * 100, price: 3894.3 }])
    expect(mapTradeRowToTrade({ ...payload, id })).toMatchObject({ netPnL: 70, partialExitRealizedSize: 3 })
  })

  it('records an executed futures leg with a remaining position and no final exit price', async () => {
    const { rpc } = client()
    const values = futuresInput({ exit: '', partialExit1Percent: '40', partialExit1Price: '3896.3' })
    for (const result of [await createTradeEntry(values), await updateTradeEntry(id, values)]) {
      expect(result).toMatchObject({ success: true })
    }
    for (const [, request] of rpc.mock.calls) {
      expect(request.p_trade).toMatchObject({ exit: null, exit_price_basis: null, capture_result: 'open' })
      expect(mapTradeRowToTrade({ ...request.p_trade, id })).toMatchObject({
        netPnL: 20, captureResult: 'open', partialExitRemainingSize: 3, partialExitHasOpenRemainder: true,
      })
    }
  })

  it('persists the final execution when its share is below the old weighted-exit tolerance', async () => {
    const { rpc } = client()
    const values = futuresInput({ positionSize: '2000000', partialExit1Percent: '99.99995', partialExit1Price: '3896.3' })
    expect(await createTradeEntry(values, 'en')).toMatchObject({ success: true })
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload.exit_price_basis).toBeNull()
    expect(payload.partial_exits).toHaveLength(2)
    expect(mapTradeRowToTrade({ ...payload, id })).toMatchObject({ partialExitRealizedSize: 2_000_000 })
  })

  it('records the same half-cent outcome through the final exit and the all-partials form', async () => {
    const { rpc } = client()
    const values = futuresInput({ entry: '3897.3', stopLoss: '3897.2', bias: 'Long', positionSize: '3', fees: '0.995',
      partialExit1Percent: String(100 / 3), partialExit1Price: '3897.4' })
    expect(await createTradeEntry({ ...values, exit: '3897.3' }, 'en')).toMatchObject({ success: true })
    expect(await updateTradeEntry(id, { ...values, exit: '', partialExit2Percent: String((2 / 3) * 100), partialExit2Price: '3897.3' }, 'en')).toMatchObject({ success: true })
    for (const [, request] of rpc.mock.calls) {
      const reloaded = JSON.parse(JSON.stringify(request.p_trade))
      expect(reloaded.exit_price_basis).toBeNull()
      expect(reloaded.capture_result).toBe('winner')
      expect(mapTradeRowToTrade({ ...reloaded, id }).netPnL).toBe(0.01)
    }
  })

  it.each(['0', '-1'])('rejects rest exit %s before averaging it with a positive partial price', async exit => {
    const { rpc } = client()
    const values = futuresInput({ entry: '2500', stopLoss: '2499', bias: 'Long', positionSize: '2',
      exit, partialExit1Percent: '50', partialExit1Price: '2600' })
    for (const result of [await createTradeEntry(values, 'en'), await updateTradeEntry(id, values, 'en')]) {
      expect(result).toMatchObject({ success: false, fieldErrors: { exit: expect.stringContaining('greater than zero') } })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('classifies a one-tick gain with equal costs as break-even on the write and read paths', async () => {
    const { rpc } = client()
    const values = futuresInput({
      entry: '3897.3', exit: '3897.4', stopLoss: '3897.2', bias: 'Long', positionSize: '1', fees: '1', captureResult: 'loser',
    })
    expect(await createTradeEntry(values)).toMatchObject({ success: true })
    const payload = rpc.mock.calls[0][1].p_trade
    expect(payload).toMatchObject({ net_pnl: null, capture_result: 'breakeven' })
    expect(mapTradeRowToTrade({ ...payload, id, capture_result: 'loser' })).toMatchObject({ netPnL: 0, captureResult: 'breakeven' })
  })

  it('recognises a continuous chart symbol and requires a traded contract for automatic pricing', async () => {
    const { rpc } = client()
    const values = futuresInput({ market: 'COMEX:MGC1!' })
    expect(await createTradeEntry(values)).toMatchObject({ success: false, fieldErrors: { market: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
    expect(await createTradeEntry({ ...values, pnlMode: 'manual', netPnL: '12.345' })).toMatchObject({ success: true })
    expect(rpc.mock.calls[0][1].p_trade).toMatchObject({ net_pnl: 12.345, instrument_type: 'futures' })
  })
})

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
  it('sends the same trade data in either language, including time and partial exits', async () => {
    const { rpc } = client()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-01T09:00:00Z'))
    try {
      const values = input({ tradeOccurredAt: '2026-07-01T12:00' })
      const de = await createTradeEntry(values)
      const en = await createTradeEntry(values, 'en')
      expect(de.success).toBe(true)
      expect(en.message).toBe('Trade saved: TEST-USDT.P · Test.')
      expect(rpc).toHaveBeenCalledTimes(2)
      const [deCall, enCall] = rpc.mock.calls
      expect(deCall[1].p_trade_id).toBe(deCall[1].p_trade.id)
      expect(enCall[1].p_trade_id).toBe(enCall[1].p_trade.id)
      expect(enCall).toEqual([deCall[0], {
        ...deCall[1],
        p_trade_id: enCall[1].p_trade_id,
        p_trade: { ...deCall[1].p_trade, id: enCall[1].p_trade.id },
      }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('explains an ambiguous Berlin time in English before a write', async () => {
    const { rpc } = client()
    const result = await updateTradeEntry(id, input({ tradeOccurredAt: '2026-10-25T02:30' }), 'en')
    expect(result).toMatchObject({
      success: false,
      fieldErrors: { tradeOccurredAt: 'This time occurs twice because the clocks change in Berlin. Choose a different time.' },
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['manual', 'override', ''])('rejects an English P&L with a comma before create or update in mode %j', async (pnlMode) => {
    const values = input({ pnlMode, netPnL: '1,234' })
    for (const result of [await createTradeEntry(values, 'en'), await updateTradeEntry(id, values, 'en')]) {
      expect(result).toMatchObject({
        success: false,
        fieldErrors: { netPnL: expect.stringContaining('no thousands separators') },
      })
    }
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it.each([
    ['entry', 'entry'],
    ['exit', 'exit'],
    ['partialExit1Price', 'exit'],
    ['partialExit1Percent', 'exit'],
    ['positionSize', 'positionSize'],
    ['fees', 'fees'],
  ] as const)('rejects an English comma in %s before interpreting or writing the number', async (inputField, errorField) => {
    const values = input({ [inputField]: '1,234' })
    for (const result of [await createTradeEntry(values, 'en'), await updateTradeEntry(id, values, 'en')]) {
      expect(result).toMatchObject({
        success: false,
        fieldErrors: { [errorField]: expect.stringContaining('no thousands separators') },
      })
    }
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it('retains the precision of an amount taken from the calculator in override mode', async () => {
    const { rpc } = client()
    expect((await createTradeEntry(input({ pnlMode: 'override', netPnL: String(0.004) }), 'en')).success).toBe(true)
    expect(rpc.mock.calls[0][1].p_trade).toMatchObject({ net_pnl: 0.004, pnl_mode: 'override' })
  })

  it('keeps the explicit instant when the Berlin clock shows a repeated time', async () => {
    const { rpc } = client()
    const instant = '2026-10-25T01:30:12.345Z'
    expect(formatTradeTimeInputValue(instant)).toBe('2026-10-25T02:30')
    expect((await createTradeEntry(input({ tradeOccurredAt: instant }), 'en')).success).toBe(true)
    expect(rpc.mock.calls[0][1].p_trade.captured_at).toBe(instant)
  })

  it.each([
    ['en', '1234.56', 1234.56],
    ['de', '1234,56', 1234.56],
    ['de', '1234.56', 1234.56],
    ['en', '0', 0],
    ['en', '-0.004', -0.004],
  ] as const)('saves the explicit %s P&L %s without rounding', async (locale, netPnL, amount) => {
    const { rpc } = client()
    const values = input({ pnlMode: 'manual', netPnL })
    expect((await createTradeEntry(values, locale)).success).toBe(true)
    expect((await updateTradeEntry(id, values, locale)).success).toBe(true)
    expect(rpc.mock.calls.map((call) => call[1].p_trade.net_pnl)).toEqual([amount, amount])
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
