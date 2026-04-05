import { StatistikWorkbench } from '@/components/analytics/statistik-workbench'
import { AppShell } from '@/components/layout/app-shell'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'



export const dynamic = 'force-dynamic'

export default async function StatistikPage() {
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const setupTitles = snapshot.setupRows.map((setup) => setup.title)

  return <AppShell filteredTradesCount={trades.length} filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length} filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}><StatistikWorkbench trades={trades} tradeTags={snapshot.tradeTags} setupTitles={setupTitles} /></AppShell>
}
