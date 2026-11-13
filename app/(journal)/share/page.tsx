import { AppShell } from '@/components/layout/app-shell'
import { EquoraShareHub } from '@/components/share/equora-share-hub'
import { getJournalAccess } from '@/lib/server/auth'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { getAdminSharedTradeSubmissionsServer, getFeaturedSharedTradeSubmissionsServer, getOwnSharedTradeSubmissionsServer } from '@/lib/server/shared-trades'
import { getShareSnapshotServer } from '@/lib/server/journal'
import { getTradeByIdServer } from '@/lib/server/trades'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'



export const dynamic = 'force-dynamic'
const TRADE_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export default async function SharePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {}
  const requestedTradeId = Array.isArray(params.tradeId) ? params.tradeId[0] : params.tradeId
  const access = await getJournalAccess()
  const selectedTradeId = access.user ? requestedTradeId?.toLowerCase() : requestedTradeId
  const snapshot = await getShareSnapshotServer(access.user?.id)
  const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null))
  if (
    access.user &&
    selectedTradeId &&
    TRADE_ID_PATTERN.test(selectedTradeId) &&
    !trades.some((trade) => trade.id === selectedTradeId)
  ) {
    // The list can be capped by the API. A link from a trade's detail page
    // must still resolve that specific trade within the signed-in user's journal.
    const selectedRow = await getTradeByIdServer(selectedTradeId, access.user.id).catch(() => null)
    if (selectedRow?.id === selectedTradeId) {
      trades.unshift(mapTradeRowToTrade({ ...selectedRow, screenshot_url: null }))
    }
  }
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
