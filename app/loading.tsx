'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'

export default function GlobalLoading() {
  const text = journalText(useJournalLocale())

  return (
    <div role="status" className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="rounded-3xl border border-orange-400/15 bg-white/[0.04] px-6 py-5 shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.35em] text-white/38">Equora</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-orange-400">{text('Journal wird geladen', 'Loading journal')}</p>
      </div>
    </div>
  )
}
