import Link from 'next/link'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { getJournalLocale } from '@/lib/server/journal-locale'
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
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const locale = await getJournalLocale()
  const text = journalText(locale)
  const params = (await searchParams) ?? {}
  const referenceDateKey = getBerlinTodayDateKey()
  const initialPreset = (typeof params.periodPreset === 'string' && ['7d', '14d', '30d', '90d'].includes(params.periodPreset) ? params.periodPreset : '7d') as ReviewPeriodPreset
  const access = await getJournalAccess()
  const snapshot = await getReviewSnapshotServer(access.user?.id)
  if (snapshot.availability !== 'ready') {
    const needsLogin = snapshot.availability === 'unauthenticated'
    return <AppShell><section role="alert" className="rounded-[24px] border border-orange-300/20 bg-black/30 p-6">
      <h1 className="text-xl font-semibold">{text('Review derzeit nicht verfügbar', 'Review currently unavailable')}</h1>
      <p className="mt-3 text-sm leading-6 text-white/60">{needsLogin
        ? text('Bitte melde dich an, um dein Review zu sehen.', 'Sign in to see your review.')
        : text('Deine Trades konnten nicht vollständig geladen werden. Bitte lade die Seite erneut.', 'Your trades could not be loaded in full. Reload the page.')}</p>
      <a href={needsLogin ? '/login' : '/review'} className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm">{needsLogin ? text('Einloggen', 'Sign in') : text('Erneut laden', 'Reload')}</a>
    </section></AppShell>
  }
  const savedSessions = await measurePerformance('database.review_sessions.recent', 'database', () => getReviewSessionsServer(access.user?.id), { route: '/review' })
  const { trades, reviewSnapshots } = measurePerformanceSync('transform.review', 'transform', () => {
    const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
    const mappedTrades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null))
    return {
      trades: mappedTrades,
      reviewSnapshots: buildReviewSnapshots(mappedTrades, snapshot.tradeTags, snapshot.dailyNotes, snapshot.source, locale),
    }
  }, { route: '/review', meta: { trades: snapshot.tradeRows.length, tags: snapshot.tradeTags.length, notes: snapshot.dailyNotes.length } })

  return (
    <AppShell
      filteredTradesCount={trades.length}
      filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length}
      filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}
    >
      <div className="space-y-12">
        <ReviewEmptyStateCard trades={trades} locale={locale} />
        <ReviewSummaryCard snapshots={reviewSnapshots} savedSessions={savedSessions} source={snapshot.source} initialPreset={initialPreset} referenceDateKey={referenceDateKey} />
        <details className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <summary className="cursor-pointer text-sm font-medium text-white">{text('Einzelne Trades nachbereiten', 'Review individual trades')}</summary>
          <div className="mt-4"><ReviewStartPanel trades={trades} locale={locale} /></div>
        </details>

        <details className="group rounded-[34px] border border-white/10 bg-black/20 p-7 xl:p-9">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Review</p>
              <h2 className="eq-display mt-2 text-xl text-white">{text('Rhythmus prüfen', 'Daily and weekly review')}</h2>
            </div>
            <ToggleLabel locale={locale} />
          </summary>
          <div className="mt-7">
            <ReviewRhythmCard trades={trades} weeklySnapshot={reviewSnapshots['7d']} referenceDateKey={referenceDateKey} />
          </div>
        </details>
      </div>
    </AppShell>
  )
}

function ReviewStartPanel({ trades, locale }: { trades: Trade[]; locale: JournalLocale }) {
  const text = journalText(locale)
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
          <h2 className="eq-display mt-2 text-2xl text-white">{text('Trades nachbereiten', 'Review your trades')}</h2>
          <p className="mt-3 text-sm leading-6 text-white/58">{text('Öffne deine Trades, prüfe die Entscheidungen und halte eine Erkenntnis fest.', 'Open your trades, review your decisions and record one takeaway.')}</p>
        </div>
        <Link href={href} className="inline-flex items-center justify-center rounded-2xl border border-orange-300/35 bg-orange-400/15 px-5 py-3 text-sm font-medium text-orange-50 transition hover:border-orange-300/55 hover:bg-orange-400/20">
          {text('Trades prüfen', 'Open trades for review')}
        </Link>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <ReviewPathCard eyebrow={text('Heute', 'Today')} title={todayCount ? `${todayCount} Trade${todayCount === 1 ? '' : 's'}` : text('Kein Trade', 'No trades')} detail={todayCount ? text('Plan, Entry, Exit.', 'Plan, entry, exit.') : text('Kein Review nötig.', 'No review needed.')} />
        <ReviewPathCard eyebrow={text('Woche', 'Week')} title={`${weekCount} Trade${weekCount === 1 ? '' : 's'}`} detail={text('Wiederholer erkennen.', 'Look for recurring patterns.')} />
        <ReviewPathCard eyebrow={text('Verhalten', 'Behaviour')} title={lossCount ? text(`${lossCount} rote Trades`, `${lossCount} losing ${lossCount === 1 ? 'trade' : 'trades'}`) : text('Stabil', 'Stable')} detail={lossCount ? text('Fehler enger fassen.', 'Identify recurring mistakes.') : text('Standard halten.', 'Keep following your process.')} />
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

function ToggleLabel({ locale }: { locale: JournalLocale }) {
  const text = journalText(locale)
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/55 transition group-open:border-orange-400/20 group-open:text-orange-100">
      <span className="group-open:hidden">{text('Anzeigen', 'Show')}</span>
      <span className="hidden group-open:inline">{text('Ausblenden', 'Hide')}</span>
    </span>
  )
}
