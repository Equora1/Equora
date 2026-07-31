import { AppShell } from '@/components/layout/app-shell'
import { ReviewSessionsHub } from '@/components/review/review-sessions-hub'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalDataSource } from '@/lib/server/journal'
import { getReviewSessionsPageServer } from '@/lib/server/review-sessions'
import { measurePerformance } from '@/lib/server/performance'

export const dynamic = 'force-dynamic'

export default async function ReviewSessionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const access = await getJournalAccess()
  const parsedPage = typeof params.page === 'string' ? Number(params.page) : 1
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1
  const pagedSessions = await measurePerformance('database.review_sessions.page', 'database', () => getReviewSessionsPageServer(access.user?.id, {
    page,
    pageSize: 24,
    search: typeof params.search === 'string' ? params.search : '',
    sessionType: typeof params.type === 'string' ? params.type as 'all' | 'review' | 'spotlight' : 'all',
    periodPreset: typeof params.periodPreset === 'string' ? params.periodPreset as 'all' | '7d' | '14d' | '30d' | '90d' : 'all',
    sessionStatus: typeof params.status === 'string' ? params.status as 'all' | 'open' | 'watch' | 'closed' : 'all',
    pinnedOnly: typeof params.pinned === 'string' ? params.pinned === '1' : false,
  }), { route: '/review-sessions', meta: { page } })

  return (
    <AppShell>
      <ReviewSessionsHub
        initialSessions={pagedSessions.sessions}
        source={getJournalDataSource()}
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
