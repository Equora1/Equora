import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { FuturesRiskCalculator } from '@/components/trades/futures-risk-calculator'
import { calculateFuturesRisk, futuresCalculatorContracts, parseFuturesCalculatorInput, parseFuturesCalculatorPrice } from '@/lib/utils/futures-contracts'

const state = vi.hoisted(() => ({ locale: 'de' }))
vi.mock('@/components/layout/journal-locale-provider', () => ({ useJournalLocale: () => state.locale }))

it.each([
  ['MNQ', 20000.25, 20000, 0.5],
  ['NQ', 20000, 19999.75, 5],
  ['MGC', 2695.7, 2695.6, 1],
  ['QO', 2700, 2700.25, 12.5],
  ['GC', 2695.6, 2695.7, 10],
] as const)('%s uses the exchange tick', (symbol, entry, stop, risk) => {
  const contract = futuresCalculatorContracts.find((candidate) => candidate.symbol === symbol)!
  expect(calculateFuturesRisk({ contract, entry, stop, budget: risk })).toEqual({
    ok: true, stopTicks: 1, riskPerContract: risk, contracts: 1, totalRisk: risk,
  })
})

it.each([
  ['MES', '100.25', 1.25, 'USD'],
  ['ES', '100.25', 12.5, 'USD'],
  ['MYM', '101', 0.5, 'USD'],
  ['YM', '101', 5, 'USD'],
  ['M2K', '100.1', 0.5, 'USD'],
  ['RTY', '100.1', 5, 'USD'],
  ['FDXS', '101', 1, 'EUR'],
  ['FDXM', '101', 5, 'EUR'],
  ['FDAX', '101', 25, 'EUR'],
  ['FSXE', '100.5', 0.5, 'EUR'],
  ['FESX', '101', 10, 'EUR'],
  ['SIL', '100.005', 5, 'USD'],
  ['QI', '100.0125', 31.25, 'USD'],
  ['SI', '100.005', 25, 'USD'],
  ['MHG', '100.0005', 1.25, 'USD'],
  ['QC', '100.002', 25, 'USD'],
  ['HG', '100.0005', 12.5, 'USD'],
  ['MCL', '100.01', 1, 'USD'],
  ['QM', '100.025', 12.5, 'USD'],
  ['CL', '100.01', 10, 'USD'],
  ['MNG', '100.001', 1, 'USD'],
  ['QG', '100.005', 12.5, 'USD'],
  ['NG', '100.001', 10, 'USD'],
  ['MZC', '100.5', 2.5, 'USD'],
  ['XC', '100.125', 1.25, 'USD'],
  ['ZC', '100.25', 12.5, 'USD'],
  ['MZW', '100.5', 2.5, 'USD'],
  ['XW', '100.125', 1.25, 'USD'],
  ['ZW', '100.25', 12.5, 'USD'],
  ['MZS', '100.5', 2.5, 'USD'],
  ['XK', '100.125', 1.25, 'USD'],
  ['ZS', '100.25', 12.5, 'USD'],
] as const)('%s uses its outright tick and contract currency', (symbol, price, risk, currency) => {
  const contract = futuresCalculatorContracts.find((candidate) => candidate.symbol === symbol)!
  expect(contract.currency).toBe(currency)
  const entry = parseFuturesCalculatorPrice(price, 'en', contract)
  expect(parseFuturesCalculatorPrice(price.replace('.', ','), 'de', contract)).toBe(entry)
  expect(calculateFuturesRisk({ contract, entry, stop: 100, budget: risk })).toEqual({
    ok: true, stopTicks: 1, riskPerContract: risk, contracts: 1, totalRisk: risk,
  })
})

it('validates the WTI Mini price grid separately from currency amounts', () => {
  const contract = futuresCalculatorContracts.find(({ symbol }) => symbol === 'QM')!
  const entry = parseFuturesCalculatorPrice('70,025', 'de', contract)
  expect(entry).toBe(70.025)
  expect(parseFuturesCalculatorInput('70,025', 'de')).toBeNaN()
  expect(calculateFuturesRisk({ contract, entry, stop: 70.01, budget: 100 })).toEqual({ ok: false, reason: 'stop' })
  expect(calculateFuturesRisk({ contract, entry, stop: 70, budget: 100 })).toMatchObject({ ok: true, contracts: 8 })
})

