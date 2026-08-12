import { describe, expect, it } from 'vitest'
import type { FilterState, Trade } from '../lib/types/trade'
import { buildSetupPerformanceRows } from '../lib/utils/setup-analytics'
import { getTradeTrustState, getTrustedTrades } from '../lib/utils/trade-trust'
import { buildCsvImportPreview, inferCsvImportMapping } from '../lib/utils/trade-import'
import { computeTradeMetrics, derivePartialExitPnL, resolveTradeCostBreakdown } from '../lib/utils/calculations'
import { buildDrawdownProfile, buildKillZonePerformance, buildSessionPerformance, buildTimeWindowPerformance, getCoreMetrics } from '../lib/utils/analytics'
import { buildDrawdownSeries, buildEquitySeries } from '../lib/utils/chart-series'
import { filterTrades } from '../lib/utils/filters'
import {
  getAnalyticsEvidenceState,
  getAnalyticsBucketEvidenceLabel,
  getAnalyticsBucketTone,
  MIN_ANALYTICS_BUCKET_SIZE,
  getAnalyticsScopeLabels,
  MIN_ANALYTICS_SAMPLE_SIZE,
} from '../lib/utils/statistics-scope'

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

function statisticFilters(overrides: Partial<FilterState> = {}): FilterState {
  return {
    account: 'Alle',
    session: 'Alle',
    concept: 'Alle',
    quality: 'Alle',
    emotion: 'Alle',
    setup: 'Alle',
    dateFrom: '',
    dateTo: '',
    ...overrides,
  }
}

describe('trading and data integrity gates', () => {
  it('limits strategy statistics to inclusive Europe/Berlin trade dates', () => {
    const trades = [
      trade({ id: 'before', tradeOccurredAt: '2026-08-04T21:59:59.000Z', setup: 'Strategy V2' }),
      trade({ id: 'start', tradeOccurredAt: '2026-08-04T22:00:00.000Z', setup: 'Strategy V2' }),
      trade({ id: 'end', tradeOccurredAt: '2026-08-05T21:59:59.000Z', setup: 'Strategy V2' }),
      trade({ id: 'after', tradeOccurredAt: '2026-08-05T22:00:00.000Z', setup: 'Strategy V2' }),
    ]

    expect(filterTrades(trades, statisticFilters({ dateFrom: '2026-08-05', dateTo: '2026-08-05' })).map((item) => item.id)).toEqual(['start', 'end'])
  })

  it('combines strategy and date scope without deleting older journal trades', () => {
    const trades = [
      trade({ id: 'old-v2', tradeOccurredAt: '2026-07-31T10:00:00.000Z', setup: 'Strategy V2' }),
      trade({ id: 'new-v1', tradeOccurredAt: '2026-08-05T10:00:00.000Z', setup: 'Strategy V1' }),
      trade({ id: 'new-v2', tradeOccurredAt: '2026-08-05T10:00:00.000Z', setup: 'Strategy V2' }),
    ]
    const before = structuredClone(trades)

    const filtered = filterTrades(trades, statisticFilters({ setup: 'Strategy V2', dateFrom: '2026-08-01' }))

    expect(filtered.map((item) => item.id)).toEqual(['new-v2'])
    expect(trades).toEqual(before)
  })

  it('makes the active strategy and date scope persistently describable', () => {
    const filters = statisticFilters({ setup: 'Strategy V2', dateFrom: '2026-08-01', dateTo: '2026-08-05' })

    expect(getAnalyticsScopeLabels(filters)).toEqual([
      'Setup: Strategy V2',
      'Von: 2026-08-01',
      'Bis: 2026-08-05',
    ])
    expect(getAnalyticsScopeLabels(statisticFilters())).toEqual([])
  })

  it('blocks performance claims for empty and undersized samples', () => {
    expect(getAnalyticsEvidenceState(0, 0)).toBe('empty')
    expect(getAnalyticsEvidenceState(2, 0)).toBe('untrusted')
    expect(getAnalyticsEvidenceState(2, 1)).toBe('insufficient')
    expect(getAnalyticsEvidenceState(MIN_ANALYTICS_SAMPLE_SIZE, MIN_ANALYTICS_SAMPLE_SIZE)).toBe('descriptive')

    const oneTradeWindow = buildTimeWindowPerformance([
      trade({ tradeOccurredAt: '2026-08-05T08:00:00.000Z', netPnL: 10, accountCurrency: 'EUR' }),
    ])
    expect(oneTradeWindow.bestWindow).toBeNull()
    expect(oneTradeWindow.weakestWindow).toBeNull()
    expect(oneTradeWindow.rows.find((row) => row.trades === 1)?.tone).toBe('neutral')
  })

  it('keeps every analytics sub-bucket neutral until its three-trade boundary', () => {
    const builders = [buildTimeWindowPerformance, buildSessionPerformance, buildKillZonePerformance]

    for (const builder of builders) {
      for (const count of [1, 2, 3]) {
        const sample = Array.from({ length: count }, (_, index) => trade({
          id: `bucket-${count}-${index}`,
          tradeOccurredAt: `2026-08-05T07:0${index}:00.000Z`,
          netPnL: 10,
          accountCurrency: 'EUR',
        }))
        const result = builder(sample)
        const populated = result.rows.find((row) => row.trades === count)
        const best = 'bestWindow' in result ? result.bestWindow : result.bestRow

        expect(populated?.tone).toBe(count < MIN_ANALYTICS_BUCKET_SIZE ? 'neutral' : 'green')
        expect(best).toBe(count < MIN_ANALYTICS_BUCKET_SIZE ? null : populated)
      }
    }

    expect(getAnalyticsBucketTone(1, 'green')).toBe('neutral')
    expect(getAnalyticsBucketTone(2, 'red')).toBe('neutral')
    expect(getAnalyticsBucketTone(3, 'green')).toBe('green')
    expect(getAnalyticsBucketEvidenceLabel(2)).toBe('Zu wenig Daten: 2/3')
    expect(getAnalyticsBucketEvidenceLabel(3)).toBe('Deskriptiv')
  })

  it('suppresses setup strength and session rankings below their bucket boundary', () => {
    for (const count of [1, 2, 3]) {
      const [row] = buildSetupPerformanceRows(['Opening Range'], Array.from({ length: count }, (_, index) => trade({
        id: `setup-${count}-${index}`,
        setup: 'Opening Range',
        session: 'London',
        netPnL: 10,
        accountCurrency: 'EUR',
      })))

      expect(row?.tone).toBe(count < MIN_ANALYTICS_BUCKET_SIZE ? 'neutral' : 'green')
      expect(row?.bestSession).toBe(count < MIN_ANALYTICS_BUCKET_SIZE ? '—' : 'London')
      expect(row?.weakestSession).toBe(count < MIN_ANALYTICS_BUCKET_SIZE ? '—' : 'London')
    }
  })

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
