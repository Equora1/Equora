import { JournalPageLoading } from '@/components/layout/journal-page-loading'
import { journalText } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'

export default async function PerformanceLoading() {
  const text = journalText(await getJournalLocale())
  return <JournalPageLoading title={text('Diagnose wird geladen', 'Loading diagnostics')} />
}