const baseline = { contract: futuresCalculatorContracts[0], entry: 20000, stop: 19990, budget: 100 }

it('includes round-trip fees and total slippage and stays within the budget', () => {
  expect(calculateFuturesRisk({ ...baseline, roundTripFee: 1.4, slippageTicks: 2 })).toEqual({
    ok: true, stopTicks: 40, riskPerContract: 22.4, contracts: 4, totalRisk: 89.6,
  })
  expect(calculateFuturesRisk({ ...baseline, budget: 19.99 })).toMatchObject({ ok: true, contracts: 0, totalRisk: 0 })
  expect(calculateFuturesRisk({ ...baseline, budget: 20 })).toMatchObject({ ok: true, contracts: 1, totalRisk: 20 })
})

it.each([
  [{ entry: 20000.1 }, 'entry'],
  [{ stop: 19999.9 }, 'stop'],
  [{ stop: 20000 }, 'distance'],
  [{ budget: 20.001 }, 'budget'],
  [{ budget: 19.99999999999 }, 'budget'],
  [{ budget: -20 }, 'budget'],
  [{ roundTripFee: -0.01 }, 'fee'],
  [{ slippageTicks: 0.5 }, 'slippage'],
  [{ slippageTicks: Number.MAX_SAFE_INTEGER }, 'costs'],
  [{ slippageTicks: 100000000000000 }, 'costs'],
] as const)('rejects invalid inputs %j', (patch, reason) => {
  expect(calculateFuturesRisk({ ...baseline, ...patch })).toEqual({ ok: false, reason })
})

it('rejects grouped German quotes instead of silently shrinking the stop risk', () => {
  expect(parseFuturesCalculatorInput('20.000', 'de')).toBeNaN()
  expect(parseFuturesCalculatorInput('19.750', 'de')).toBeNaN()
  expect(calculateFuturesRisk({
    ...baseline, entry: parseFuturesCalculatorInput('20.000', 'de'), stop: parseFuturesCalculatorInput('19.750', 'de'),
  })).toEqual({ ok: false, reason: 'entry' })
  expect(calculateFuturesRisk({
    ...baseline, entry: parseFuturesCalculatorInput('20000', 'de'), stop: parseFuturesCalculatorInput('19750', 'de'),
  })).toEqual({ ok: true, stopTicks: 1000, riskPerContract: 500, contracts: 0, totalRisk: 0 })
})

it.each([
  ['20000,25', 'de', 20000.25],
  ['20000.25', 'en', 20000.25],
  ['1,40', 'de', 1.4],
  ['0.29', 'en', 0.29],
])('accepts %s in its stated locale', (value, locale, result) => {
  expect(parseFuturesCalculatorInput(value, locale as 'de' | 'en')).toBe(result)
})

it.each([
  ['20,000.25', 'en'],
  ['20000.25', 'de'],
  ['20000,25', 'en'],
  ['20 000', 'en'],
  ['20e3', 'de'],
  ['90071992547409.91', 'en'],
  ['90071992547409.90', 'en'],
] as const)('rejects ambiguous or unsafe input %s', (value, locale) => {
  expect(parseFuturesCalculatorInput(value, locale)).toBeNaN()
})

it('accepts only safe whole ticks as slippage', () => {
  expect(parseFuturesCalculatorInput('2', 'de', true)).toBe(2)
  expect(parseFuturesCalculatorInput('2,0', 'de', true)).toBeNaN()
  expect(parseFuturesCalculatorInput('9007199254740992', 'en', true)).toBeNaN()
})

it.each([
  ['de', 'Futures-Risikorechner', 'Risikobudget (USD)', 'Dezimaltrennzeichen ist das Komma.'],
  ['en', 'Futures risk calculator', 'Risk budget (USD)', 'Use a decimal point.'],
])('renders the %s labels, input hint and grouped contract choices', (locale, title, budgetLabel, decimalHint) => {
  state.locale = locale
  const html = renderToStaticMarkup(<FuturesRiskCalculator />)
  expect(html).toContain(title)
  expect(html).toContain(budgetLabel)
  expect(html).toContain(decimalHint)
  expect(html).toContain('aria-describedby=')
  expect(html).toContain('aria-live="polite"')
  for (const { symbol } of futuresCalculatorContracts) expect(html).toContain(`value="${symbol}"`)
})
