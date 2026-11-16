'use client'

import { useId, useState } from 'react'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { calculateFuturesRisk, futuresContracts, parseFuturesCalculatorInput, type FuturesContract } from '@/lib/utils/futures-contracts'

const fieldClass = 'mt-1 block w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white'

export function FuturesRiskCalculator() {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const hintId = useId()
  const issueId = useId()
  const [contract, setContract] = useState<FuturesContract>(futuresContracts[0])
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [budget, setBudget] = useState('')
  const [fee, setFee] = useState('')
  const [slippage, setSlippage] = useState('')
  const formatLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const number = new Intl.NumberFormat(formatLocale)
  const money = new Intl.NumberFormat(formatLocale, { style: 'currency', currency: 'USD', currencyDisplay: 'code' })
  const result = [entry, stop, budget].every((value) => value.trim()) ? calculateFuturesRisk({
    contract,
    entry: parseFuturesCalculatorInput(entry, locale),
    stop: parseFuturesCalculatorInput(stop, locale),
    budgetUsd: parseFuturesCalculatorInput(budget, locale),
    roundTripFeeUsd: fee.trim() ? parseFuturesCalculatorInput(fee, locale) : 0,
    slippageTicks: slippage.trim() ? parseFuturesCalculatorInput(slippage, locale, true) : 0,
  }) : null
  const issue = result && !result.ok ? result.reason : null
  const issues = {
    entry: text('Prüfe den Einstiegspreis und die Tickgröße.', 'Check the entry price and tick size.'),
    stop: text('Prüfe den Stop-Preis und die Tickgröße.', 'Check the stop price and tick size.'),
    distance: text('Entry und Stop müssen verschieden sein.', 'Entry and stop must be different.'),
    budget: text('Gib ein Risikobudget in USD mit höchstens zwei Nachkommastellen ein.', 'Enter a positive USD risk budget with up to two decimal places.'),
    fee: text('Gib die Gebühren in USD mit höchstens zwei Nachkommastellen ein.', 'Enter non-negative USD fees with up to two decimal places.'),
    slippage: text('Gib die Slippage in ganzen Ticks ein.', 'Enter slippage in whole ticks.'),
    costs: text('Der berechnete Betrag ist zu groß. Prüfe die Eingaben.', 'The calculated amount is too large. Check the inputs.'),
  }

  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">{text('Futures-Risikorechner', 'Futures risk calculator')}</summary>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-white/75">
            {text('Kontrakt', 'Contract')}
            <select className={fieldClass} value={contract.symbol} onChange={(event) => {
              const selected = futuresContracts.find(({ symbol }) => symbol === event.target.value)
              if (selected) setContract(selected)
            }}>
              {futuresContracts.map((option) => (
                <option key={option.symbol} value={option.symbol}>
                  {option.market === 'gold' ? 'Gold' : 'Nasdaq-100'} {option.size} ({option.symbol})
                </option>
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
            {text('Risikobudget (USD)', 'Risk budget (USD)')}
            <input className={fieldClass} inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)}
              aria-invalid={issue === 'budget'} aria-describedby={issue === 'budget' ? `${hintId} ${issueId}` : hintId} />
          </label>
        </div>
        <p id={hintId} className="text-xs text-white/65">
          {text('Ohne Tausendertrennzeichen eingeben, z. B. 20000,25.', 'Enter prices without thousands separators, e.g. 20000.25.')}
        </p>
        <p className="text-sm text-white/65">
          1 Tick = {number.format(contract.tickSizeCents / 100)}{' '}
          {contract.market === 'gold' ? text('USD je Feinunze', 'USD per troy ounce') : text('Indexpunkte', 'index points')}
          {' · '}{money.format(contract.tickValueUsdCents / 100)} {text('je Tick und Kontrakt', 'per tick per contract')}
        </p>
        <details className="text-sm text-white/75">
          <summary className="cursor-pointer">{text('Gebühren und Slippage (optional)', 'Fees and slippage (optional)')}</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label>
              {text('Gebühren je Kontrakt, Einstieg + Ausstieg (USD)', 'Fees per contract, entry + exit (USD)')}
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
                <div><dt className="text-white/65">{text('Risiko gesamt', 'Total planned risk')}</dt><dd>{money.format(result.totalRiskUsd)}</dd></div>
                <div><dt className="text-white/65">{text('Risiko je Kontrakt', 'Risk per contract')}</dt><dd>{money.format(result.riskPerContractUsd)}</dd></div>
                <div><dt className="text-white/65">{text('Abstand zum Stop', 'Distance to stop')}</dt><dd>{number.format(result.stopTicks)} {result.stopTicks === 1 ? 'Tick' : 'Ticks'}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-white/60">{text('Ausführung, Margin und Kontolimits können das tatsächliche Risiko oder die mögliche Kontraktzahl verändern.', 'Execution, margin and account limits can affect actual risk or the number of contracts you can trade.')}</p>
            </>
          ) : issue ? <p id={issueId} className="text-sm text-orange-100">{issues[issue]}</p> : null}
        </div>
      </div>
    </details>
  )
}
