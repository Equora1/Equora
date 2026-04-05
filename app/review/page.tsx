import { AppShell } from '@/components/layout/app-shell'
import { ReviewSummaryCard } from '@/components/review/review-summary-card'
import { ReviewRhythmCard } from '@/components/review/review-rhythm-card'
import { ReviewCoachingBriefCard } from '@/components/review/review-coaching-brief-card'
import { ReviewEmptyStateCard } from '@/components/review/review-empty-state-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { getReviewSessionsServer } from '@/lib/server/review-sessions'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildReviewSnapshots, type ReviewPeriodPreset } from '@/lib/utils/review'



export const dynamic = 'force-dynamic'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const initialPreset = (typeof params.periodPreset === 'string' && ['7d', '14d', '30d', '90d'].includes(params.periodPreset) ? params.periodPreset : '7d') as ReviewPeriodPreset
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const savedSessions = await getReviewSessionsServer(access.user?.id)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))
  const reviewSnapshots = buildReviewSnapshots(trades, snapshot.tradeTags, snapshot.dailyNotes, snapshot.source)

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <ReviewEmptyStateCard trades={trades} dailyNotes={snapshot.dailyNotes} />
      <ReviewRhythmCard trades={trades} dailyNotes={snapshot.dailyNotes} weeklySnapshot={reviewSnapshots['7d']} />
      <ReviewCoachingBriefCard snapshot={reviewSnapshots['7d']} />
      <details className="group rounded-3xl border border-white/10 bg-black/20 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Mehr Tiefe bei Bedarf</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Periodenvergleich, Muster und gespeicherte Sessions</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">Die volle Review-Fläche bleibt da, steht aber nicht mehr vor dem ersten verständlichen Blick im Weg.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/55 transition group-open:border-orange-400/20 group-open:text-orange-100">Aufklappen</span>
        </summary>

        <div className="mt-5">
          <ReviewSummaryCard snapshots={reviewSnapshots} savedSessions={savedSessions} source={snapshot.source} initialPreset={initialPreset} />
        </div>
      </details>
    </AppShell>
  )
}
