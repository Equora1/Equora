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
  if (snapshot.availability !== 'ready') {
    const needsLogin = snapshot.availability === 'unauthenticated'
    return <AppShell><section role="alert" className="rounded-[24px] border border-orange-300/20 bg-black/30 p-6">
      <h1 className="text-xl font-semibold">Statistik derzeit nicht verfügbar</h1>
      <p className="mt-3 text-sm leading-6 text-white/60">{needsLogin
        ? 'Bitte melde dich an, um deine Statistik zu sehen.'
        : 'Deine Daten konnten nicht vollständig geladen werden. Bitte lade die Seite erneut. Die Statistik unterstützt derzeit bis zu 10.000 Trades.'}</p>
      <a href={needsLogin ? '/login' : '/statistik'} className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm">{needsLogin ? 'Einloggen' : 'Erneut laden'}</a>
    </section></AppShell>
  }
  const { trades, setupTitles } = measurePerformanceSync('transform.statistics', 'transform', () => {
    const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
    return {
      trades: snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null)),
      setupTitles: snapshot.setupRows.map((setup) => setup.title),
    }
  }, { route: '/statistik', meta: { trades: snapshot.tradeRows.length, setups: snapshot.setupRows.length } })

  return <AppShell filteredTradesCount={trades.length} filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length} filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}><StatistikWorkbench trades={trades} tradeTags={snapshot.tradeTags} setupTitles={setupTitles} initialLayer={initialLayer} initialSetup={initialSetup} /></AppShell>
}
