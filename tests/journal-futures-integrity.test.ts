import { describe, expect, it, vi } from 'vitest'
import { buildQuickPnLPreview, computeTradeMetrics, deriveEffectiveExitFromPartialExitLegs, getPartialExitSizePlan, includeJournalFuturesRemainder, restoreRemainderExitFromStoredAverage } from '@/lib/utils/calculations'
import { findJournalFuturesContract, getJournalFuturesDraftInstrument, getJournalFuturesExitCounts, isContinuousJournalFuturesSymbol, journalFuturesPercentFromCount } from '@/lib/utils/journal-futures'
import { getStoredTradeMetrics } from '@/lib/server/transformers'
import type { TradeRow } from '@/lib/types/db'
import { createTradeShareSubmission } from '@/app/actions/shared-trades'

const shareMocks = vi.hoisted(() => ({ authClient: vi.fn(), mutationClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/config', () => ({ hasSupabaseClientEnv: () => true, hasSupabaseServerEnv: () => true }))
vi.mock('@/lib/supabase/server-auth', () => ({ createSupabaseAuthServerClient: shareMocks.authClient }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: shareMocks.mutationClient }))

const storedFutures = {
  id: 'test-trade', setup: 'Synthetic', notes: null,
  market: 'MGC', instrument_type: 'futures', bias: 'Long', entry: 3897, exit: 3898,
  position_size: 2, point_value: 10, account_currency: 'USD', stop_loss: 3896,
  partial_exits: [{ percent: 50, price: 3899 }], pnl_mode: 'auto', cost_profile: 'none', broker_profile: 'manual',
} as TradeRow

describe('whole-contract partial exits', () => {
  it('recovers a one-third and two-thirds split through JSON storage', () => {
    const first = { percent: journalFuturesPercentFromCount(3, 1)!, price: 101 }
    const second = { percent: journalFuturesPercentFromCount(3, 2)!, price: 102 }
    const legs: typeof first[] = JSON.parse(JSON.stringify([first, second]))
    expect(getJournalFuturesExitCounts(3, legs)).toEqual({ counts: [1, 2], remaining: 0, closed: 3 })
    const average = deriveEffectiveExitFromPartialExitLegs({ exit: 999, partialExits: legs, futuresSize: 3 })
    expect(average).toBeCloseTo(305 / 3, 10)
    expect(restoreRemainderExitFromStoredAverage({ exit: average, partialExits: [first], futuresSize: 3 })).toBeCloseTo(102, 10)
  })

  it('rejects a position exceeded by several whole legs and keeps one actual remainder even at small percentage', () => {
    expect(getJournalFuturesExitCounts(5, [{ percent: 60 }, { percent: 60 }])).toBeNull()
    const positionSize = 2_000_000
    const partialExits = [{ percent: journalFuturesPercentFromCount(positionSize, positionSize - 1)!, price: 101 }]
    expect(deriveEffectiveExitFromPartialExitLegs({ partialExits, futuresSize: positionSize })).toBeNull()
    expect(getPartialExitSizePlan({ positionSize, partialExits, wholeContracts: true })).toMatchObject({
      remainingSize: 1, realizedSize: positionSize - 1, hasOpenRemainder: true,
    })
  })
})

describe('futures symbol selection', () => {
  it('derives the final type independently of intermediate typing and respects a selected CFD', () => {
    const typeAt = (symbol: string) => getJournalFuturesDraftInstrument(symbol, 'stocks', false)
    expect(['M', 'MG', 'MGC', 'MGC1', 'MGC1!', '', 'AAPL'].map(typeAt))
      .toEqual(['stocks', 'stocks', 'futures', 'stocks', 'futures', 'stocks', 'stocks'])
    expect(getJournalFuturesDraftInstrument('MGC1!', 'cfd', true)).toBe('cfd')
    expect(isContinuousJournalFuturesSymbol('COMEX:MGC1!')).toBe(true)
    expect(findJournalFuturesContract('MGC1!')).toBeUndefined()
    expect(findJournalFuturesContract('mgcz6')?.symbol).toBe('MGC')
  })
})

describe('automatic and stored metrics', () => {
  const usdLong = {
    market: 'MGC', instrumentType: 'futures', bias: 'Long', positionSize: 1, pointValue: 10,
    pnlMode: 'auto', accountCurrency: 'USD', entry: 3897.3, exit: 3897.4,
    costProfile: 'none', brokerProfile: 'manual',
  }

  it.each([[0.99, 0.01], [1, 0], [1.01, -0.01]])('keeps the same cent value in the form and journal after %s USD costs', (fees, outcome) => {
    expect(computeTradeMetrics({ ...usdLong, fees }).netPnL).toBe(outcome)
    expect(buildQuickPnLPreview({ ...usdLong, totalCosts: fees, futuresUsd: true }).netPnL).toBe(outcome)
  })

  it('leaves an explicit manual statement at its original precision', () => {
    expect(computeTradeMetrics({ ...usdLong, pnlMode: 'manual', pnl: -0.004 }).netPnL).toBe(-0.004)
  })

  it('uses symmetric cent rounding at prices where floating-point arithmetic crosses the half-cent threshold', () => {
    expect(computeTradeMetrics({ ...usdLong, fees: 0.995 }).netPnL).toBe(0.01)
    expect(computeTradeMetrics({ ...usdLong, bias: 'Short', fees: 0.005 }).netPnL).toBe(-1.01)
    const partialExits = [{ percent: 50, price: 3897.4 }]
    expect(computeTradeMetrics({ ...usdLong, exit: null, positionSize: 2, partialExits, fees: 1.99 }).netPnL).toBe(0.01)
  })

  it('distinguishes a true half-cent from a slightly smaller net, independent of position size', () => {
    expect(computeTradeMetrics({ ...usdLong, fees: 0.995000001 }).netPnL).toBe(0)
    expect(computeTradeMetrics({ ...usdLong, positionSize: 20_000, fees: 19_999.995 }).netPnL).toBe(0.01)
    expect(computeTradeMetrics({ ...usdLong, fees: 0.99, exchangeFees: 0.005 }).netPnL).toBe(0.01)
    expect(buildQuickPnLPreview({ ...usdLong, totalCosts: 0.99 + 0.005, futuresCosts: [0.99, 0.005], futuresUsd: true }).netPnL).toBe(0.01)
  })

  it('uses recorded leg prices when whole contracts fully cover an averaged exit', () => {
    const partialExits = [
      { percent: journalFuturesPercentFromCount(3, 1)!, price: 3897.4 },
      { percent: journalFuturesPercentFromCount(3, 2)!, price: 3897.3 },
    ]
    const exit = deriveEffectiveExitFromPartialExitLegs({ partialExits, futuresSize: 3 })
    expect(computeTradeMetrics({ ...usdLong, exit, positionSize: 3, partialExits, fees: 0.995 }).netPnL).toBe(0.01)
    const withRemainder = includeJournalFuturesRemainder(partialExits.slice(0, 1), 3, 3897.3)
    expect(buildQuickPnLPreview({ ...usdLong, exit, positionSize: 3, totalCosts: 0.995,
      futuresUsd: true, futuresFullLegs: withRemainder }).netPnL).toBe(0.01)
  })

  it('keeps a legacy position with a partial gain and a live remainder classified as open', () => {
    expect(getStoredTradeMetrics({ ...storedFutures, exit: null, capture_result: null })).toMatchObject({
      captureResult: 'open', metrics: { netPnL: 20 }, partialSizePlan: { remainingSize: 1, hasOpenRemainder: true },
    })
  })

  it('uses the same stored exit basis when preparing journal and share values', () => {
    const stored = storedFutures
    const unverified = getStoredTradeMetrics(stored)
    expect(unverified).toMatchObject({ ambiguousPartialExit: true, metrics: { netPnL: null, autoNetPnL: null, realizedRValue: null, rValue: null } })
    expect(getStoredTradeMetrics({ ...stored, exit_price_basis: 'weighted-remainder-v1' }).metrics.netPnL).toBe(20)
    expect(getStoredTradeMetrics({ ...stored, pnl_mode: 'manual', net_pnl: 30.123 }).metrics.netPnL).toBe(30.123)
    const invalidLegacySplit = { ...stored, position_size: 1, exit_price_basis: 'weighted-remainder-v1' as const }
    expect(getStoredTradeMetrics(invalidLegacySplit)).toMatchObject({ metrics: { netPnL: null }, partialSizePlan: { realizedSize: null, remainingSize: null } })
    expect(getStoredTradeMetrics({ ...invalidLegacySplit, pnl_mode: 'manual', net_pnl: 12.345 }).metrics.netPnL).toBe(12.345)
  })

  it.each([
    { basis: null, expected: null },
    { basis: 'weighted-remainder-v1' as const, expected: 20 },
  ])('uses the validated price basis when submitting a share (%j)', async ({ basis, expected }) => {
    const ownedRead = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { ...storedFutures, exit_price_basis: basis }, error: null }),
    }
    const tags = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [] }),
    }
    const existingSubmission = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }
    shareMocks.authClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-owner' } } }) },
      from: vi.fn((table: 'trades' | 'trade_tags' | 'shared_trade_submissions') => ({
        trades: ownedRead, trade_tags: tags, shared_trade_submissions: existingSubmission,
      }[table])),
    })
    const insert = vi.fn().mockResolvedValue({ error: null })
    shareMocks.mutationClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) })

    expect(await createTradeShareSubmission({
      tradeId: storedFutures.id, shareMode: 'vault', visibility: 'anonymous', userNote: '', vaultOptIn: true,
    })).toMatchObject({ success: true })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ shared_net_pnl: expected }))
  })
})
