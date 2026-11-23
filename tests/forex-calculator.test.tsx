import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CalculatorsPage from '@/app/(journal)/rechner/page'
import { JournalLocaleProvider } from '@/components/layout/journal-locale-provider'
import { ForexPipCalculator } from '@/components/trades/forex-pip-calculator'
import { calculateForexMove, convertForexValues, forexPairs, forexPairDetails } from '@/lib/utils/forex-calculator'

const requireUser = vi.hoisted(() => vi.fn(async () => null))
vi.mock('@/lib/server/auth', () => ({ requireUser }))

const eurUsd = { pair: 'EUR/USD', direction: 'long', entry: '1,08500', exit: '1.08625' } as const

describe('Forex pip calculator', () => {
  it('counts signed pips and pipettes without requiring a position', () => {
    expect(calculateForexMove(eurUsd)).toEqual({ ok: true, pips: 12.5, pipettes: 125, position: null })
    expect(calculateForexMove({ ...eurUsd, direction: 'short' })).toEqual({
      ok: true, pips: -12.5, pipettes: -125, position: null,
    })
    expect(calculateForexMove({ ...eurUsd, direction: 'short', exit: '1.08500' })).toEqual({
      ok: true, pips: 0, pipettes: 0, position: null,
    })
  })

  it.each([
    ['0.01', '1000', 0.1, 1.25],
    ['0,1', '10000', 1, 12.5],
    ['1', '100000', 10, 125],
    ['0.00001', '1', 0.0001, 0.00125],
  ] as const)('treats %s lots and %s units as the same position', (lots, units, pipValue, grossPnl) => {
    const byUnits = calculateForexMove({ ...eurUsd, size: units })
    const byLots = calculateForexMove({ ...eurUsd, size: lots, sizeUnit: 'lots' })
    expect(byLots).toEqual(byUnits)
    expect(byLots).toMatchObject({ ok: true, position: { pipValue, grossPnl } })
  })

  it('uses the yen pip size and reports the gross result in the quote currency', () => {
    expect(forexPairDetails('GBP/JPY')).toEqual({ base: 'GBP', quote: 'JPY', pipSize: 0.01, priceDecimals: 3 })
    expect(calculateForexMove({ pair: 'GBP/JPY', direction: 'short', entry: '154.020', exit: '154,017', size: '10000' }))
      .toEqual({ ok: true, pips: 0.3, pipettes: 3, position: { pipValue: 100, grossPnl: 30 } })
    expect(forexPairDetails('EUR/CHF').pipSize).toBe(0.0001)
    expect(calculateForexMove({ ...eurUsd, direction: 'short', size: '10000' }))
      .toMatchObject({ position: { pipValue: 1, grossPnl: -12.5 } })
  })

  it.each(['0', '-1.08', '1.080004', '1e0', '1.000,08', '1 000', '999999999999999999'])('rejects invalid entry %s', entry => {
    expect(calculateForexMove({ ...eurUsd, entry })).toEqual({ ok: false, reason: 'entry' })
  })

  it('checks yen price precision, zero sizes, fractional units and sub-unit lots', () => {
    expect(calculateForexMove({ pair: 'USD/JPY', direction: 'long', entry: '154.01', exit: '154.0155' }))
      .toEqual({ ok: false, reason: 'exit' })
    expect(calculateForexMove({ ...eurUsd, size: '0' })).toEqual({ ok: false, reason: 'size' })
    expect(calculateForexMove({ ...eurUsd, size: '1.1' })).toEqual({ ok: false, reason: 'size' })
    expect(calculateForexMove({ ...eurUsd, size: '0.000001', sizeUnit: 'lots' })).toEqual({ ok: false, reason: 'size' })
    expect(calculateForexMove({ ...eurUsd, size: '100000000000000' })).toEqual({ ok: false, reason: 'range' })
  })

  it('multiplies by the explicitly entered rate from quote to account currency', () => {
    expect(convertForexValues({ pipValue: 1000, grossPnl: -300 }, '0,00625')).toEqual({
      pipValue: 6.25, grossPnl: -1.875,
    })
    for (const input of ['', '0', '1e-3', '1.234,5', '0.000000001']) {
      expect(convertForexValues({ pipValue: 1000, grossPnl: -300 }, input)).toBeNull()
    }
  })

  it.each([
    ['de', 'Forex-Pip-Rechner', 'Positionsgröße (optional)', '1 Pip = 10 Pipetten.'],
    ['en', 'Forex pip calculator', 'Position size (optional)', '1 pip = 10 pipettes.'],
  ] as const)('renders the %s calculator alongside its precision hint', (locale, title, position, hint) => {
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale={locale}><ForexPipCalculator /></JournalLocaleProvider>,
    )
    expect(html).toContain(title)
    expect(html).toContain(position)
    expect(html).toContain(hint)
    expect(html).toContain('aria-live="polite"')
    for (const pair of forexPairs) expect(html).toContain(pair)
  })

  it('renders both forms on the journal route with an accessible default tab', async () => {
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale="en">{await CalculatorsPage()}</JournalLocaleProvider>,
    )
    expect(requireUser).toHaveBeenCalledOnce()
    expect(html).toContain('>Calculators</h1>')
    expect(html).toContain('role="tablist" aria-label="Choose a calculator"')
    expect(html.match(/<button\b[^>]*role="tab"[^>]*>Futures<\/button>/)?.[0]).toContain('aria-selected="true"')
    expect(html.match(/<button\b[^>]*role="tab"[^>]*>Forex<\/button>/)?.[0]).toContain('aria-selected="false"')
    expect(html).toMatch(/role="tabpanel"[^>]*id="[^"]*-panel-forex"[^>]*hidden=""/)
    expect(html).toContain('>Futures risk calculator</h2>')
    expect(html).toContain('>Forex pip calculator</h2>')
  })
})
