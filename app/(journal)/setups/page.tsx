import { AppShell } from '@/components/layout/app-shell'
import { SetupExplorer } from '@/components/setups/setup-explorer'
import { SetupStudio } from '@/components/setups/setup-studio'
import { SetupSuggestionCard } from '@/components/setups/setup-suggestion-card'
import { setupDetails as baseSetupDetails, setupLibrary as baseSetupLibrary } from '@/lib/data/mock-data'
import { getJournalAccess } from '@/lib/server/auth'
import { getSetupsSnapshotServer } from '@/lib/server/journal'
import { isEquoraAdminUser } from '@/lib/server/admin'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'
import { buildDynamicSetupDetail, buildSavedSetups, buildSetupLibraryFromSources, buildSetupPerformanceRows, getTradesForSetupTitle } from '@/lib/utils/setup-analytics'
import { getSetupSuggestionsServer } from '@/lib/server/setup-suggestions'
import { measurePerformance, measurePerformanceSync } from '@/lib/server/performance'



export const dynamic = 'force-dynamic'

export default async function SetupsPage() {
  const access = await getJournalAccess()
  const snapshot = await getSetupsSnapshotServer(access.user?.id)
  const [canManageMasterSetups, setupSuggestions] = await Promise.all([
    measurePerformance('auth.admin_check', 'auth', () => isEquoraAdminUser(access.user), { route: '/setups' }),
    measurePerformance('database.setup_suggestions', 'database', () => getSetupSuggestionsServer(access.user?.id), { route: '/setups' }),
  ])
  const { trades, savedSetups, setupLibrary, dynamicDetails, setupPerformanceRows } = measurePerformanceSync('transform.setups', 'transform', () => {
      const tradeMediaMap = snapshot.tradeMediaRows.reduce<Record<string, typeof snapshot.tradeMediaRows>>((acc, row) => {
        if (!acc[row.trade_id]) acc[row.trade_id] = []
        acc[row.trade_id].push(row)
        return acc
      }, {})
      const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
      const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, tradeMediaMap[row.id] ?? [], linkedSetupByTradeId[row.id] ?? null))
      const persistedSetupRows = snapshot.setupRows.filter((setup) => Boolean(setup.created_at))
      const savedSetups = buildSavedSetups(persistedSetupRows, snapshot.setupMediaRows, snapshot.setupTradeLinkRows)
      const activeSetupRows = snapshot.setupRows
        .filter((setup) => !setup.is_archived)
        .sort((left, right) => Number(Boolean(right.is_master)) - Number(Boolean(left.is_master)))
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
            getTradesForSetupTitle(setup.title, trades, savedSetups),
            setupRowByTitle.get(setup.title),
            setupMediaMap[setupRowByTitle.get(setup.title)?.id ?? ''] ?? [],
          ),
        ]),
      )

      const setupPerformanceRows = buildSetupPerformanceRows(setupLibrary.map((setup) => setup.title), trades, savedSetups)
    return { trades, savedSetups, setupLibrary, dynamicDetails, setupPerformanceRows }
  }, { route: '/setups', meta: { trades: snapshot.tradeRows.length, setups: snapshot.setupRows.length, media: snapshot.setupMediaRows.length + snapshot.tradeMediaRows.length } })

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <div className="space-y-8">
        <SetupExplorer setupLibrary={setupLibrary} setupDetails={dynamicDetails} trades={trades} savedSetups={savedSetups} setupPerformanceRows={setupPerformanceRows} canManageMaster={canManageMasterSetups} />
        <SetupStudio initialSetups={savedSetups} initialTrades={trades} source={snapshot.source} canManageMaster={canManageMasterSetups} />
        <SetupSuggestionCard suggestions={setupSuggestions} canManageMaster={canManageMasterSetups} />
      </div>
    </AppShell>
  )
}
