'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { getDateKeyFromDate, normalizeTradeDate } from '@/lib/utils/calendar'
import { resolveTradeOccurredAt } from '@/lib/utils/trade-time'
import { buildDailyNoteFlowSummary, getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import type { ReviewSnapshot } from '@/lib/utils/review'
import { buildReviewCoachingBrief } from '@/lib/utils/review-coaching'

function formatDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00`))
}

function getLatestActiveDateKey(trades: Trade[]) {
  const tradeKeys = trades.map((trade) => getDateKeyFromDate(normalizeTradeDate(resolveTradeOccurredAt(trade))))
  const uniqueKeys = Array.from(new Set(tradeKeys)).sort()
  return uniqueKeys.at(-1) ?? getBerlinTodayDateKey()
}


function getDayTitle(daySummary: ReturnType<typeof buildDailyNoteFlowSummary>) {
  if (daySummary.dateKey === getBerlinTodayDateKey()) return 'Heute'
  return 'Letzter aktiver Tag'
}

type ReviewMode = 'day' | 'week'

export function ReviewRhythmCard({
  trades,
  weeklySnapshot,
}: {
  trades: Trade[]
  weeklySnapshot: ReviewSnapshot
}) {
  const [mode, setMode] = useState<ReviewMode>('day')
  const activeDateKey = useMemo(() => getLatestActiveDateKey(trades), [trades])
  const daySummary = useMemo(() => buildDailyNoteFlowSummary(trades, [], activeDateKey), [activeDateKey, trades])
  const dayTradeIds = daySummary.dayTrades.map((trade) => trade.id).join(',')
  const dayFocusHref = dayTradeIds
    ? `/trades?reviewTradeIds=${encodeURIComponent(dayTradeIds)}&reviewFocus=${encodeURIComponent(`Tagesreview · ${activeDateKey}`)}`
    : '/trades'
  const coachingBrief = useMemo(() => buildReviewCoachingBrief(weeklySnapshot), [weeklySnapshot])
  const strongestSignal = weeklySnapshot.topPerformers[0]
  const warningSignal = weeklySnapshot.weakSpots[0] ?? weeklySnapshot.errorClusters[0]
  const nextFocus = coachingBrief.focus

  return (
    <section className="mb-0 rounded-3xl border border-orange-400/15 bg-black/25 p-6 shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Tag / Woche</h2>
        </div>

        <div className="inline-flex w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {[
            { key: 'day', label: 'Tag' },
            { key: 'week', label: 'Woche' },
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
          <WidePanel eyebrow={getDayTitle(daySummary)} title={formatDateLabel(activeDateKey)}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Trades" value={String(daySummary.totalTrades)} tone="text-white" />
              <MetricCard label="Belastbar" value={`${daySummary.trustedTrades.length}/${daySummary.totalTrades || 0}`} tone="text-emerald-300" />
              <MetricCard label="P&L" value={formatCurrency(daySummary.trustedPnL)} tone={daySummary.trustedPnL >= 0 ? 'text-emerald-300' : daySummary.trustedPnL < 0 ? 'text-red-300' : 'text-white'} />
              <MetricCard label="Dominantes Setup" value={daySummary.dominantSetup ?? '—'} tone="text-orange-100/90" />
            </div>
          </WidePanel>

          <WidePanel eyebrow="Fragen" title="Heute">
            <div className="space-y-3">
              {daySummary.prompts.slice(0, 3).map((prompt, index) => (
                <div key={prompt} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/72">
                  <span className="mr-3 text-xs uppercase tracking-[0.2em] text-white/35">0{index + 1}</span>
                  {prompt}
                </div>
              ))}
            </div>
          </WidePanel>

          <WidePanel eyebrow="Nächster Schritt" title="Aktion">
            <div className="flex flex-wrap gap-3">
              <Link href={dayFocusHref} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                Trades
              </Link>
              <Link href="/kalender" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                Kalender
              </Link>
            </div>
          </WidePanel>
        </div>
      ) : (
        <div className="mt-7 space-y-6">
          <WidePanel eyebrow="Woche" title={weeklySnapshot.headline}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Trades" value={String(weeklySnapshot.sessionDraft.tradeCount)} tone="text-white" />
              <MetricCard label="P&L" value={formatCurrency(weeklySnapshot.sessionDraft.netPnL)} tone={weeklySnapshot.sessionDraft.netPnL >= 0 ? 'text-emerald-300' : weeklySnapshot.sessionDraft.netPnL < 0 ? 'text-red-300' : 'text-white'} />
              <MetricCard label="Winrate" value={`${formatPlainNumber(weeklySnapshot.sessionDraft.winRate, 0)}%`} tone="text-orange-100/90" />
              <MetricCard label="Ø R" value={`${formatPlainNumber(weeklySnapshot.sessionDraft.averageR, 2)}R`} tone={weeklySnapshot.sessionDraft.averageR >= 0 ? 'text-emerald-300' : 'text-red-300'} />
            </div>
          </WidePanel>

          <WidePanel eyebrow="Muster" title="Woche">
            <div className="grid gap-3 xl:grid-cols-3">
              <SignalCard label="Läuft gerade" title={strongestSignal?.value ?? 'Noch kein klares Stärke-Signal'} detail={strongestSignal?.detail ?? ''} tone="emerald" />
              <SignalCard label="Bremst gerade" title={warningSignal?.value ?? 'Noch kein klares Warnsignal'} detail={warningSignal?.detail ?? ''} tone="red" />
              <SignalCard label="Schritt" title={nextFocus} detail={coachingBrief.summary} tone="orange" />
            </div>
          </WidePanel>

          <WidePanel eyebrow="Nächster Schritt" title="Aktion">
            <div className="flex flex-wrap gap-3">
              <Link href={`/trades?reviewFocus=${encodeURIComponent(nextFocus)}`} className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-400/40 hover:text-white">
                Trades öffnen
              </Link>
              <Link href={`/trades?reviewFocus=${encodeURIComponent('Wochenreview · Letzte 7 Tage')}`} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                Trades
              </Link>
              <Link href="/review-sessions" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white">
                Sessions
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
