'use client'

import { useId, useState } from 'react'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { calculateFuturesRisk, futuresCalculatorContracts, parseFuturesCalculatorInput, parseFuturesCalculatorPrice, type FuturesCalculatorContract } from '@/lib/utils/futures-contracts'

const fieldClass = 'mt-1 block w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white'

const indexPoints = ['Indexpunkte', 'index points'] as const
const centsPerBushel = ['US-Cent je Bushel', 'US cents per bushel'] as const

const markets = {
  nasdaq: { label: ['Nasdaq-100', 'Nasdaq-100'], group: 'indices', unit: indexPoints },
  sp500: { label: ['S&P 500', 'S&P 500'], group: 'indices', unit: indexPoints },
  dow: { label: ['Dow Jones', 'Dow Jones'], group: 'indices', unit: indexPoints },
  russell: { label: ['Russell 2000', 'Russell 2000'], group: 'indices', unit: indexPoints },
  dax: { label: ['DAX', 'DAX'], group: 'indices', unit: indexPoints },
  euroStoxx: { label: ['EURO STOXX 50', 'EURO STOXX 50'], group: 'indices', unit: indexPoints },
  gold: { label: ['Gold', 'Gold'], group: 'metals', unit: ['USD je Feinunze', 'USD per troy ounce'] },
  silver: { label: ['Silber', 'Silver'], group: 'metals', unit: ['USD je Feinunze', 'USD per troy ounce'] },
  copper: { label: ['Kupfer', 'Copper'], group: 'metals', unit: ['USD je Pfund', 'USD per pound'] },
  wti: { label: ['WTI-Rohöl', 'WTI crude oil'], group: 'energy', unit: ['USD je Barrel', 'USD per barrel'] },
  naturalGas: { label: ['Erdgas (Henry Hub)', 'Natural gas (Henry Hub)'], group: 'energy', unit: ['USD je MMBtu', 'USD per MMBtu'] },
  corn: { label: ['Mais', 'Corn'], group: 'grains', unit: centsPerBushel },
  wheat: { label: ['Weizen (Chicago SRW)', 'Wheat (Chicago SRW)'], group: 'grains', unit: centsPerBushel },
  soybeans: { label: ['Sojabohnen', 'Soybeans'], group: 'grains', unit: centsPerBushel },
} as const satisfies Record<FuturesCalculatorContract['market'], { label: readonly [string, string]; group: string; unit: readonly [string, string] }>

const contractGroups = [
  { key: 'indices', label: ['Indizes', 'Equity indices'] },
  { key: 'metals', label: ['Metalle', 'Metals'] },
  { key: 'energy', label: ['Energie', 'Energy'] },
  { key: 'grains', label: ['Agrarrohstoffe', 'Agricultural commodities'] },
] as const

