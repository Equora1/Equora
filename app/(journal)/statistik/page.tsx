import { StatistikWorkbench } from '@/components/analytics/statistik-workbench'
import { AppShell } from '@/components/layout/app-shell'
import { getJournalAccess } from '@/lib/server/auth'
import { getStatisticsSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'
import { measurePerformanceSync } from '@/lib/server/performance'



export const dynamic = 'force-dynamic'

type StatistikPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function StatistikPage({ searchParams }: StatistikPageProps) {
  const resolvedSearchParams = await searchParams
  const rawLayer = resolvedSearchParams?.layer
  const rawSetup = resolvedSearchParams?.setup
  const initialLayer = Array.isArray(rawLayer) ? rawLayer[0] : rawLayer
  const initialSetup = Array.isArray(rawSetup) ? rawSetup[0] : rawSetup
  const access = await getJournalAccess()
  const snapshot = await getStatisticsSnapshotServer(access.user?.id)
  const { trades, setupTitles } = measurePerformanceSync('transform.statistics', 'transform', () => {
    const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
    return {
      trades: snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null)),
      setupTitles: snapshot.setupRows.map((setup) => setup.title),
    }
  }, { route: '/statistik', meta: { trades: snapshot.tradeRows.length, setups: snapshot.setupRows.length } })

  return <AppShell filteredTradesCount={trades.length} filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length} filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}><StatistikWorkbench trades={trades} tradeTags={snapshot.tradeTags} setupTitles={setupTitles} initialLayer={initialLayer} initialSetup={initialSetup} /></AppShell>
}
