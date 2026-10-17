'use client'

import React from 'react'
import type { summarizeTradeCurrencyQuality } from '@/lib/utils/currency'
import type { TradeCurrencyCheck } from '@/lib/utils/trade-table'

export function TradeCurrencyQualityPanel({ summary, selected, onChange }: {
  summary: ReturnType<typeof summarizeTradeCurrencyQuality>
  selected: TradeCurrencyCheck
  onChange: (value: TradeCurrencyCheck) => void
}) {
  if (!summary.needsReview && selected === 'Alle') return null
  const choices: Array<{ value: TradeCurrencyCheck; label: string; count: number }> = [
    { value: 'Prüfen', label: 'Alle betroffenen Trades', count: summary.needsReview },
    { value: 'Fehlt', label: 'Währung fehlt', count: summary.missing },
    { value: 'Nicht unterstützt', label: 'Währung nicht unterstützt', count: summary.unsupported },
  ]
  return <section aria-label="Währungsangaben prüfen" className="mt-5 rounded-2xl border border-orange-300/20 bg-orange-400/5 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-white">Währungsangaben prüfen</h2>
      <span className="text-xs text-white/50">Im gesamten Journal: {summary.needsReview} von {summary.total}</span>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-white/70">
      Für Geld-Auswertungen muss die Währung des jeweiligen Ergebnisses feststehen. Bei {summary.missing} {summary.missing === 1 ? 'Trade' : 'Trades'} fehlt sie;
      bei {summary.unsupported} {summary.unsupported === 1 ? 'Trade' : 'Trades'} ist eine derzeit nicht unterstützte Währung gespeichert.
      Auch abgeschlossene Trades können diese Ergänzung benötigen.
    </p>
    <p className="mt-2 text-xs leading-relaxed text-white/55">
      Öffne die betroffenen Trades und prüfe die Währung anhand deiner Konto- oder Brokerunterlagen.
      Aus dem Marktnamen wird keine Währung übernommen. USD, USDT und USDC sind unterschiedliche Einheiten.
      Deine Suche und die übrigen Filter bleiben erhalten.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      {choices.map(choice => <button key={choice.value} type="button" aria-pressed={selected === choice.value}
        disabled={!choice.count && selected !== choice.value}
        onClick={() => onChange(selected === choice.value ? 'Alle' : choice.value)}
        className={`rounded-full border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${selected === choice.value ? 'border-orange-300/40 bg-orange-400/15 text-orange-100' : 'border-white/15 bg-black/20 text-white/75 hover:border-white/30 hover:text-white'}`}>
        {choice.label} ({choice.count})
      </button>)}
      {selected !== 'Alle' ? <button type="button" onClick={() => onChange('Alle')}
        className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/70 hover:text-white">Prüffilter aufheben</button> : null}
    </div>
  </section>
}
