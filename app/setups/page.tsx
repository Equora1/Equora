import { AppShell } from '@/components/layout/app-shell'
import { SetupExplorer } from '@/components/setups/setup-explorer'
import { SetupStudio } from '@/components/setups/setup-studio'
import { SetupsKickstartCard } from '@/components/setups/setups-kickstart-card'
import { setupDetails as baseSetupDetails, setupLibrary as baseSetupLibrary } from '@/lib/data/mock-data'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildDynamicSetupDetail, buildSavedSetups, buildSetupLibraryFromSources } from '@/lib/utils/setup-analytics'



export const dynamic = 'force-dynamic'

export default async function SetupsPage() {
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const tradeMediaMap = snapshot.tradeMediaRows.reduce<Record<string, typeof snapshot.tradeMediaRows>>((acc, row) => {
    if (!acc[row.trade_id]) acc[row.trade_id] = []
    acc[row.trade_id].push(row)
    return acc
  }, {})
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, tradeMediaMap[row.id] ?? []))
  const persistedSetupRows = snapshot.setupRows.filter((setup) => Boolean(setup.created_at))
  const savedSetups = buildSavedSetups(persistedSetupRows, snapshot.setupMediaRows)
  const activeSetupRows = snapshot.setupRows.filter((setup) => !setup.is_archived)
  const setupLibrary = buildSetupLibraryFromSources(baseSetupLibrary, activeSetupRows, trades)
  const setupMediaMap = snapshot.setupMediaRows.reduce<Record<string, typeof snapshot.setupMediaRows>>((acc, row) => {
    if (!acc[row.setup_id]) acc[row.setup_id] = []
    acc[row.setup_id].push(row)
    return acc
  }, {})
  const setupRowByTitle = new Map(activeSetupRows.map((setup) => [setup.title, setup]))
  const dynamicDetails = Object.fromEntries(
    setupLibrary.map((setup) => [
      setup.title,
      buildDynamicSetupDetail(
        baseSetupDetails[setup.title],
        trades.filter((trade) => trade.setup === setup.title),
        setupRowByTitle.get(setup.title),
        setupMediaMap[setupRowByTitle.get(setup.title)?.id ?? ''] ?? [],
      ),
    ]),
  )

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <div className="space-y-6">
        <SetupsKickstartCard setups={snapshot.setupRows} trades={trades} />
        <SetupStudio initialSetups={savedSetups} source={snapshot.source} />
        <SetupExplorer setupLibrary={setupLibrary} setupDetails={dynamicDetails} trades={trades} />
      </div>
    </AppShell>
  )
}
