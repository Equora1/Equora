import { AppShell } from '@/components/layout/app-shell'
import { EquoraShareHub } from '@/components/share/equora-share-hub'
import { getJournalAccess } from '@/lib/server/auth'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { getAdminSharedTradeSubmissionsServer, getFeaturedSharedTradeSubmissionsServer, getOwnSharedTradeSubmissionsServer } from '@/lib/server/shared-trades'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'



export const dynamic = 'force-dynamic'

export default async function SharePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {}
  const selectedTradeId = Array.isArray(params.tradeId) ? params.tradeId[0] : params.tradeId
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const ownSubmissions = await getOwnSharedTradeSubmissionsServer(access.user?.id)
  const featuredSubmissions = await getFeaturedSharedTradeSubmissionsServer()
  const isAdmin = await isEquoraAdminUser(access.user)
  const adminSubmissions = isAdmin ? await getAdminSharedTradeSubmissionsServer() : []
  const trustedLosses = trades.filter((trade) => (trade.netPnL ?? 0) < 0).length

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trustedLosses}
    >
      <EquoraShareHub
        trades={trades}
        ownSubmissions={ownSubmissions}
        featuredSubmissions={featuredSubmissions}
        adminSubmissions={adminSubmissions}
        selectedTradeId={selectedTradeId}
        isAdmin={isAdmin}
        source={snapshot.source}
      />
    </AppShell>
  )
}
