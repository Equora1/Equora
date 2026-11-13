'use client'
import { getSavedReviewRState } from '@/lib/utils/review-snapshot-summary'

import Link from 'next/link'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText } from '@/lib/i18n/journal'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { saveReviewSession as persistReviewSession } from '@/app/actions/review-sessions'
import { PatternFinderCard } from '@/components/analytics/pattern-finder-card'
import { TopPerformerCard } from '@/components/analytics/top-performer-card'
import { WeakSpotsCard } from '@/components/analytics/weak-spots-card'
import { ErrorClustersCard } from '@/components/review/error-clusters-card'
import { TagCombinationsCard } from '@/components/review/tag-combinations-card'
import { TagHeatmapCard } from '@/components/review/tag-heatmap-card'
import { TagDriftCard } from '@/components/review/tag-drift-card'
import { TagRadarCard } from '@/components/review/tag-radar-card'
import { ReviewActionEngineCard } from '@/components/review/review-action-engine-card'
import { ReviewLayerBridgeCard } from '@/components/review/review-layer-bridge-card'
import type { SavedReviewSession } from '@/lib/types/review-session'
import { formatCurrency } from '@/lib/utils/calculations'
import { getReviewPeriodPresetLabel, REVIEW_PERIOD_OPTIONS } from '@/lib/utils/review'
import { buildReviewActionPlan } from '@/lib/utils/review-to-action'
import type { ReviewPeriodPreset, ReviewSnapshotCollection } from '@/lib/utils/review'
import { buildReviewTitle, formatReviewSavedDate, getReviewPeriodOptionLabel } from '@/lib/utils/review-display'

const REVIEW_SESSION_STORAGE_KEY = 'equora-review-sessions'

type DeepSection = 'result' | 'pattern' | 'action'
type PerformanceView = 'top' | 'weak' | 'pattern'
type TagView = 'radar' | 'drift' | 'heatmap' | 'combos'
type ActionView = 'bridge' | 'engine' | 'errors'

function normalizeSavedSession(session: SavedReviewSession): SavedReviewSession {
  return {
    ...session,
    ...getSavedReviewRState(session),
    labels: Array.isArray(session.labels) ? session.labels.filter(Boolean) : [],
    sessionStatus: session.sessionStatus ?? 'open',
    isPinned: Boolean(session.isPinned),
  }
}

function mergeSavedSessions(...groups: SavedReviewSession[][]) {
  const merged = new Map<string, SavedReviewSession>()
  groups.flat().forEach((session) => merged.set(session.id, normalizeSavedSession(session)))
  return Array.from(merged.values()).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}

function toneClasses(tone: 'emerald' | 'red' | 'orange') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5 text-emerald-300'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5 text-red-300'
  return 'border-orange-400/15 bg-orange-400/5 text-orange-200'
}

function pickSignal(items: Array<{ value: string; detail: string }> | string[], fallbackTitle: string, fallbackDetail: string) {
  const first = items[0]

  if (typeof first === 'string') {
    return {
      title: first || fallbackTitle,
      detail: fallbackDetail,
    }
  }

  return {
    title: first?.value ?? fallbackTitle,
    detail: first?.detail ?? fallbackDetail,
  }
}

