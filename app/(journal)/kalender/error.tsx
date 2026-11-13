'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'

export default function CalendarError() {
  const text = journalText(useJournalLocale())
  return <div role="alert" className="rounded-3xl border border-red-400/15 bg-red-400/5 p-6 text-red-200">
    {text('Kalender konnte nicht geladen werden.', 'The calendar could not be loaded.')}
  </div>
}
