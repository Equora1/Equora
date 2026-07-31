import { AppShell } from '@/components/layout/app-shell'
import { CostProfilesHub } from '@/components/cost-profiles/cost-profiles-hub'
import { getJournalAccess } from '@/lib/server/auth'
import { getCostProfileUsageServer, getJournalDataSource } from '@/lib/server/journal'
import { getUserCostProfilesServer } from '@/lib/server/user-cost-profiles'
import { measurePerformance } from '@/lib/server/performance'

export const dynamic = 'force-dynamic'

export default async function CostProfilesPage() {
  const access = await getJournalAccess()
  const [profiles, usageByProfileId] = await Promise.all([
    measurePerformance('database.cost_profiles', 'database', () => getUserCostProfilesServer(access.user?.id), { route: '/cost-profiles' }),
    measurePerformance('database.cost_profile_usage', 'database', () => getCostProfileUsageServer(access.user?.id), { route: '/cost-profiles' }),
  ])

  return (
    <AppShell>
      <CostProfilesHub
        initialProfiles={profiles}
        usageByProfileId={usageByProfileId}
        source={getJournalDataSource()}
      />
    </AppShell>
  )
}