export function ReviewSummaryCard({
  snapshots,
  savedSessions = [],
  source,
  initialPreset = '7d',
  referenceDateKey,
}: {
  snapshots: ReviewSnapshotCollection
  savedSessions?: SavedReviewSession[]
  source: 'supabase' | 'mock'
  initialPreset?: ReviewPeriodPreset
  referenceDateKey: string
}) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [activePreset, setActivePreset] = useState<ReviewPeriodPreset>(initialPreset)
  const [activeDeepSection, setActiveDeepSection] = useState<DeepSection>('result')
  const [activePerformanceView, setActivePerformanceView] = useState<PerformanceView>('top')
  const [activeTagView, setActiveTagView] = useState<TagView>('radar')
  const [activeActionView, setActiveActionView] = useState<ActionView>('engine')
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [sessionNote, setSessionNote] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [localSessions, setLocalSessions] = useState<SavedReviewSession[]>(savedSessions)
  const [isSaving, startSaving] = useTransition()
  const snapshot = useMemo(() => snapshots[activePreset] ?? snapshots['7d'], [activePreset, snapshots])
  const actionPlan = useMemo(() => buildReviewActionPlan(snapshot, locale), [snapshot, locale])
  const snapshotPresetLabel = getReviewPeriodPresetLabel(snapshot)
  const suggestedTitle = buildReviewTitle(getReviewPeriodOptionLabel(snapshot.periodPreset, locale), referenceDateKey, locale)
  const bestSignal = pickSignal(snapshot.topPerformers, text('Noch kein klares Stärke-Signal', 'No clear strength yet'), text('Sobald genug Material da ist, markiert Equora hier den verlässlichsten Wiederholer.', 'Recurring strengths will appear here as you add trades.'))
  const warningSignal = pickSignal(snapshot.weakSpots, text('Noch kein Warnsignal', 'No warning signs yet'), '')
  const repeatSignal = pickSignal(snapshot.patterns, text('Noch kein klares Wiederholungsmuster', 'No recurring pattern yet'), text('Sobald sich Verhalten öfter zeigt, verdichtet Equora es hier zu einem lesbaren Signal.', 'Repeated behaviour will appear here as patterns emerge.'))
  const warningLabel = snapshot.weakSpots.length ? text('Bremst', 'Needs attention') : text('Stabil', 'Stable')
  const warningTone = snapshot.weakSpots.length ? 'red' : 'emerald'

  const deepSectionMeta: Record<DeepSection, { eyebrow: string; title: string; copy: string }> = {
    result: {
      eyebrow: 'P&L',
      title: 'P&L',
      copy: '',
    },
    pattern: {
      eyebrow: text('Muster', 'Patterns'),
      title: text('Muster', 'Patterns'),
      copy: '',
    },
    action: {
      eyebrow: text('Aktion', 'Actions'),
      title: text('Nächster Schritt', 'Next step'),
      copy: '',
    },
  }
  const activeDeepMeta = deepSectionMeta[activeDeepSection]

  useEffect(() => {
    setLocalSessions(savedSessions)
  }, [savedSessions])

  useEffect(() => {
    setActivePreset(initialPreset)
  }, [initialPreset])

  useEffect(() => {
    setSessionTitle(null)
  }, [activePreset, referenceDateKey])

  useEffect(() => {
    if (source !== 'mock' || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(REVIEW_SESSION_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedReviewSession[]
      if (!Array.isArray(parsed)) return
      setLocalSessions((current) => mergeSavedSessions(current, parsed))
    } catch {
      // ignore malformed payloads
    }
  }, [source])

  const relatedSessions = useMemo(() => {
    return localSessions
      .filter((session) => session.sessionType === 'review' && session.periodPreset === activePreset)
      .slice(0, 4)
  }, [activePreset, localSessions])

  function persistMockSession(session: SavedReviewSession) {
    const nextSessions = mergeSavedSessions([session], localSessions)
    setLocalSessions(nextSessions)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REVIEW_SESSION_STORAGE_KEY, JSON.stringify(nextSessions))
    }
  }

  function handleSaveReviewSession() {
    if (!snapshot.sessionDraft.tradeIds.length) {
      setSaveStatus(text('Im aktuellen Zeitraum liegen keine Trades zum Speichern.', 'There are no trades to save for this period.'))
      return
    }

    startSaving(async () => {
      const result = await persistReviewSession({
        title: sessionTitle?.trim() || suggestedTitle,
        note: sessionNote,
        focusTitle: actionPlan.headline,
        focusDescription: actionPlan.dailyFocusSuggestion,
        chips: [snapshotPresetLabel, snapshot.periodLabel, `Trades ${snapshot.sessionDraft.tradeCount}`, actionPlan.watchword],
        labels: ['Review', snapshotPresetLabel, snapshot.sourceLabel, 'Plan'],
        tradeIds: snapshot.sessionDraft.tradeIds,
        tradeCount: snapshot.sessionDraft.tradeCount,
        visibleTradeCount: snapshot.sessionDraft.visibleTradeCount,
        netPnL: snapshot.sessionDraft.netPnL,
        currency: snapshot.sessionDraft.currency,
        monetaryScopeKind: snapshot.sessionDraft.monetaryScopeKind,
        averageR: snapshot.sessionDraft.averageR,
        winRate: snapshot.sessionDraft.winRate,
        winners: snapshot.sessionDraft.winners,
        losers: snapshot.sessionDraft.losers,
        breakeven: snapshot.sessionDraft.breakeven,
        topTags: snapshot.sessionDraft.topTags,
        bestTradeId: snapshot.sessionDraft.bestTradeId,
        worstTradeId: snapshot.sessionDraft.worstTradeId,
        sessionType: 'review',
        periodPreset: snapshot.periodPreset,
        periodLabel: snapshot.periodLabel,
        periodStart: snapshot.periodStart,
        periodEnd: snapshot.periodEnd,
      }, locale)

      setSaveStatus(result.message)

      if (result.success && result.session) {
        const session = result.session
        if (source === 'mock') {
          persistMockSession(session)
        } else {
          setLocalSessions((current) => mergeSavedSessions([session], current))
        }
      }
    })
  }

  return (
    <section className="space-y-7 rounded-[32px] border border-orange-400/15 bg-white/5 p-6 shadow-2xl xl:p-7">
      <div className="overflow-hidden rounded-[28px] border border-orange-400/20 bg-black/40 p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.32em] text-white/40">{source === 'supabase' ? text('Live-Review', 'Live review') : text('Demo-Review', 'Demo review')}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-orange-300">{text('Review lesen', 'Review overview')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{snapshot.headline}</p>
            
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[320px]">
            <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Zeitraum', 'Period')}</p>
              <p className="mt-2 text-sm text-white">{snapshot.displayPeriod?.current ?? snapshot.periodLabel}</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Vorperiode', 'Previous period')}</p>
              <p className="mt-2 text-sm text-white/75">{snapshot.displayPeriod?.previous ?? snapshot.previousPeriodLabel}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {REVIEW_PERIOD_OPTIONS.map((option) => {
            const isActive = option.key === activePreset
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setActivePreset(option.key)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  isActive
                    ? 'border-orange-400/35 bg-orange-400/10 text-orange-200 shadow-[0_0_0_1px_rgba(251,146,60,0.12)]'
                    : 'border-white/10 bg-white/5 text-white/75 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                {getReviewPeriodOptionLabel(option.key, locale)}
              </button>
            )
          })}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {snapshot.stats.slice(0, 3).map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{item.value}</p>
              <p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs ${toneClasses(item.tone)}`}>{item.hint}</p>
              {item.basis ? <p className="mt-2 text-xs leading-5 text-white/60">{item.basis}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <summary className="cursor-pointer text-sm font-medium text-white">{text('Empfehlungen und Muster', 'Recommendations and patterns')}</summary>
        <div className="mt-5 space-y-5">
          <section className="grid gap-4 xl:grid-cols-3">
            <SignalTile label={text('Was lief', 'What worked')} title={bestSignal.title} detail={bestSignal.detail} tone="emerald" />
            <SignalTile label={text('Was bremst', 'What held you back')} title={warningSignal.title} detail={warningSignal.detail} tone={warningTone} />
            <SignalTile label={text('Nächster Schritt', 'Next step')} title={actionPlan.dailyFocusSuggestion} detail={repeatSignal.detail} tone="orange" />
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/30 p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Heute / Woche / Verhalten', 'Today, this week and behaviour')}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <BulletCard title={text('Heute', 'Today')} body={actionPlan.checklist[0] ?? `P&L: ${snapshot.sessionDraft.monetaryScopeKind === 'single' ? formatCurrency(snapshot.sessionDraft.netPnL, 0, snapshot.sessionDraft.currency, locale) : text('Gesperrt', 'Unavailable')}`} />
              <BulletCard title={text('Woche', 'Week')} body={actionPlan.checklist[1] ?? warningSignal.title} />
              <BulletCard title={text('Verhalten', 'Behaviour')} body={actionPlan.checklist[2] ?? actionPlan.dailyFocusSuggestion} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <InsightGroup title={text('Setup-Ergebnisse', 'Setup results')} items={snapshot.setupInsights} />
            <InsightGroup title={text('Daten aus Importen', 'Imported trades')} items={snapshot.importInsights} />
          </section>

        </div>
      </details>

      <details className="group/session rounded-3xl border border-white/10 bg-black/25 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Review</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{text('Review sichern', 'Save review')}</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/55 transition group-open/session:border-orange-400/20 group-open/session:text-orange-100"><span className="group-open/session:hidden">{text('Anzeigen', 'Show')}</span><span className="hidden group-open/session:inline">{text('Ausblenden', 'Hide')}</span></span>
        </summary>

        <div className="mt-5 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-orange-400/15 bg-black/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">{text('Speichern', 'Save')}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{text('Review sichern', 'Save review')}</h3>
              </div>
              <Link href={`/review-sessions?type=review&periodPreset=${snapshot.periodPreset}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
              {text('Review-Sammlung', 'Review collections')}
              </Link>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Titel', 'Title')}</span>
                <input value={sessionTitle ?? suggestedTitle} onChange={(event) => setSessionTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
              </label>
              <label className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Notiz', 'Note')}</span>
                <textarea value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder={text('Ein Satz reicht.', 'One sentence is enough.')} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleSaveReviewSession} disabled={isSaving || snapshot.sessionDraft.tradeCount === 0} className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isSaving ? text('Speichert...', 'Saving…') : text('Speichern', 'Save')}
              </button>
              {saveStatus ? <span className="text-xs text-white/50">{saveStatus}</span> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">{text('Gespeicherte Reviews', 'Saved reviews')}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{text('Archiv', 'Archive')}</h3>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">{text(`${relatedSessions.length} aktiv`, `${relatedSessions.length} saved`)}</span>
            </div>
            <div className="mt-4 space-y-3">
              {relatedSessions.length ? (
                relatedSessions.map((session) => (
                  <div key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{session.title}</p>
                        <p className="mt-1 text-xs text-white/45">{session.periodLabel ?? formatReviewSavedDate(session.createdAt, locale)} · {session.tradeCount} Trades</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] ${session.monetaryScopeKind !== 'single' ? 'border border-orange-400/20 bg-orange-400/10 text-orange-100' : session.netPnL >= 0 ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/20 bg-red-400/10 text-red-200'}`}>
                        {session.monetaryScopeKind === 'single' && session.currency ? formatCurrency(session.netPnL, 0, session.currency, locale) : text('Gesperrt', 'Unavailable')}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/55">{session.note || session.focusDescription || text('Ohne Notiz.', 'No note.')}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">
                  Noch nichts gespeichert.
                </div>
              )}
            </div>
          </div>
        </div>
      </details>

      <details className="group/analysis rounded-3xl border border-white/10 bg-black/25 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{text('Analyse', 'Analysis')}</p>
            <h2 className="mt-2 text-xl font-semibold text-white">{text('Tiefer prüfen', 'Explore the analysis')}</h2>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/55 transition group-open/analysis:border-orange-400/20 group-open/analysis:text-orange-100"><span className="group-open/analysis:hidden">{text('Anzeigen', 'Show')}</span><span className="hidden group-open/analysis:inline">{text('Ausblenden', 'Hide')}</span></span>
        </summary>

        <div className="mt-5 space-y-5">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              { key: 'result' as const, label: 'P&L' },
              { key: 'pattern' as const, label: text('Muster', 'Patterns') },
              { key: 'action' as const, label: text('Aktion', 'Actions') },
            ].map((option) => {
              const isActive = option.key === activeDeepSection
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActiveDeepSection(option.key)}
                  className={`rounded-3xl border p-4 text-left transition ${
                    isActive
                      ? 'border-orange-400/30 bg-orange-400/10 text-orange-100 shadow-[0_0_0_1px_rgba(251,146,60,0.12)]'
                      : 'border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <p className="mt-3 text-base font-semibold">{option.label}</p>
                </button>
              )
            })}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{activeDeepMeta.eyebrow}</p>
            <h3 className="mt-3 text-xl font-semibold text-white">{activeDeepMeta.title}</h3>
            {activeDeepMeta.copy ? <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{activeDeepMeta.copy}</p> : null}

            {activeDeepSection === 'result' ? (
              <div className="mt-7 space-y-5">
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: 'top' as const, label: text('Läuft', 'What worked') },
                    { key: 'weak' as const, label: text('Bremst', 'Needs attention') },
                    { key: 'pattern' as const, label: text('Muster', 'Patterns') },
                  ].map((option) => {
                    const isActive = option.key === activePerformanceView
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setActivePerformanceView(option.key)}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          isActive
                            ? 'border-orange-400/35 bg-orange-400/10 text-orange-100'
                            : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>

                {activePerformanceView === 'top' ? <TopPerformerCard items={snapshot.topPerformers} locale={locale} /> : null}
                {activePerformanceView === 'weak' ? <WeakSpotsCard items={snapshot.weakSpots} locale={locale} /> : null}
                {activePerformanceView === 'pattern' ? <PatternFinderCard items={snapshot.patterns} locale={locale} /> : null}
              </div>
            ) : null}

            {activeDeepSection === 'pattern' ? (
              <div className="mt-7 space-y-5">
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: 'radar' as const, label: 'Radar' },
                    { key: 'drift' as const, label: 'Drift' },
                    { key: 'heatmap' as const, label: 'Heatmap' },
                    { key: 'combos' as const, label: text('Kombos', 'Combinations') },
                  ].map((option) => {
                    const isActive = option.key === activeTagView
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setActiveTagView(option.key)}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          isActive
                            ? 'border-orange-400/35 bg-orange-400/10 text-orange-100'
                            : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>

                {activeTagView === 'radar' ? <TagRadarCard items={snapshot.tagRadar} locale={locale} /> : null}
                {activeTagView === 'drift' ? <TagDriftCard items={snapshot.tagDrift} locale={locale} /> : null}
                {activeTagView === 'heatmap' ? <TagHeatmapCard data={snapshot.tagHeatmap} locale={locale} /> : null}
                {activeTagView === 'combos' ? <TagCombinationsCard items={snapshot.tagCombinations} locale={locale} /> : null}
              </div>
            ) : null}

            {activeDeepSection === 'action' ? (
              <div className="mt-7 space-y-5">
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: 'engine' as const, label: text('Nächster Schritt', 'Next step') },
                    { key: 'bridge' as const, label: text('Verlauf', 'History') },
                    { key: 'errors' as const, label: text('Fehler', 'Mistakes') },
                  ].map((option) => {
                    const isActive = option.key === activeActionView
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setActiveActionView(option.key)}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          isActive
                            ? 'border-orange-400/35 bg-orange-400/10 text-orange-100'
                            : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>

                {activeActionView === 'bridge' ? <ReviewLayerBridgeCard snapshot={snapshot} locale={locale} /> : null}
                {activeActionView === 'engine' ? <ReviewActionEngineCard snapshot={snapshot} locale={locale} /> : null}
                {activeActionView === 'errors' ? <ErrorClustersCard items={snapshot.errorClusters} locale={locale} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  )
}

function SignalTile({
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
    <section className={`rounded-3xl border p-5 ${classes}`}>
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">{label}</p>
      <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/65">{detail}</p>
    </section>
  )
}


function InsightGroup({
  title,
  items,
}: {
  title: string
  items: Array<{ label: string; value: string; detail: string; tone: 'emerald' | 'red' | 'orange'; href?: string }>
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{title}</p>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <InsightRow key={`${title}-${item.label}-${item.value}`} item={item} />
        ))}
      </div>
    </section>
  )
}

function InsightRow({
  item,
}: {
  item: { label: string; value: string; detail: string; tone: 'emerald' | 'red' | 'orange'; href?: string }
}) {
  const text = journalText(useJournalLocale())
  const content = (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{item.label}</p>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] ${toneClasses(item.tone)}`}>{item.tone === 'emerald' ? text('Trägt', 'Working') : item.tone === 'red' ? text('Prüfen', 'Review') : text('Offen', 'Open')}</span>
      </div>
      <p className="mt-3 text-base font-semibold text-white">{item.value}</p>
      <p className="mt-2 text-sm leading-6 text-white/60">{item.detail}</p>
    </div>
  )

  return item.href ? <Link href={item.href}>{content}</Link> : content
}

function BulletCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{title}</p>
      <p className="mt-3 text-sm leading-6 text-white/68">{body}</p>
    </div>
  )
}
