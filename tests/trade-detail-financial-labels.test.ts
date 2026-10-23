import { describe, expect, it } from 'vitest'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import { getDocumentedTradeRValue } from '@/lib/utils/trade-r'
import { computeTradeMetrics, deriveEffectiveExitFromPartialExitLegs, restoreRemainderExitFromStoredAverage, getPartialExitSizePlan } from '@/lib/utils/calculations'
import type { TradeRow } from '@/lib/types/db'

const row: TradeRow = { id: 'detail', created_at: '2026-10-15T12:00:00Z', market: 'TEST', setup: 'Test', emotion: null, bias: 'Long', rule_check: null, entry: 100, stop_loss: 90, take_profit: 120, exit: null, net_pnl: 10, pnl_mode: 'manual', risk_percent: 1, r_multiple: null, notes: null, screenshot_url: null, account_currency: 'EUR', position_size: 2, account_size: 1000, fees: 1 }

describe('detail financial labels preserve position and currency state', () => {
  it.each([
    [0.12, '+0,12 USDT'], [-0.12, '-0,12 USDT'],
    [0.004, '+0,004 USDT'], [-0.004, '-0,004 USDT'],
    [0, '+0 USDT'],
  ])('keeps list, details and numeric result consistent for %s', (net_pnl, expected) => {
    const input: TradeRow = { ...row, net_pnl, fees: 0.12, account_currency: 'USDT' }
    const before = structuredClone(input)
    const trade = mapTradeRowToTrade(input)
    const detail = mapTradeRowToTradeDetail(input)
    expect(trade.result).toBe(expected)
    expect(detail.pnl).toBe(expected)
    expect(detail.costLabel).toContain('Kommission +0,12 USDT')
    expect(trade.netPnL).toBe(net_pnl)
    expect(input).toEqual(before)
  })
  it.each([undefined, [], [{ percent: 0, price: 120 }]])('does not invent a running remainder without valid partial exits (%j)', (partial_exits) => {
    const detail = mapTradeRowToTradeDetail({ ...row, partial_exits })
    expect(detail.pnl).toBe('+10 EUR')
    expect(detail.partialExitStateLabel).toBeUndefined()
    expect(detail.partialExitRemainingLabel).toBeUndefined()
  })
  it('labels a genuinely open remainder with valid partial exits', () => {
    const detail = mapTradeRowToTradeDetail({ ...row, partial_exits: [{ percent: 50, price: 120 }] })
    expect(detail.pnl).toContain('bisher realisiert · Restposition offen')
    expect(detail.partialExitStateLabel).toContain('Restposition offen')
  })
  it.each([
    { partial_exits: [{ percent: 100, price: 120 }], exit: null },
    // Rows store the weighted exit: half at 120 and the final half at 115 => 117.5.
    { partial_exits: [{ percent: 50, price: 120 }], exit: 117.5 },
  ])('does not show an open position after all exits are documented', (exits) => {
    const detail = mapTradeRowToTradeDetail({ ...row, ...exits })
    expect(detail.pnl).not.toContain('Restposition offen')
    expect(detail.partialExitStateLabel).toBe('Position vollständig geschlossen')
    expect(detail.partialExitRemainingLabel).toBe('Keine offene Restposition')
    expect(detail.partialExitCoverageLabel).not.toContain('Rest offen')
    const trade = mapTradeRowToTrade({ ...row, ...exits })
    expect(trade.partialExitHasOpenRemainder).toBe(false)
    if (exits.partial_exits[0].percent < 100) {
      expect(trade.rSource).toBe('missing')
      expect(getDocumentedTradeRValue(trade)).toBeNull()
    } else {
      expect(trade.rSource).toBe('realized')
      expect(getDocumentedTradeRValue(trade)).toBe(trade.rValue)
    }
    expect(trade.partialExitRemainingSize).toBe(0)
  })
  it.each([
    [null, 'Währung fehlt'],
    ['JPY', 'Währung nicht unterstützt'],
  ])('preserves currency state %s across all monetary detail labels', (account_currency, expected) => {
    const detail = mapTradeRowToTradeDetail({ ...row, account_currency })
    for (const label of [detail.pnl, detail.costLabel, detail.riskAmount, detail.riskPlanLabel, detail.marginLabel]) {
      expect(label).toContain(expected)
      if (account_currency) expect(label).not.toContain('Währung fehlt')
    }
  })
  it('preserves an actual documented zero in a supported currency', () => {
    expect(mapTradeRowToTradeDetail({ ...row, net_pnl: 0 }).pnl).toBe('+0 EUR')
  })
  it.each(['Long', 'Short'])('round-trips a stored average through editing exactly once (%s)', (bias) => {
    const partialExits = [{ percent: 50, price: 120 }]
    const storedAverage = 117.5
    const finalExit = restoreRemainderExitFromStoredAverage({ exit: storedAverage, partialExits })
    expect(finalExit).toBe(115)
    // This is the same pure calculation used by the server action, with raw form input.
    expect(deriveEffectiveExitFromPartialExitLegs({ exit: finalExit, partialExits })).toBe(storedAverage)
    expect(getPartialExitSizePlan({ positionSize: 2, partialExits, exit: finalExit })).toMatchObject({ hasOpenRemainder: false, remainingSize: 0 })
    const storedRow: TradeRow = { ...row, bias, stop_loss: bias === 'Long' ? 90 : 110, exit: storedAverage, partial_exits: partialExits, pnl_mode: 'auto', net_pnl: null, fees: 0, exchange_fees: 0, funding_fees: 0, spread_cost: 0, slippage: 0, instrument_type: 'stocks', cost_profile: 'manual' }
    const calculation = computeTradeMetrics({ entry: 100, exit: storedAverage, positionSize: 2, stopLoss: bias === 'Long' ? 90 : 110, bias, instrumentType: 'stocks', pnlMode: 'auto', fees: 0, exchangeFees: 0, fundingFees: 0, spreadCost: 0, slippage: 0 })
    expect(calculation.netPnL).toBe(bias === 'Long' ? 35 : -35)
    expect(calculation.rValue).toBe(bias === 'Long' ? 1.75 : -1.75)
    // Stored rows lack the price-basis provenance: do not infer it from a plausible number.
    const uncertain = mapTradeRowToTrade(storedRow)
    expect(uncertain.netPnL).toBeUndefined()
    expect(uncertain).toMatchObject({ rValue: null, rSource: 'missing' })
    expect(mapTradeRowToTradeDetail(storedRow).effectiveExitLabel).toContain('117,5')
  })
  it('does not invent a final exit for an open or fully partial-closed position', () => {
    expect(restoreRemainderExitFromStoredAverage({ exit: null, partialExits: [{ percent: 50, price: 120 }] })).toBeNull()
    expect(restoreRemainderExitFromStoredAverage({ exit: 120, partialExits: [{ percent: 100, price: 120 }] })).toBeNull()
  })
  it.each([115, 117.5])('does not guess the price basis of a legacy closed partial position (%s)', (exit) => {
    const legacy = { ...row, exit, partial_exits: [{ percent: 50, price: 120 }] }
    expect(mapTradeRowToTrade(legacy)).toMatchObject({ netPnL: 10, rValue: null, rSource: 'missing' })
    const detail = mapTradeRowToTradeDetail(legacy)
    expect(detail.result).toBe('R-Zuordnung prüfen')
    expect(detail.pnlSourceLabel).toContain('nicht nachweisbar')
    expect(detail.effectiveExitLabel).toContain('gespeicherter Exit')
  })
  it.each([115, 117.5])('retains manual override P&L without leaking an ambiguous automatic comparison (%s)', (exit) => {
    const legacy: TradeRow = { ...row, pnl_mode: 'override', exit, partial_exits: [{ percent: 50, price: 120 }] }
    expect(mapTradeRowToTrade(legacy)).toMatchObject({ netPnL: 10, autoNetPnL: null, grossPnL: null, rValue: null })
    const detail = mapTradeRowToTradeDetail(legacy)
    expect(detail.pnl).toBe('+10 EUR')
    expect(detail.executionLabel).not.toMatch(/Brutto|Auto /)
    expect(detail.pnlSourceLabel).toContain('manuell hinterlegtes Ergebnis bleibt sichtbar')
  })
  it('does not reconstruct risk from a discarded automatic result and legacy R', () => {
    const legacy: TradeRow = { ...row, pnl_mode: 'auto', net_pnl: null, exit: 115, stop_loss: null, take_profit: null, r_multiple: 2, partial_exits: [{ percent: 50, price: 120 }], instrument_type: 'stocks' }
    expect(mapTradeRowToTrade(legacy)).toMatchObject({ riskAmount: null, rValue: null, autoNetPnL: null })
    expect(mapTradeRowToTradeDetail(legacy).riskAmount).toBe('Nicht sicher berechenbar')
    // A directly specified stop and size still define an independent risk amount.
    expect(mapTradeRowToTrade({ ...legacy, stop_loss: 90 }).riskAmount).toBe(20)
  })
})