export function FuturesRiskCalculator() {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const hintId = useId()
  const issueId = useId()
  const [contract, setContract] = useState<FuturesCalculatorContract>(futuresCalculatorContracts[0])
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [budget, setBudget] = useState('')
  const [fee, setFee] = useState('')
  const [slippage, setSlippage] = useState('')
  const languageIndex = locale === 'de' ? 0 : 1
  const formatLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const number = new Intl.NumberFormat(formatLocale)
  const money = new Intl.NumberFormat(formatLocale, { style: 'currency', currency: contract.currency, currencyDisplay: 'code' })
  const { currency } = contract
  const priceNumber = new Intl.NumberFormat(formatLocale, { maximumFractionDigits: 4 })
  const result = [entry, stop, budget].every((value) => value.trim()) ? calculateFuturesRisk({
    contract,
    entry: parseFuturesCalculatorPrice(entry, locale, contract),
    stop: parseFuturesCalculatorPrice(stop, locale, contract),
    budget: parseFuturesCalculatorInput(budget, locale),
    roundTripFee: fee.trim() ? parseFuturesCalculatorInput(fee, locale) : 0,
    slippageTicks: slippage.trim() ? parseFuturesCalculatorInput(slippage, locale, true) : 0,
  }) : null
  const issue = result && !result.ok ? result.reason : null
  const issues = {
    entry: text('Prüfe den Einstiegspreis und die Tickgröße.', 'Check the entry price and tick size.'),
    stop: text('Prüfe den Stop-Preis und die Tickgröße.', 'Check the stop price and tick size.'),
    distance: text('Entry und Stop müssen verschieden sein.', 'Entry and stop must be different.'),
    budget: text('Gib ein positives Risikobudget in ' + currency + ' mit höchstens zwei Nachkommastellen ein.', 'Enter a positive ' + currency + ' risk budget with up to two decimal places.'),
    fee: text('Gib die Gebühren in ' + currency + ' mit höchstens zwei Nachkommastellen ein.', 'Enter non-negative ' + currency + ' fees with up to two decimal places.'),
    slippage: text('Gib die Slippage in ganzen Ticks ein.', 'Enter slippage in whole ticks.'),
    costs: text('Der berechnete Betrag ist zu groß. Prüfe die Eingaben.', 'The calculated amount is too large. Check the inputs.'),
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">{text('Futures-Risikorechner', 'Futures risk calculator')}</h2>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-white/75">
            {text('Kontrakt', 'Contract')}
            <select className={fieldClass} value={contract.symbol} onChange={(event) => {
              const selected = futuresCalculatorContracts.find(({ symbol }) => symbol === event.target.value)
              if (!selected) return
              if (selected.market !== contract.market) {
                setEntry('')
                setStop('')
              }
              if (selected.currency !== contract.currency) setBudget('')
              setFee('')
              setSlippage('')
              setContract(selected)
            }}>
              {contractGroups.map((group) => (
                <optgroup key={group.key} label={group.label[languageIndex]}>
                  {futuresCalculatorContracts.filter((option) => markets[option.market].group === group.key).map((option) => (
                    <option key={option.symbol} value={option.symbol}>
                      {markets[option.market].label[languageIndex]} {option.size} ({option.symbol})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-sm text-white/75">
            {text('Einstiegspreis', 'Entry price')}
            <input className={fieldClass} inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)}
              aria-invalid={issue === 'entry'} aria-describedby={issue === 'entry' ? `${hintId} ${issueId}` : hintId} />
          </label>
          <label className="text-sm text-white/75">
            {text('Stop-Preis', 'Stop price')}
            <input className={fieldClass} inputMode="decimal" value={stop} onChange={(event) => setStop(event.target.value)}
              aria-invalid={issue === 'stop' || issue === 'distance'} aria-describedby={issue === 'stop' || issue === 'distance' ? `${hintId} ${issueId}` : hintId} />
          </label>
          <label className="text-sm text-white/75">
            {text('Risikobudget (' + currency + ')', 'Risk budget (' + currency + ')')}
            <input className={fieldClass} inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)}
              aria-invalid={issue === 'budget'} aria-describedby={issue === 'budget' ? `${hintId} ${issueId}` : hintId} />
          </label>
        </div>
        <p id={hintId} className="text-xs text-white/65">
          {text('Preise ohne Tausendertrennzeichen eingeben. Dezimaltrennzeichen ist das Komma.', 'Enter prices without thousands separators. Use a decimal point.')}
        </p>
        <p className="text-sm text-white/65">
          1 Tick = {priceNumber.format(contract.tickSize)}{' '}
          {markets[contract.market].unit[languageIndex]}
          {' · '}{money.format(contract.tickValueCents / 100)} {text('je Tick und Kontrakt', 'per tick per contract')}
        </p>
        <details className="text-sm text-white/75">
          <summary className="cursor-pointer">{text('Gebühren und Slippage (optional)', 'Fees and slippage (optional)')}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label>
              {text('Gebühren je Kontrakt, Einstieg + Ausstieg (' + currency + ')', 'Fees per contract, entry + exit (' + currency + ')')}
              <input className={fieldClass} inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)}
                aria-invalid={issue === 'fee'} aria-describedby={issue === 'fee' ? `${hintId} ${issueId}` : hintId} />
            </label>
            <label>
              {text('Slippage gesamt (Ticks)', 'Total slippage (ticks)')}
              <input className={fieldClass} inputMode="numeric" value={slippage} onChange={(event) => setSlippage(event.target.value)}
                aria-invalid={issue === 'slippage'} aria-describedby={issue === 'slippage' ? issueId : undefined} />
            </label>
          </div>
        </details>
        <div aria-live="polite">
          {result?.ok ? (
            <>
              <dl className="grid gap-3 rounded-xl bg-black/35 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div><dt className="text-white/65">{text('Kontrakte laut Budget', 'Contracts within budget')}</dt><dd className="font-semibold">{number.format(result.contracts)}</dd></div>
                <div><dt className="text-white/65">{text('Risiko gesamt', 'Total planned risk')}</dt><dd>{money.format(result.totalRisk)}</dd></div>
                <div><dt className="text-white/65">{text('Risiko je Kontrakt', 'Risk per contract')}</dt><dd>{money.format(result.riskPerContract)}</dd></div>
                <div><dt className="text-white/65">{text('Abstand zum Stop', 'Distance to stop')}</dt><dd>{number.format(result.stopTicks)} {result.stopTicks === 1 ? 'Tick' : 'Ticks'}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-white/60">{text('Ausführung, Margin und Kontolimits können das tatsächliche Risiko oder die mögliche Kontraktzahl verändern.', 'Execution, margin and account limits can affect actual risk or the number of contracts you can trade.')}</p>
            </>
          ) : issue ? <p id={issueId} className="text-sm text-orange-100">{issues[issue]}</p> : null}
        </div>
      </div>
    </section>
  )
}
