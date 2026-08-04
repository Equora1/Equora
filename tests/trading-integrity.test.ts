import { describe, expect, it } from 'vitest'
import type { Trade } from '../lib/types/trade'
import { buildSetupPerformanceRows } from '../lib/utils/setup-analytics'
import { getTradeTrustState, getTrustedTrades } from '../lib/utils/trade-trust'
import { buildCsvImportPreview, inferCsvImportMapping } from '../lib/utils/trade-import'
import { computeTradeMetrics, derivePartialExitPnL, resolveTradeCostBreakdown } from '../lib/utils/calculations'
import { buildDrawdownProfile, getCoreMetrics } from '../lib/utils/analytics'
import { buildDrawdownSeries, buildEquitySeries } from '../lib/utils/chart-series'

function trade(overrides: Partial<Trade>): Trade {
  return {
    id: crypto.randomUUID(),
    date: '2026-08-02T09:00:00.000Z',
    market: 'DAX',
    setup: 'Opening Range',
    result: '',
    r: '',
    emotion: '',
    quality: 'B-Setup',
    session: 'London',
    concept: '',
    captureStatus: 'complete',
    ...overrides,
  }
}

describe('trading and data integrity gates', () => {
  it('does not classify monetary trades without currency as trusted', () => {
    const missingCurrency = trade({ netPnL: 125, accountCurrency: null })

    expect(getTradeTrustState(missingCurrency)).toBe('missing-currency')
    expect(getTrustedTrades([missingCurrency])).toHaveLength(0)
  })

  it('keeps signed costs and blocks mixed-currency cost sums', () => {
    const [eurRow] = buildSetupPerformanceRows(['Opening Range'], [
      trade({ netPnL: 50, accountCurrency: 'EUR', totalCosts: -3 }),
    ])
    expect(eurRow?.totalCosts).toBe(-3)
    expect(eurRow?.costCurrency).toBe('EUR')

    const [mixedRow] = buildSetupPerformanceRows(['Opening Range'], [
      trade({ netPnL: 50, accountCurrency: 'EUR', totalCosts: 2 }),
      trade({ netPnL: 60, accountCurrency: 'USD', totalCosts: 4 }),
    ])
    expect(mixedRow?.costScopeKind).toBe('mixed')
    expect(mixedRow?.totalCosts).toBe(0)
  })

  it('maps supported CSV row currencies and rejects unsupported units', () => {
    const headers = ['Date', 'Symbol', 'PnL', 'Currency']
    const mapping = inferCsvImportMapping(headers)
    const preview = buildCsvImportPreview([
      { Date: '2026-08-02T09:00:00Z', Symbol: 'BTCUSDT', PnL: '10', Currency: 'USDT' },
      { Date: '2026-08-02T10:00:00Z', Symbol: 'BTCEUR', PnL: '12', Currency: 'BTC' },
    ], mapping)

    expect(preview[0]?.normalized.currency).toBe('USDT')
    expect(preview[0]?.status).not.toBe('skip')
    expect(preview[1]?.status).toBe('skip')
    expect(preview[1]?.issues.join(' ')).toContain('nicht unterstützt')
  })

  it('calculates symmetric long/short gross P&L and subtracts explicit costs', () => {
    const common = {
      pnlMode: 'auto',
      instrumentType: 'stocks',
      entry: 100,
      positionSize: 2,
      fees: 1,
      exchangeFees: 1,
      fundingFees: 0,
      spreadCost: 1,
      slippage: 1,
      costProfile: 'none',
      accountCurrency: 'EUR',
    }
    const long = computeTradeMetrics({ ...common, exit: 110, bias: 'Long' })
    const short = computeTradeMetrics({ ...common, exit: 90, bias: 'Short' })

    expect(long.grossPnL).toBe(20)
    expect(short.grossPnL).toBe(20)
    expect(long.totalCosts).toBe(4)
    expect(long.netPnL).toBe(16)
    expect(short.netPnL).toBe(16)
  })

  it('keeps received funding as a signed credit, including partial-exit allocation', () => {
    const costs = resolveTradeCostBreakdown({
      instrumentType: 'crypto',
      cryptoMarketType: 'perps',
      entry: 100,
      positionSize: 10,
      fees: 0,
      exchangeFees: 0,
      spreadCost: 0,
      slippage: 0,
      fundingDirection: 'received',
      fundingRateBps: 10,
      fundingIntervals: 2,
      costProfile: 'none',
    })
    const partial = derivePartialExitPnL({
      instrumentType: 'crypto',
      entry: 100,
      bias: 'Long',
      positionSize: 10,
      partialExits: [{ percent: 50, price: 110 }],
      totalCosts: costs.totalCosts,
    })

    expect(costs.fundingFees).toBe(-2)
    expect(costs.totalCosts).toBe(-2)
    expect(partial.costShare).toBe(-1)
    expect(partial.grossPnL).toBe(50)
    expect(partial.netPnL).toBe(51)
  })

  it('matches exact profit-factor, win-rate and drawdown golden values', () => {
    const trades = [
      trade({ date: '2026-01-01T10:00:00Z', netPnL: 100, accountCurrency: 'EUR' }),
      trade({ date: '2026-01-02T10:00:00Z', netPnL: -40, accountCurrency: 'EUR' }),
      trade({ date: '2026-01-03T10:00:00Z', netPnL: -80, accountCurrency: 'EUR' }),
      trade({ date: '2026-01-04T10:00:00Z', netPnL: 30, accountCurrency: 'EUR' }),
    ]
    const metrics = getCoreMetrics(trades)
    const drawdown = buildDrawdownProfile(trades)
    const series = buildDrawdownSeries(trades)

    expect(metrics.netPnL).toBe(10)
    expect(metrics.grossProfit).toBe(130)
    expect(metrics.grossLoss).toBe(-120)
    expect(metrics.profitFactor).toBeCloseTo(130 / 120, 10)
    expect(metrics.winRate).toBe(50)
    expect(drawdown.maxDepth).toBe(120)
    expect(drawdown.currentDepth).toBe(90)
    expect(series.deepestValue).toBe(120)
    expect(series.latestValue).toBe(90)
  })

  it('builds no equity points for mixed currencies', () => {
    const series = buildEquitySeries([
      trade({ netPnL: 10, accountCurrency: 'EUR' }),
      trade({ netPnL: 10, accountCurrency: 'USD' }),
    ])

    expect(series.monetaryScope.kind).toBe('mixed')
    expect(series.totalPoints).toBe(0)
    expect(series.latestValue).toBe(0)
  })
})
