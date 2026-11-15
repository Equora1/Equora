'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'

export default function TradesError({ reset }: { reset: () => void }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  return (
    <div lang={locale} role="alert" className="rounded-[28px] border border-red-400/15 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Trades</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-red-300">{text('Trades konnten nicht geladen werden', 'Trades could not be loaded')}</h2>
      <p className="mt-3 text-sm leading-6 text-white/58">
        {text('Lade die Trade-Liste erneut.', 'Please reload the trades page.')}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-2xl border border-orange-400/30 bg-orange-400 px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01]"
      >
        {text('Ansicht neu laden', 'Reload trades')}
      </button>
    </div>
  )
}
