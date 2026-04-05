import { AppShell } from '@/components/layout/app-shell'
import { ReviewSessionsHub } from '@/components/review/review-sessions-hub'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { getReviewSessionsPageServer } from '@/lib/server/review-sessions'
import { mapTradeRowToTrade } from '@/lib/server/transformers'



export const dynamic = 'force-dynamic'

export default async function ReviewSessionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const parsedPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1
  const pagedSessions = await getReviewSessionsPageServer(access.user?.id, {
    page,
    pageSize: 24,
    search: typeof params.search === 'string' ? params.search : '',
    sessionType: typeof params.type === 'string' ? params.type as 'all' | 'review' | 'spotlight' : 'all',
    periodPreset: typeof params.periodPreset === 'string' ? params.periodPreset as 'all' | '7d' | '14d' | '30d' | '90d' : 'all',
    sessionStatus: typeof params.status === 'string' ? params.status as 'all' | 'open' | 'watch' | 'closed' : 'all',
    pinnedOnly: typeof params.pinned === 'string' ? params.pinned === '1' : false,
  })
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <ReviewSessionsHub
        initialSessions={pagedSessions.sessions}
        source={snapshot.source}
        initialSearch={typeof params.search === 'string' ? params.search : ''}
        initialSessionType={typeof params.type === 'string' ? params.type : 'all'}
        initialPeriodPreset={typeof params.periodPreset === 'string' ? params.periodPreset : 'all'}
        initialStatusFilter={typeof params.status === 'string' ? params.status : 'all'}
        initialPinnedOnly={typeof params.pinned === 'string' ? params.pinned === '1' : false}
        pagination={pagedSessions}
      />
    </AppShell>
  )
}
