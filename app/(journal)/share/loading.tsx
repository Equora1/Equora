import { JournalPageLoading } from '@/components/layout/journal-page-loading'
import { journalText } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'

export default async function PageLoading() {
  const text = journalText(await getJournalLocale())
  return <JournalPageLoading title={text('Geteilte Trades werden geladen', 'Loading shared trades')} />
}
