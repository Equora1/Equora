import Link from 'next/link'
import { AppShell } from '@/components/layout/app-shell'
import { ReviewSummaryCard } from '@/components/review/review-summary-card'
import { ReviewRhythmCard } from '@/components/review/review-rhythm-card'
import { ReviewEmptyStateCard } from '@/components/review/review-empty-state-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getReviewSnapshotServer } from '@/lib/server/journal'
import { getReviewSessionsServer } from '@/lib/server/review-sessions'
import { mapTradeRowToTrade } from '@/lib/server/transformers'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { buildReviewSnapshots, type ReviewPeriodPreset } from '@/lib/utils/review'
import type { Trade } from '@/lib/types/trade'
import { measurePerformance, measurePerformanceSync } from '@/lib/server/performance'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const initialPreset = (typeof params.periodPreset === 'string' && ['7d', '14d', '30d', '90d'].includes(params.periodPreset) ? params.periodPreset : '7d') as ReviewPeriodPreset
  const access = await getJournalAccess()
  const snapshot = await getReviewSnapshotServer(access.user?.id)
  const savedSessions = await measurePerformance('database.review_sessions.recent', 'database', () => getReviewSessionsServer(access.user?.id), { route: '/review' })
  const { trades, reviewSnapshots } = measurePerformanceSync('transform.review', 'transform', () => {
    const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
    const mappedTrades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null))
    return {
      trades: mappedTrades,
      reviewSnapshots: buildReviewSnapshots(mappedTrades, snapshot.tradeTags, snapshot.dailyNotes, snapshot.source),
    }
  }, { route: '/review', meta: { trades: snapshot.tradeRows.length, tags: snapshot.tradeTags.length, notes: snapshot.dailyNotes.length } })

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <div className="space-y-12">
        <ReviewStartPanel trades={trades} />
        <ReviewEmptyStateCard trades={trades} />

        <ReviewSummaryCard snapshots={reviewSnapshots} savedSessions={savedSessions} source={snapshot.source} initialPreset={initialPreset} />

        <details className="group rounded-[34px] border border-white/10 bg-black/20 p-7 xl:p-9">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Review</p>
              <h2 className="eq-display mt-2 text-xl text-white">Rhythmus prüfen</h2>
            </div>
            <ToggleLabel />
          </summary>
          <div className="mt-7">
            <ReviewRhythmCard trades={trades} weeklySnapshot={reviewSnapshots['7d']} />
          </div>
        </details>
      </div>
    </AppShell>
  )
}

function ReviewStartPanel({ trades }: { trades: Trade[] }) {
  const latestTradeIds = trades.slice(0, 12).map((trade) => trade.id).join('|')
  const href = latestTradeIds
    ? `/trades?reviewTradeIds=${encodeURIComponent(latestTradeIds)}&reviewTitle=${encodeURIComponent('Review')}`
    : '/trades'
  const todayCount = countTradesSince(trades, 0)
  const weekCount = countTradesSince(trades, 7)
  const lossCount = trades.filter((trade) => (trade.netPnL ?? 0) < 0).length

  return (
    <section className="rounded-[34px] border border-orange-400/18 bg-orange-400/[0.05] p-7 shadow-2xl xl:p-9">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.26em] text-orange-100/65">Review</p>
          <h1 className="eq-display mt-2 text-2xl text-white">Heute prüfen. Woche lesen. Morgen enger handeln.</h1>
          <p className="mt-3 text-sm leading-6 text-white/58">Kurz prüfen, was trägt, was kostet und was morgen wegbleibt.</p>
        </div>
        <Link href={href} className="inline-flex items-center justify-center rounded-2xl border border-orange-300/35 bg-orange-400/15 px-5 py-3 text-sm font-medium text-orange-50 transition hover:border-orange-300/55 hover:bg-orange-400/20">
          Trades prüfen
        </Link>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <ReviewPathCard eyebrow="Heute" title={todayCount ? `${todayCount} Trade${todayCount === 1 ? '' : 's'}` : 'Kein Trade'} detail={todayCount ? 'Plan, Entry, Exit.' : 'Kein Review nötig.'} />
        <ReviewPathCard eyebrow="Woche" title={`${weekCount} Trade${weekCount === 1 ? '' : 's'}`} detail="Wiederholer erkennen." />
        <ReviewPathCard eyebrow="Verhalten" title={lossCount ? `${lossCount} rote Trades` : 'Stabil'} detail={lossCount ? 'Fehler enger fassen.' : 'Standard halten.'} />
      </div>
    </section>
  )
}

function ReviewPathCard({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
      <p className="text-[10px] uppercase tracking-[0.22em] text-orange-100/45">{eyebrow}</p>
      <p className="mt-3 text-xl font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/52">{detail}</p>
    </div>
  )
}

function countTradesSince(trades: Trade[], days: number) {
  const now = new Date()
  const todayKey = toLocalDateKey(now)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - Math.max(days - 1, 0))

  return trades.filter((trade) => {
    const occurredAt = new Date(resolveTradeOccurredAt(trade))
    if (Number.isNaN(occurredAt.getTime())) return false
    if (days === 0) return toLocalDateKey(occurredAt) === todayKey
    return occurredAt >= start
  }).length
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function ToggleLabel() {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/55 transition group-open:border-orange-400/20 group-open:text-orange-100">
      <span className="group-open:hidden">Anzeigen</span>
      <span className="hidden group-open:inline">Ausblenden</span>
    </span>
  )
}
