import { AppShell } from '@/components/layout/app-shell'
import { CostProfilesHub } from '@/components/cost-profiles/cost-profiles-hub'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { getUserCostProfilesServer } from '@/lib/server/user-cost-profiles'
import { mapTradeRowToTrade } from '@/lib/server/transformers'



export const dynamic = 'force-dynamic'

export default async function CostProfilesPage() {
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const profiles = await getUserCostProfilesServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))

  const usageByProfileId = snapshot.tradeRows.reduce<Record<string, number>>((acc, row) => {
    if (!row.user_cost_profile_id) return acc
    acc[row.user_cost_profile_id] = (acc[row.user_cost_profile_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <CostProfilesHub initialProfiles={profiles} usageByProfileId={usageByProfileId} source={snapshot.source} />
    </AppShell>
  )
}
