'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import React from 'react'
import type { summarizeTradeCurrencyQuality } from '@/lib/utils/currency'
import type { TradeCurrencyCheck } from '@/lib/utils/trade-table'

export function TradeCurrencyQualityPanel({ summary, selected, onChange }: {
  summary: ReturnType<typeof summarizeTradeCurrencyQuality>
  selected: TradeCurrencyCheck
  onChange: (value: TradeCurrencyCheck) => void
}) {
  const text = journalText(useJournalLocale())
  if (!summary.needsReview && selected === 'Alle') return null
  const choices: Array<{ value: TradeCurrencyCheck; label: string; count: number }> = [
    { value: 'Prüfen', label: text('Alle betroffenen Trades', 'All affected trades'), count: summary.needsReview },
    { value: 'Fehlt', label: text('Währung fehlt', 'Currency missing'), count: summary.missing },
    { value: 'Nicht unterstützt', label: text('Währung nicht unterstützt', 'Unsupported currency'), count: summary.unsupported },
  ]
  return <section aria-label={text('Währungsangaben prüfen', 'Check trade currencies')} className="mt-5 rounded-2xl border border-orange-300/20 bg-orange-400/5 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold text-white">{text('Währungsangaben prüfen', 'Check trade currencies')}</h2>
      <span className="text-xs text-white/50">{text(`Im gesamten Journal: ${summary.needsReview} von ${summary.total}`, `${summary.needsReview} of ${summary.total} trades in the journal`)}</span>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-white/70">
      {text(
        `Bei ${summary.missing} ${summary.missing === 1 ? 'Trade' : 'Trades'} fehlt die Währung; ${summary.unsupported} haben eine nicht unterstützte Angabe. Lege sie unten gemeinsam fest oder bearbeite einen einzelnen Trade.`,
        `${summary.missing} ${summary.missing === 1 ? 'trade is' : 'trades are'} missing a currency. ${summary.unsupported} ${summary.unsupported === 1 ? 'has' : 'have'} an unsupported currency. Set them together below or edit a single trade.`,
      )}
    </p>
    <details className="mt-2 text-xs leading-relaxed text-white/60">
      <summary className="cursor-pointer">{text('Warum braucht Equora die Währung?', 'Why does Equora need the currency?')}</summary>
      <p className="mt-2">{text('Damit Geldbeträge richtig zusammengezählt werden. Aus dem Marktnamen wird keine Währung übernommen. USD, USDT und USDC sind unterschiedliche Einheiten.', 'A confirmed currency keeps totals accurate. Equora never assigns a currency from the market name. USD, USDT and USDC are separate currencies.')}</p>
    </details>
    <div className="mt-3 flex flex-wrap gap-2">
      {choices.map(choice => <button key={choice.value} type="button" aria-pressed={selected === choice.value}
        disabled={!choice.count && selected !== choice.value}
        onClick={() => onChange(selected === choice.value ? 'Alle' : choice.value)}
        className={`rounded-full border px-3 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${selected === choice.value ? 'border-orange-300/40 bg-orange-400/15 text-orange-100' : 'border-white/15 bg-black/20 text-white/75 hover:border-white/30 hover:text-white'}`}>
        {choice.label} ({choice.count})
      </button>)}
      {selected !== 'Alle' ? <button type="button" onClick={() => onChange('Alle')}
        className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/70 hover:text-white">{text('Prüffilter aufheben', 'Clear currency filter')}</button> : null}
    </div>
  </section>
}
