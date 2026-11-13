'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'

export default function GlobalError({ reset }: { reset: () => void }) {
  const text = journalText(useJournalLocale())

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-xl rounded-3xl border border-red-400/15 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Equora</p>
        <div role="alert">
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-red-300">{text('Die Seite konnte nicht geladen werden', 'This page could not be loaded')}</h1>
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-2xl border border-orange-400/30 bg-orange-400 px-4 py-3 text-sm font-medium text-black transition hover:scale-[1.01]"
        >
          {text('Erneut versuchen', 'Try again')}
        </button>
      </div>
    </div>
  )
}
