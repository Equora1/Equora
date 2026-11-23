'use client'

import { useId, useState, type ReactNode } from 'react'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalNumberLocale, journalText } from '@/lib/i18n/journal'
import {
  calculateForexMove,
  convertForexValues,
  formatForexAmount,
  forexCurrencies,
  forexPairDetails,
  forexPairs,
  type ForexDirection,
  type ForexPair,
  type ForexSizeUnit,
} from '@/lib/utils/forex-calculator'

const fieldClass = 'mt-1 block w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300'

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-white/65">{label}</dt>
      <dd className="mt-1 break-words font-semibold tabular-nums text-white">{value}</dd>
    </div>
  )
}

export function ForexPipCalculator() {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const hintId = useId()
  const errorId = useId()
  const conversionId = useId()
  const [pair, setPair] = useState<ForexPair>('EUR/USD')
  const [direction, setDirection] = useState<ForexDirection>('long')
  const [entry, setEntry] = useState('')
  const [exit, setExit] = useState('')
  const [size, setSize] = useState('')
  const [sizeUnit, setSizeUnit] = useState<ForexSizeUnit>('lots')
  const [accountCurrency, setAccountCurrency] = useState('')
  const [rate, setRate] = useState('')

  const { base, quote, priceDecimals, pipSize } = forexPairDetails(pair)
  const language = journalNumberLocale[locale]
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  const price = new Intl.NumberFormat(language, { maximumFractionDigits: priceDecimals, useGrouping: false })
  const result = entry.trim() && exit.trim() ? calculateForexMove({ pair, direction, entry, exit, size, sizeUnit }) : null
  const issue = result?.ok ? result.positionIssue : result?.reason
  const sizeInvalid = issue === 'size' || issue === 'range'
  const position = result?.ok ? result.position : null
  const converted = position && accountCurrency && rate.trim() ? convertForexValues(position, rate) : null
  const rateInvalid = Boolean(position && accountCurrency && rate.trim() && !converted)
  const issues = {
    entry: text(`Gib einen positiven Einstiegspreis mit höchstens ${priceDecimals} Nachkommastellen ein.`, `Enter a positive entry price with up to ${priceDecimals} decimal places.`),
    exit: text(`Gib einen positiven Ausstiegspreis mit höchstens ${priceDecimals} Nachkommastellen ein.`, `Enter a positive exit price with up to ${priceDecimals} decimal places.`),
    size: sizeUnit === 'lots'
      ? text('Gib eine positive Lotgröße mit höchstens fünf Nachkommastellen ein.', 'Enter a positive lot size with up to five decimal places.')
      : text('Gib eine positive Anzahl ganzer Einheiten ein.', 'Enter a positive whole number of units.'),
    range: text('Der Betrag ist zu groß. Prüfe die Eingaben.', 'The result is too large. Check your inputs.'),
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">{text('Forex-Pip-Rechner', 'Forex pip calculator')}</h2>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-white/75">
            {text('Währungspaar', 'Currency pair')}
            <select className={fieldClass} value={pair} onChange={(event) => {
              const next = forexPairs.find((option) => option === event.target.value)
              if (!next) return
              setPair(next)
              setEntry('')
              setExit('')
              setAccountCurrency('')
              setRate('')
            }}>
              {forexPairs.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-sm text-white/75">
            {text('Richtung', 'Direction')}
            <select className={fieldClass} value={direction} onChange={(event) => setDirection(event.target.value === 'short' ? 'short' : 'long')}>
              <option value="long">Long</option><option value="short">Short</option>
            </select>
          </label>
          <label className="text-sm text-white/75">
            {text('Einstiegspreis', 'Entry price')}
            <input className={fieldClass} inputMode="decimal" value={entry} onChange={(event) => setEntry(event.target.value)}
              aria-invalid={issue === 'entry'} aria-describedby={issue === 'entry' ? `${hintId} ${errorId}` : hintId} />
          </label>
          <label className="text-sm text-white/75">
            {text('Ausstiegspreis', 'Exit price')}
            <input className={fieldClass} inputMode="decimal" value={exit} onChange={(event) => setExit(event.target.value)}
              aria-invalid={issue === 'exit'} aria-describedby={issue === 'exit' ? `${hintId} ${errorId}` : hintId} />
          </label>
        </div>
        <p id={hintId} className="text-xs text-white/65">
          {text('Dezimalpunkt oder Komma verwenden. Tausendertrennzeichen weglassen.', 'Use a decimal point or comma. Leave out thousands separators.')}
          {' '}{text('1 Pip = 10 Pipetten.', '1 pip = 10 pipettes.')} {' '}{text('Pip-Größe', 'Pip size')} {price.format(pipSize)}.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-white/75">
            {text('Positionsgröße (optional)', 'Position size (optional)')}
            <input className={fieldClass} inputMode={sizeUnit === 'lots' ? 'decimal' : 'numeric'} value={size}
              onChange={(event) => setSize(event.target.value)} aria-invalid={sizeInvalid}
              aria-describedby={sizeInvalid ? `${hintId} ${errorId}` : hintId} />
          </label>
          <label className="text-sm text-white/75">
            {text('Größe eingeben in', 'Size entered in')}
            <select className={fieldClass} value={sizeUnit} onChange={(event) => {
              setSizeUnit(event.target.value === 'units' ? 'units' : 'lots')
              setSize('')
            }}>
              <option value="lots">{text('Lots', 'Lots')}</option>
              <option value="units">{text('Einheiten', 'Units')}</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-white/65">
          {text('Standard-Lot', 'Standard lot')} {new Intl.NumberFormat(language).format(100000)} {base}
          {' · '}{text('Mini', 'Mini')} {price.format(0.1)} Lot
          {' · '}{text('Micro', 'Micro')} {price.format(0.01)} Lot
        </p>

        <div aria-live="polite">
          {result?.ok && (
            <dl className="grid gap-3 rounded-xl bg-black/35 p-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={text('Bewegung in Pips', 'Move in pips')} value={number.format(result.pips)} />
              <Metric label={text('Bewegung in Pipetten', 'Move in pipettes')} value={number.format(result.pipettes)} />
              {position && <>
                <Metric label={text('Pip-Wert der Position', 'Pip value of position')} value={formatForexAmount(position.pipValueUnits, position.fractionDigits, language) + ' ' + quote} />
                <Metric label={text('Brutto-P&L', 'Gross P&L')} value={formatForexAmount(position.grossPnlUnits, position.fractionDigits, language) + ' ' + quote} />
              </>}
            </dl>
          )}
          {issue && <p id={errorId} className="text-sm text-orange-100">{issues[issue]}</p>}
        </div>

        {position && (
          <details className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
            <summary className="cursor-pointer">{text('In Kontowährung umrechnen (optional)', 'Convert to account currency (optional)')}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                {text('Kontowährung', 'Account currency')}
                <select className={fieldClass} value={accountCurrency} onChange={(event) => {
                  setAccountCurrency(event.target.value)
                  setRate('')
                }}>
                  <option value="">{text(`Beträge in ${quote} belassen`, `Keep amounts in ${quote}`)}</option>
                  {forexCurrencies.filter((currency) => currency !== quote).map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </label>
              {accountCurrency && (
                <label>
                  {text(`Wie viel ${accountCurrency} entspricht 1 ${quote}?`, `How many ${accountCurrency} equal 1 ${quote}?`)}
                  <input className={fieldClass} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)}
                    aria-invalid={rateInvalid} aria-describedby={rateInvalid ? conversionId : undefined} />
                </label>
              )}
            </div>
            <div aria-live="polite">
              {rateInvalid && <p id={conversionId} className="mt-2 text-orange-100">{text('Gib einen positiven Kurs mit höchstens acht Nachkommastellen ein.', 'Enter a positive rate with up to eight decimal places.')}</p>}
              {converted && (
                <dl className="mt-3 grid gap-3 rounded-xl bg-black/30 p-3 sm:grid-cols-2">
                  <Metric label={text('Pip-Wert umgerechnet', 'Converted pip value')} value={formatForexAmount(converted.pipValueUnits, converted.fractionDigits, language) + ' ' + accountCurrency} />
                  <Metric label={text('Brutto-P&L umgerechnet', 'Converted gross P&L')} value={formatForexAmount(converted.grossPnlUnits, converted.fractionDigits, language) + ' ' + accountCurrency} />
                </dl>
              )}
            </div>
          </details>
        )}
        {position && <p className="text-xs text-white/60">{text('Brutto vor Kosten. Die Umrechnung verwendet deinen eingegebenen Kurs.', 'Gross figures before costs. Conversion uses the rate you enter.')}</p>}
      </div>
    </section>
  )
}
