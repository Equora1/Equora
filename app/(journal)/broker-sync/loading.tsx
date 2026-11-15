import { JournalPageLoading } from '@/components/layout/journal-page-loading'

import { journalText } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'

export default async function BrokerSyncLoading() {
  const text = journalText(await getJournalLocale())
  return <JournalPageLoading compact title={text('Brokerübersicht wird geladen', 'Loading broker overview')} />
}
