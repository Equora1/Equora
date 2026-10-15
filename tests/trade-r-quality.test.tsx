import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Trade } from '@/lib/types/trade'
import type { TradeRow } from '@/lib/types/db'
import { computeTradeMetrics, formatRMultiple } from '@/lib/utils/calculations'
import { getTradeRValue, getDocumentedTradeRValue, summarizeTradeR, formatTradeRValue } from '@/lib/utils/trade-r'
import { getCoreMetrics, buildSessionPerformance } from '@/lib/utils/analytics'
import { getDashboardRObservation } from '@/lib/utils/dashboard'
import { sortTradeTableRows, summarizeTrades } from '@/lib/utils/trade-table'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import { buildDailyNoteFlowSummary } from '@/lib/utils/daily-notes'
import { CompareTable } from '@/components/analytics/compare-table'
import { buildReviewSnapshot } from '@/lib/utils/review'

const base: Trade = { id: 'sample', date: '2026-10-14', market: 'BTCUSDT', setup: 'Import', result: '+10 EUR', r: '', emotion: '', quality: 'B-Setup', session: 'London', concept: '', netPnL: 10, accountCurrency: 'EUR', captureStatus: 'complete', captureResult: 'winner' }
const row: TradeRow = { id: 'sample', created_at: '2026-10-14T12:00:00Z', market: 'BTCUSDT', setup: 'CSV Import', emotion: null, bias: 'Long', rule_check: null, entry: null, stop_loss: null, take_profit: null, exit: null, net_pnl: 10, pnl_mode: 'manual', risk_percent: null, r_multiple: null, notes: null, screenshot_url: null, account_currency: 'EUR' }
const known = (id: string, value: number): Trade => ({ ...base, id, rValue: value, rSource: 'manual', r: formatRMultiple(value) })

