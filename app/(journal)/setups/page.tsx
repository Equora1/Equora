import { journalText } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'
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



const templateDescriptions = Object.fromEntries(baseSetupLibrary.map((setup) => [setup.title, setup.description]))

export const dynamic = 'force-dynamic'

export default async function SetupsPage() {
  const locale = await getJournalLocale()
  const text = journalText(locale)
  const access = await getJournalAccess()
  const snapshot = await getSetupsSnapshotServer(access.user?.id)
  if (snapshot.availability !== 'ready') {
    const needsLogin = snapshot.availability === 'unauthenticated'
    return <AppShell><section lang={locale} role="alert" className="rounded-[24px] border border-orange-300/20 bg-black/30 p-6">
      <h1 className="text-xl font-semibold">{text('Setups derzeit nicht verfügbar', 'Setups are currently unavailable')}</h1>
      <p className="mt-3 text-sm leading-6 text-white/60">{needsLogin
        ? text('Bitte melde dich an, um deine Setups zu sehen.', 'Sign in to see your setups.')
        : text('Deine Daten konnten nicht vollständig geladen werden. Bitte lade die Seite erneut. Die Setup-Auswertung unterstützt derzeit bis zu 10.000 Trades.', 'Your data could not be loaded in full. Reload the page. Setup statistics currently support up to 10,000 trades.')}</p>
      <a href={needsLogin ? '/login' : '/setups'} className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm">{needsLogin ? text('Einloggen', 'Sign in') : text('Erneut laden', 'Reload')}</a>
    </section></AppShell>
  }
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
      const setupLibrary = buildSetupLibraryFromSources(baseSetupLibrary, activeSetupRows, trades, locale)
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
            locale,
          ),
        ]),
      )

      const setupPerformanceRows = buildSetupPerformanceRows(setupLibrary.map((setup) => setup.title), trades, savedSetups, locale)
    return { trades, savedSetups, setupLibrary, dynamicDetails, setupPerformanceRows }
  }, { route: '/setups', meta: { trades: snapshot.tradeRows.length, setups: snapshot.setupRows.length, media: snapshot.setupMediaRows.length + snapshot.tradeMediaRows.length } })

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <div className="space-y-8">
        <SetupExplorer setupLibrary={setupLibrary} setupDetails={dynamicDetails} templateDetails={baseSetupDetails} templateDescriptions={templateDescriptions} trades={trades} savedSetups={savedSetups} setupPerformanceRows={setupPerformanceRows} canManageMaster={canManageMasterSetups} />
        <SetupStudio initialSetups={savedSetups} initialTrades={trades} source={snapshot.source} canManageMaster={canManageMasterSetups} />
        <SetupSuggestionCard suggestions={setupSuggestions} canManageMaster={canManageMasterSetups} />
      </div>
    </AppShell>
  )
}
