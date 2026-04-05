'use client'

import Link from 'next/link'
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

const REVIEW_SESSION_STORAGE_KEY = 'equora-review-sessions'

function toneClasses(tone: 'emerald' | 'red' | 'orange') {
  if (tone === 'emerald') return 'border-emerald-400/15 bg-emerald-400/5 text-emerald-300'
  if (tone === 'red') return 'border-red-400/15 bg-red-400/5 text-red-300'
  return 'border-orange-400/15 bg-orange-400/5 text-orange-200'
}

function normalizeSavedSession(session: SavedReviewSession): SavedReviewSession {
  return {
    ...session,
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

function buildReviewTitle(snapshotLabel: string) {
  return `Review ${snapshotLabel} · ${new Date().toLocaleDateString('de-DE')}`
}

export function ReviewSummaryCard({
  snapshots,
  savedSessions = [],
  source,
  initialPreset = '7d',
}: {
  snapshots: ReviewSnapshotCollection
  savedSessions?: SavedReviewSession[]
  source: 'supabase' | 'mock'
  initialPreset?: ReviewPeriodPreset
}) {
  const [activePreset, setActivePreset] = useState<ReviewPeriodPreset>(initialPreset)
  const [sessionTitle, setSessionTitle] = useState(buildReviewTitle(getReviewPeriodPresetLabel(snapshots['7d'] ?? { periodPreset: '7d', periodPresetLabel: '7 Tage' })))
  const [sessionNote, setSessionNote] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [localSessions, setLocalSessions] = useState<SavedReviewSession[]>(savedSessions)
  const [isSaving, startSaving] = useTransition()
  const snapshot = useMemo(() => snapshots[activePreset] ?? snapshots['7d'], [activePreset, snapshots])
  const actionPlan = useMemo(() => buildReviewActionPlan(snapshot), [snapshot])
  const snapshotPresetLabel = getReviewPeriodPresetLabel(snapshot)

  useEffect(() => {
    setLocalSessions(savedSessions)
  }, [savedSessions])

  useEffect(() => {
    setActivePreset(initialPreset)
  }, [initialPreset])

  useEffect(() => {
    setSessionTitle(buildReviewTitle(snapshotPresetLabel))
  }, [snapshotPresetLabel])

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
      setSaveStatus('Im aktuellen Zeitraum liegen keine Trades zum Speichern.')
      return
    }

    startSaving(async () => {
      const result = await persistReviewSession({
        title: sessionTitle.trim() || buildReviewTitle(snapshotPresetLabel),
        note: sessionNote,
        focusTitle: actionPlan.headline,
        focusDescription: actionPlan.dailyFocusSuggestion,
        chips: [snapshotPresetLabel, snapshot.periodLabel, `Trades ${snapshot.sessionDraft.tradeCount}`, actionPlan.watchword],
        labels: ['Wochenreview', snapshotPresetLabel, snapshot.sourceLabel, 'Action Engine'],
        tradeIds: snapshot.sessionDraft.tradeIds,
        tradeCount: snapshot.sessionDraft.tradeCount,
        visibleTradeCount: snapshot.sessionDraft.visibleTradeCount,
        netPnL: snapshot.sessionDraft.netPnL,
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
      })

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
    <section className="space-y-6 rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="overflow-hidden rounded-3xl border border-orange-400/20 bg-black/40 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-white/40">{snapshot.sourceLabel}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-orange-300">{snapshot.headline}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{snapshot.summary}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Review-Zeitraum</p>
              <p className="mt-2 text-sm text-white">{snapshot.periodLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Vergleich</p>
              <p className="mt-2 text-sm text-white/75">{snapshot.previousPeriodLabel}</p>
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
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-orange-400/35 bg-orange-400/10 shadow-[0_0_0_1px_rgba(251,146,60,0.12)]'
                    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${isActive ? 'text-orange-200' : 'text-white/80'}`}>{option.label}</span>
                  {isActive ? <span className="rounded-full border border-orange-400/20 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-orange-200">aktiv</span> : null}
                </div>
                <p className="mt-1 text-xs text-white/45">{option.hint}</p>
              </button>
            )
          })}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {snapshot.stats.map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-white/38">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{item.value}</p>
              <p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs ${toneClasses(item.tone)}`}>{item.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-orange-400/15 bg-black/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/40">Review Capsule</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Aktuellen Snapshot als Review-Session sichern</h3>
            </div>
            <Link href={`/review-sessions?type=review&periodPreset=${snapshot.periodPreset}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
              Im Hub öffnen
            </Link>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.85fr]">
            <label className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Titel</span>
              <input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
            </label>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Snapshot</p>
              <p className="mt-2 text-sm text-white">{snapshotPresetLabel}</p>
              <p className="mt-2 text-xs text-white/55">{snapshot.periodLabel} · {snapshot.sessionDraft.tradeCount} Trades</p>
            </div>
          </div>
          <label className="mt-3 block rounded-2xl border border-white/10 bg-black/25 p-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Notiz</span>
            <textarea value={sessionNote} onChange={(event) => setSessionNote(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" placeholder="Was soll aus diesem Zeitraum konserviert werden?" />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleSaveReviewSession} disabled={isSaving || snapshot.sessionDraft.tradeCount === 0} className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
              {isSaving ? 'Speichert...' : 'Review-Session sichern'}
            </button>
            <span className="text-xs text-white/50">{saveStatus || 'Speichert Zeitraum, Kennzahlen und passende Trades für den Review-Hub.'}</span>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/40">Verknüpfte Reviews</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Gespeicherte Sessions für {snapshotPresetLabel}</h3>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">{relatedSessions.length} aktiv</span>
          </div>
          <div className="mt-4 space-y-3">
            {relatedSessions.length ? (
              relatedSessions.map((session) => (
                <div key={session.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{session.title}</p>
                      <p className="mt-1 text-xs text-white/45">{session.periodLabel ?? session.createdAt} · {session.tradeCount} Trades</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${session.netPnL >= 0 ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/20 bg-red-400/10 text-red-200'}`}>
                      {formatCurrency(session.netPnL)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/55">{session.note || session.focusDescription || 'Gespeicherter Review-Snapshot ohne Zusatznotiz.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/trades?reviewTradeIds=${session.tradeIds.join(',')}&reviewFocus=${encodeURIComponent(session.title)}`} className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
                      In Trades öffnen
                    </Link>
                    <Link href={`/review-sessions?type=review&periodPreset=${snapshot.periodPreset}`} className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
                      Im Hub ansehen
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">
                Für diesen Zeitraum liegt noch keine gespeicherte Review-Session vor. Mit dem Button links konservierst du den aktuellen Snapshot.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <TopPerformerCard items={snapshot.topPerformers} />
        <WeakSpotsCard items={snapshot.weakSpots} />
        <PatternFinderCard items={snapshot.patterns} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TagRadarCard items={snapshot.tagRadar} />
        <TagDriftCard items={snapshot.tagDrift} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TagHeatmapCard data={snapshot.tagHeatmap} />
        <TagCombinationsCard items={snapshot.tagCombinations} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReviewLayerBridgeCard snapshot={snapshot} />
        <ReviewActionEngineCard snapshot={snapshot} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-2 xl:grid-cols-2">
        <ErrorClustersCard items={snapshot.errorClusters} />

        <div className="rounded-3xl border border-white/10 bg-black/40 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Tagesnotizen im Review</h3>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">Kontext bleibt sichtbar</span>
          </div>

          <div className="space-y-3">
            {snapshot.noteMoments.length ? (
              snapshot.noteMoments.map((note) => (
                <div key={`${note.title}-${note.meta}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium text-white">{note.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/35">{note.meta}</p>
                  <p className="mt-3 text-sm leading-6 text-white/65">{note.body}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                Noch keine Tagesnotizen im aktuellen Review-Zeitraum. Sobald sie da sind, verknüpft Equora Zahlen und Tageskontext in einem Blick.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
