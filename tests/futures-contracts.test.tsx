import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { FuturesRiskCalculator } from '@/components/trades/futures-risk-calculator'
import { calculateFuturesRisk, futuresContracts, parseFuturesCalculatorInput } from '@/lib/utils/futures-contracts'

const state = vi.hoisted(() => ({ locale: 'de' }))
vi.mock('@/components/layout/journal-locale-provider', () => ({ useJournalLocale: () => state.locale }))

it.each([
  ['MNQ', 20000.25, 20000, 0.5],
  ['NQ', 20000, 19999.75, 5],
  ['MGC', 2695.7, 2695.6, 1],
  ['QO', 2700, 2700.25, 12.5],
  ['GC', 2695.6, 2695.7, 10],
] as const)('%s uses the exchange tick', (symbol, entry, stop, risk) => {
  const contract = futuresContracts.find((candidate) => candidate.symbol === symbol)!
  expect(calculateFuturesRisk({ contract, entry, stop, budgetUsd: risk })).toEqual({
    ok: true, stopTicks: 1, riskPerContractUsd: risk, contracts: 1, totalRiskUsd: risk,
  })
})

const baseline = { contract: futuresContracts[0], entry: 20000, stop: 19990, budgetUsd: 100 }

it('includes round-trip fees and total slippage and stays within the budget', () => {
  expect(calculateFuturesRisk({ ...baseline, roundTripFeeUsd: 1.4, slippageTicks: 2 })).toEqual({
    ok: true, stopTicks: 40, riskPerContractUsd: 22.4, contracts: 4, totalRiskUsd: 89.6,
  })
  expect(calculateFuturesRisk({ ...baseline, budgetUsd: 19.99 })).toMatchObject({ ok: true, contracts: 0, totalRiskUsd: 0 })
  expect(calculateFuturesRisk({ ...baseline, budgetUsd: 20 })).toMatchObject({ ok: true, contracts: 1, totalRiskUsd: 20 })
})

it.each([
  [{ entry: 20000.1 }, 'entry'],
  [{ stop: 19999.9 }, 'stop'],
  [{ stop: 20000 }, 'distance'],
  [{ budgetUsd: 20.001 }, 'budget'],
  [{ budgetUsd: 19.99999999999 }, 'budget'],
  [{ budgetUsd: -20 }, 'budget'],
  [{ roundTripFeeUsd: -0.01 }, 'fee'],
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
  })).toEqual({ ok: true, stopTicks: 1000, riskPerContractUsd: 500, contracts: 0, totalRiskUsd: 0 })
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
  ['de', 'Futures-Risikorechner', 'Risikobudget (USD)', '20000,25'],
  ['en', 'Futures risk calculator', 'Risk budget (USD)', '20000.25'],
])('renders the %s labels, input hint and five contract choices', (locale, title, budgetLabel, example) => {
  state.locale = locale
  const html = renderToStaticMarkup(<FuturesRiskCalculator />)
  expect(html).toContain(title)
  expect(html).toContain(budgetLabel)
  expect(html).toContain(example)
  expect(html).toContain('aria-describedby=')
  expect(html).toContain('aria-live="polite"')
  for (const { symbol } of futuresContracts) expect(html).toContain(`value="${symbol}"`)
})
