'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { ForexPipCalculator } from '@/components/trades/forex-pip-calculator'
import { FuturesRiskCalculator } from '@/components/trades/futures-risk-calculator'
import { journalText } from '@/lib/i18n/journal'

const calculators = [
  { key: 'futures', label: 'Futures', Component: FuturesRiskCalculator },
  { key: 'forex', label: 'Forex', Component: ForexPipCalculator },
] as const

type Calculator = (typeof calculators)[number]['key']

export function TradingCalculators() {
  const text = journalText(useJournalLocale())
  const id = useId()
  const [selected, setSelected] = useState<Calculator>('futures')
  const buttons = useRef<Record<Calculator, HTMLButtonElement | null>>({ futures: null, forex: null })

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, current: Calculator) {
    let next: Calculator
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        next = current === 'futures' ? 'forex' : 'futures'
        break
      case 'Home':
        next = 'futures'
        break
      case 'End':
        next = 'forex'
        break
      default:
        return
    }
    event.preventDefault()
    setSelected(next)
    buttons.current[next]?.focus()
  }

  return (
    <section className="space-y-5">
      <h1 className="eq-display text-2xl font-semibold text-white sm:text-3xl">{text('Rechner', 'Calculators')}</h1>
      <div role="tablist" aria-label={text('Rechner wählen', 'Choose a calculator')}
        className="inline-flex max-w-full gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
        {calculators.map(({ key, label }) => {
          const active = key === selected
          return (
            <button key={key} type="button" role="tab" id={`${id}-tab-${key}`} ref={(element) => { buttons.current[key] = element }}
              aria-selected={active} aria-controls={`${id}-panel-${key}`} tabIndex={active ? 0 : -1}
              onClick={() => setSelected(key)} onKeyDown={(event) => handleTabKey(event, key)}
              className={`min-h-11 rounded-lg px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300 ${active ? 'bg-orange-300/15 text-orange-100' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
              {label}
            </button>
          )
        })}
      </div>
      {calculators.map(({ key, Component }) => (
        <div key={key} role="tabpanel" id={`${id}-panel-${key}`} aria-labelledby={`${id}-tab-${key}`}
          hidden={key !== selected} tabIndex={0} className="rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
          <Component />
        </div>
      ))}
    </section>
  )
}