describe('R observations preserve unknown values and completed-result denominators', () => {
  it('maps missing R through computation, list and detail without manufacturing zero', () => {
    const metrics = computeTradeMetrics({ pnl: 10, rMultiple: null })
    expect(metrics.rValue).toBeNull()
    expect(metrics.rSource).toBe('missing')
    expect(metrics.riskAmount).toBeNull()
    expect(mapTradeRowToTrade(row)).toMatchObject({ rValue: null, rSource: 'missing', r: 'R offen' })
    expect(mapTradeRowToTradeDetail(row).result).toBe('R offen')
  })
  it.each([0, 2, -1])('preserves the stored manual value %s', (value) => {
    expect(computeTradeMetrics({ pnl: 10, rMultiple: value })).toMatchObject({ rValue: value, rSource: 'manual' })
    expect(mapTradeRowToTrade({ ...row, r_multiple: value }).rValue).toBe(value)
  })
  it('distinguishes planned reward/risk from realized P&L/risk', () => {
    const plan = computeTradeMetrics({ entry: 100, stopLoss: 90, takeProfit: 120, bias: 'Long' })
    expect(plan).toMatchObject({ rSource: 'planned', rValue: 2 })
    expect(formatTradeRValue(plan.rValue, plan.rSource)).toBe('+2,00R (geplant)')
    const realized = computeTradeMetrics({ pnl: 0, entry: 100, stopLoss: 90, takeProfit: 120, positionSize: 1, bias: 'Long' })
    expect(realized).toMatchObject({ rSource: 'realized', rValue: 0 })
  })
  it.each(['', ' ', 'R offen', '—', 'kaputt', 'Infinity', 'NaN'])('does not parse %j as a real zero', (r) => {
    expect(getTradeRValue({ ...base, r })).toBeNull()
  })
  it('respects explicit null and missing metadata before stale fallback text', () => {
    expect(getTradeRValue({ ...known('zero', 0), rSource: 'missing' })).toBeNull()
    expect(getTradeRValue({ ...base, rValue: null, r: '+2R', rMultiple: 3 })).toBeNull()
    expect(getTradeRValue({ ...base, rValue: Number.NaN, r: '+2R' })).toBeNull()
    expect(getTradeRValue({ ...base, r: '+0,00R' })).toBe(0)
    expect(getTradeRValue({ ...base, rMultiple: 0 })).toBe(0)
  })
  it('counts documented zeros but excludes missing, planned, partial and open results', () => {
    const trades = [known('zero', 0), known('win', 2), known('loss', -1), { ...known('old', 0), rSource: 'missing' as const }, { ...known('plan', 5), rSource: 'planned' as const }, { ...known('partial', 1), rSource: 'realized_partial' as const }, { ...known('open', 9), captureResult: 'open' as const }]
    expect(summarizeTradeR(trades)).toEqual({ averageR: 1 / 3, rCount: 3, eligibleCount: 7 })
    expect(getCoreMetrics(trades)).toMatchObject({ averageR: 1 / 3, expectancyR: 1 / 3, rCount: 3 })
    expect(summarizeTrades(trades)).toMatchObject({ averageR: 1 / 3, rCount: 3 })
    expect(getDashboardRObservation(trades[5])).toEqual({ source: 'realized_partial', value: 1, documented: false })
    expect(getDocumentedTradeRValue(trades[6])).toBeNull()
  })
  it('retains null for empty or undocumented result sets and handles group denominators', () => {
    expect(getCoreMetrics([])).toMatchObject({ averageR: null, expectancyR: null, rCount: 0 })
    expect(summarizeTradeR([{ ...base, rSource: 'planned', rValue: 3 }]).averageR).toBeNull()
    const grouped = buildSessionPerformance([known('a', 0), known('b', 2), { ...base, id: 'c', rValue: null, rSource: 'missing' }])
    expect(grouped.rows[0]).toMatchObject({ averageR: 1, rCount: 2, trades: 3 })
  })
  it('uses the same conservative legacy-source policy in dashboard and other averages', () => {
    const legacy = { ...base, r: '+2R', rValue: 2 }
    expect(getTradeRValue(legacy)).toBe(2)
    expect(summarizeTradeR([legacy])).toMatchObject({ averageR: null, rCount: 0 })
    expect(getCoreMetrics([legacy])).toMatchObject({ averageR: null, rCount: 0 })
    expect(getDashboardRObservation(legacy)).toMatchObject({ value: null, documented: false })
  })
  it('excludes incomplete capture and open remainders even with a manual source', () => {
    expect(getDocumentedTradeRValue({ ...known('quick', 1), captureStatus: 'incomplete' })).toBeNull()
    const partial = mapTradeRowToTrade({ ...row, r_multiple: 1, entry: 100, position_size: 1, partial_exits: [{ percent: 50, price: 120 }], capture_status: 'complete', capture_result: null })
    expect(partial).toMatchObject({ rSource: 'manual', rValue: 1, partialExitHasOpenRemainder: true })
    expect(getDocumentedTradeRValue(partial)).toBeNull()
    expect(getCoreMetrics([partial])).toMatchObject({ averageR: null, rCount: 0 })
    expect(buildDailyNoteFlowSummary([partial], [], '2026-10-14').averageR).toBeNull()
  })
  it('places unknown R last in both directions without mutating the input', () => {
    const trades = [{ ...base, id: 'missing', rValue: null }, known('zero', 0), known('loss', -1), known('win', 2)]
    expect(sortTradeTableRows(trades, 'r-asc').map(t => t.id)).toEqual(['loss', 'zero', 'win', 'missing'])
    expect(sortTradeTableRows(trades, 'r-desc').map(t => t.id)).toEqual(['win', 'zero', 'loss', 'missing'])
    expect(trades[0].id).toBe('missing')
  })
  it('uses the documented denominator in the daily note and leaves an undocumented average open', () => {
    expect(buildDailyNoteFlowSummary([known('a', 0), known('b', 2), { ...base, id: 'c', rValue: null, rSource: 'missing' }], [], '2026-10-14').averageR).toBe(1)
    expect(buildDailyNoteFlowSummary([{ ...base, rValue: null, rSource: 'missing' }], [], '2026-10-14').averageR).toBeNull()
  })
  it('retains an unknown average in new review drafts without converting historic manual zero', () => {
    expect(buildReviewSnapshot([{ ...base, rSource: 'missing', rValue: null }], [], [], 'mock').sessionDraft.averageR).toBeNull()
    expect(buildReviewSnapshot([known('zero', 0)], [], [], 'mock').sessionDraft.averageR).toBe(0)
  })
  it('keeps partial results visible while excluding an unfinished remainder from completed averages', () => {
    const metrics = computeTradeMetrics({ entry: 100, stopLoss: 90, positionSize: 1, bias: 'Long', partialExits: [{ percent: 50, price: 120 }] })
    expect(metrics).toMatchObject({ rSource: 'realized_partial', rValue: 1 })
    expect(formatTradeRValue(metrics.rValue, metrics.rSource)).toBe('+1,00R (teilrealisiert)')
    expect(summarizeTradeR([{ ...base, rSource: metrics.rSource, rValue: metrics.rValue }])).toMatchObject({ averageR: null, rCount: 0 })
  })
  it('renders an unavailable average without a red result or fabricated zero', () => {
    const html = renderToStaticMarkup(<CompareTable title="Test" rows={[{ label: 'Test', totalTrades: 1, winRate: 100, avgR: null, netPnL: 10, profitFactor: Infinity, currency: 'EUR' }]} />)
    expect(html).toContain('R offen')
    expect(html).not.toContain('+0,00R')
    expect(formatRMultiple(0)).toBe('+0,00R')
    expect(formatRMultiple(Number.NaN)).toBe('R offen')
  })
})
