import { BrokerSyncHub } from '@/components/broker-sync/broker-sync-hub'
import { AppShell } from '@/components/layout/app-shell'
import { getBrokerSyncSnapshotServer } from '@/lib/server/broker-sync'
import { getJournalAccess } from '@/lib/server/auth'
import { measurePerformance } from '@/lib/server/performance'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function BrokerSyncPage() {
  const access = await getJournalAccess()
  const snapshot = await measurePerformance('database.broker_sync', 'database', () => getBrokerSyncSnapshotServer(access.user?.id), { route: '/broker-sync' })

  return (
    <AppShell>
      <BrokerSyncHub snapshot={snapshot} />
    </AppShell>
  )
}
