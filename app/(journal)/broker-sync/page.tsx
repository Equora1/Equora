import { BrokerSyncHub } from '@/components/broker-sync/broker-sync-hub'
import { AppShell } from '@/components/layout/app-shell'
import { getBrokerSyncSnapshotServer } from '@/lib/server/broker-sync'
import { getJournalLocale } from '@/lib/server/journal-locale'
import { getJournalAccess } from '@/lib/server/auth'
import { measurePerformance } from '@/lib/server/performance'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function BrokerSyncPage() {
  const [access, locale] = await Promise.all([getJournalAccess(), getJournalLocale()])
  const snapshot = await measurePerformance('database.broker_sync', 'database', () => getBrokerSyncSnapshotServer(access.user?.id, locale), { route: '/broker-sync' })

  return (
    <AppShell>
      <BrokerSyncHub snapshot={snapshot} locale={locale} />
    </AppShell>
  )
}
