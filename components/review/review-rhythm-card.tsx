'use client'

import { formatRMultiple } from '@/lib/utils/calculations'
import Link from 'next/link'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { buildDailyNoteFlowSummary } from '@/lib/utils/daily-notes'
import { formatReviewCalendarDay, getLatestReviewDateKey, getReviewTradeDateKey } from '@/lib/utils/review-display'
import type { ReviewSnapshot } from '@/lib/utils/review'
import { buildReviewCoachingBrief } from '@/lib/utils/review-coaching'

function getDayTitle(daySummary: ReturnType<typeof buildDailyNoteFlowSummary>, referenceDateKey: string, locale: JournalLocale) {
  const text = journalText(locale)
  if (daySummary.dateKey === referenceDateKey) return text('Heute', 'Today')
  return text('Letzter aktiver Tag', 'Last active day')
}

type ReviewMode = 'day' | 'week'

export function ReviewRhythmCard({
  trades,
  weeklySnapshot,
  referenceDateKey,
}: {
  trades: Trade[]
  weeklySnapshot: ReviewSnapshot
  referenceDateKey: string
}) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [mode, setMode] = useState<ReviewMode>('day')
  const activeDateKey = useMemo(() => getLatestReviewDateKey(trades, referenceDateKey), [trades, referenceDateKey])
  const daySummary = useMemo(() => buildDailyNoteFlowSummary(trades, [], activeDateKey, getReviewTradeDateKey, locale), [activeDateKey, trades, locale])
  const dayTradeIds = daySummary.dayTrades.map((trade) => trade.id).join(',')
  const dayFocusHref = dayTradeIds
    ? `/trades?reviewTradeIds=${encodeURIComponent(dayTradeIds)}&reviewFocus=${encodeURIComponent(text(`Tagesreview · ${activeDateKey}`, `Daily review · ${activeDateKey}`))}`
    : '/trades'
  const coachingBrief = useMemo(() => buildReviewCoachingBrief(weeklySnapshot, locale), [weeklySnapshot, locale])
  const strongestSignal = weeklySnapshot.topPerformers[0]
  const warningSignal = weeklySnapshot.weakSpots[0] ?? weeklySnapshot.errorClusters[0]
  const nextFocus = coachingBrief.focus

  return (
    <section className="mb-0 rounded-3xl border border-orange-400/15 bg-black/25 p-6 shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{text('Tag / Woche', 'Day and week')}</h2>
        </div>

        <div className="inline-flex w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {[
            { key: 'day', label: text('Tag', 'Day') },
            { key: 'week', label: text('Woche', 'Week') },
          ].map((option) => {
            const isActive = mode === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(option.key as ReviewMode)}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  isActive ? 'bg-orange-400/12 text-orange-100 shadow-[0_0_0_1px_rgba(251,146,60,0.16)]' : 'text-white/60 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {mode === 'day' ? (
        <div className="mt-7 space-y-6">
          <WidePanel eyebrow={getDayTitle(daySummary, referenceDateKey, locale)} title={formatReviewCalendarDay(activeDateKey, locale)}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Trades" value={String(daySummary.totalTrades)} tone="text-white" />
              <MetricCard label={text('Belastbar', 'Ready for review')} value={`${daySummary.trustedTrades.length}/${daySummary.totalTrades || 0}`} tone="text-emerald-300" />
              <MetricCard label="P&L" value={daySummary.monetaryScope.isComparable ? formatCurrency(daySummary.trustedPnL, 0, daySummary.monetaryScope.currency, locale) : text('Gesperrt', 'Unavailable')} tone={daySummary.monetaryScope.isComparable && daySummary.trustedPnL >= 0 ? 'text-emerald-300' : daySummary.monetaryScope.isComparable && daySummary.trustedPnL < 0 ? 'text-red-300' : 'text-orange-100'} />
              <MetricCard label={text('Dominantes Setup', 'Most common setup')} value={daySummary.dominantSetup ?? '—'} tone="text-orange-100/90" />
            </div>
          </WidePanel>

          <WidePanel eyebrow={text('Fragen', 'Questions')} title={text('Heute', 'Today')}>
            <div className="space-y-3">
              {daySummary.prompts.slice(0, 3).map((prompt) => (
                <div key={prompt} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/72">
                  {prompt}
                </div>
              ))}
            </div>
          </WidePanel>

          <WidePanel eyebrow={text('Nächster Schritt', 'Next step')} title={text('Aktion', 'Actions')}>
            <div className="flex flex-wrap gap-3">
              <Link href={dayFocusHref} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                Trades
              </Link>
              <Link href="/kalender" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                {text('Kalender', 'Calendar')}
              </Link>
            </div>
          </WidePanel>
        </div>
      ) : (
        <div className="mt-7 space-y-6">
          <WidePanel eyebrow={text('Woche', 'Week')} title={weeklySnapshot.headline}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Trades" value={String(weeklySnapshot.sessionDraft.tradeCount)} tone="text-white" />
              <MetricCard label="P&L" value={weeklySnapshot.sessionDraft.monetaryScopeKind === 'single' ? formatCurrency(weeklySnapshot.sessionDraft.netPnL, 0, weeklySnapshot.sessionDraft.currency, locale) : text('Gesperrt', 'Unavailable')} tone={weeklySnapshot.sessionDraft.monetaryScopeKind === 'single' && weeklySnapshot.sessionDraft.netPnL >= 0 ? 'text-emerald-300' : weeklySnapshot.sessionDraft.monetaryScopeKind === 'single' && weeklySnapshot.sessionDraft.netPnL < 0 ? 'text-red-300' : 'text-orange-100'} />
              <MetricCard label={text('Trefferquote', 'Win rate')} value={`${formatPlainNumber(weeklySnapshot.sessionDraft.winRate, 0, locale)}%`} tone="text-orange-100/90" />
              <MetricCard label="Ø R" value={formatRMultiple(weeklySnapshot.sessionDraft.averageR, 2, locale)} tone={weeklySnapshot.sessionDraft.averageR === null ? 'text-white/55' : weeklySnapshot.sessionDraft.averageR >= 0 ? 'text-emerald-300' : 'text-red-300'} />
            </div>
          </WidePanel>

          <WidePanel eyebrow={text('Muster', 'Patterns')} title={text('Woche', 'Week')}>
            <div className="grid gap-3 xl:grid-cols-3">
              <SignalCard label={text('Läuft gerade', 'What worked')} title={strongestSignal?.value ?? text('Noch kein klares Stärke-Signal', 'No clear strength yet')} detail={strongestSignal?.detail ?? ''} tone="emerald" />
              <SignalCard label={text('Bremst gerade', 'What held you back')} title={warningSignal?.value ?? text('Noch kein klares Warnsignal', 'No clear warning yet')} detail={warningSignal?.detail ?? ''} tone="red" />
              <SignalCard label={text('Schritt', 'Next step')} title={nextFocus} detail={coachingBrief.summary} tone="orange" />
            </div>
          </WidePanel>

          <WidePanel eyebrow={text('Nächster Schritt', 'Next step')} title={text('Aktion', 'Actions')}>
            <div className="flex flex-wrap gap-3">
              <Link href="/trades" className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/40 hover:text-white">
                {text('Alle Trades öffnen', 'Open all trades')}
              </Link>
              <Link href="/review?periodPreset=7d" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                {text('Wochenreview', 'Weekly review')}
              </Link>
              <Link href="/review-sessions" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                {text('Review-Sammlung', 'Review collections')}
              </Link>
            </div>
          </WidePanel>
        </div>
      )}
    </section>
  )
}

function WidePanel({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string
  title: string
  copy?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-7">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{eyebrow}</p>
      <h3 className="mt-3 text-xl font-semibold text-white">{title}</h3>
      {copy ? <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{copy}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${tone}`}>{value}</p>
    </div>
  )
}

function SignalCard({
  label,
  title,
  detail,
  tone,
}: {
  label: string
  title: string
  detail: string
  tone: 'emerald' | 'red' | 'orange'
}) {
  const classes = tone === 'emerald'
    ? 'border-emerald-400/15 bg-emerald-400/5'
    : tone === 'red'
      ? 'border-red-400/15 bg-red-400/5'
      : 'border-orange-400/15 bg-orange-400/5'

  return (
    <div className={`rounded-2xl border p-4 ${classes}`}>
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">{label}</p>
      <p className="mt-3 text-base font-semibold text-white">{title}</p>
      {detail ? <p className="mt-2 text-sm leading-6 text-white/65">{detail}</p> : null}
    </div>
  )
}
