'use client'
import { getSavedReviewRState, getSavedReviewRValue, haveComparableReviewCalculations, isCurrentReviewCalculation, hasVerifiedReviewCalculation } from '@/lib/utils/review-snapshot-summary'

import Link from 'next/link'
import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { useEffect, useMemo, useState, useTransition, type ChangeEvent, type ReactNode } from 'react'
import {
  deleteReviewSession as persistDeleteReviewSession,
  updateReviewSession as persistUpdateReviewSession,
} from '@/app/actions/review-sessions'
import type {
  ReviewSessionPeriodPreset,
  ReviewSessionStatus,
  ReviewSessionType,
  ReviewSessionsPageResult,
  SavedReviewSession,
} from '@/lib/types/review-session'
import { formatCurrency, formatPlainNumber, formatRMultiple } from '@/lib/utils/calculations'
import { formatReviewSavedDate, formatReviewTimelineDay, getReviewPeriodOptionLabel } from '@/lib/utils/review-display'

type ReviewSessionsHubProps = {
  initialSessions: SavedReviewSession[]
  source: 'supabase' | 'mock'
  initialSearch?: string
  initialSessionType?: string
  initialPeriodPreset?: string
  initialStatusFilter?: string
  initialPinnedOnly?: boolean
  pagination?: ReviewSessionsPageResult
}

const REVIEW_SESSION_STORAGE_KEY = 'equora-review-sessions'

function normalizeSavedSession(session: SavedReviewSession): SavedReviewSession {
  return {
    ...session,
    ...getSavedReviewRState(session),
    labels: Array.isArray(session.labels) ? session.labels.filter(Boolean) : [],
    sessionStatus: session.sessionStatus ?? 'open',
    isPinned: Boolean(session.isPinned),
    currency: session.monetaryScopeKind === 'single' ? session.currency : null,
    monetaryScopeKind: session.monetaryScopeKind === 'single' && session.currency
      ? 'single'
      : session.monetaryScopeKind === 'empty' || session.monetaryScopeKind === 'mixed'
        ? session.monetaryScopeKind
        : 'unknown',
  }
}

function formatSessionPnL(session: SavedReviewSession, locale: JournalLocale) {
  const text = journalText(locale)
  return session.monetaryScopeKind === 'single' && session.currency
    ? formatCurrency(session.netPnL, 0, session.currency, locale)
    : text('Gesperrt', 'Unavailable')
}

function mergeSavedSessions(...groups: SavedReviewSession[][]) {
  const merged = new Map<string, SavedReviewSession>()
  groups.flat().forEach((session) => merged.set(session.id, normalizeSavedSession(session)))
  return Array.from(merged.values()).sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

function buildTradesHref(session: SavedReviewSession, source: 'supabase' | 'mock') {
  const params = new URLSearchParams()
  params.set('reviewFocus', session.title)
  if (session.focusDescription) params.set('reviewDescription', session.focusDescription)
  session.chips.forEach((chip) => chip && params.append('reviewChip', chip))

  if (source === 'supabase' && session.source === 'supabase') {
    params.set('reviewSession', session.id)
  } else if (session.tradeIds.length) {
    params.set('reviewTradeIds', session.tradeIds.join(','))
  }

  return `/trades?${params.toString()}`
}

function getTypeLabel(type: ReviewSessionType, locale: JournalLocale) {
  const text = journalText(locale)
  return type === 'review' ? 'Review' : text('Trade-Auswahl', 'Trade selection')
}

function getStatusLabel(status: ReviewSessionStatus, locale: JournalLocale) {
  const text = journalText(locale)
  if (status === 'watch') return text('Beobachten', 'Watching')
  if (status === 'closed') return text('Geschlossen', 'Closed')
  return text('Offen', 'Open')
}

function getPeriodLabel(period: ReviewSessionPeriodPreset | null, locale: JournalLocale) {
  return period ? getReviewPeriodOptionLabel(period, locale) : journalText(locale)('Freier Zeitraum', 'Custom period')
}

function getStatusClass(status: ReviewSessionStatus) {
  if (status === 'watch') return 'border-orange-400/20 bg-orange-400/10 text-orange-200'
  if (status === 'closed') return 'border-white/10 bg-white/5 text-white/70'
  return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
}

function parseLabels(value: string) {
  return Array.from(new Set(value.split(',').map((label) => label.trim()).filter(Boolean)))
}

export function ReviewSessionsHub({
  initialSessions,
  source,
  initialSearch = '',
  initialSessionType = 'all',
  initialPeriodPreset = 'all',
  initialStatusFilter = 'all',
  initialPinnedOnly = false,
  pagination,
}: ReviewSessionsHubProps) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const [sessions, setSessions] = useState<SavedReviewSession[]>(initialSessions)
  const [selectedSessionId, setSelectedSessionId] = useState<string | undefined>(initialSessions[0]?.id)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [search, setSearch] = useState(initialSearch)
  const [sessionTypeFilter, setSessionTypeFilter] = useState<'all' | ReviewSessionType>((initialSessionType === 'review' || initialSessionType === 'spotlight') ? initialSessionType : 'all')
  const [periodPresetFilter, setPeriodPresetFilter] = useState<'all' | ReviewSessionPeriodPreset>((['7d', '14d', '30d', '90d'].includes(initialPeriodPreset) ? initialPeriodPreset : 'all') as 'all' | ReviewSessionPeriodPreset)
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewSessionStatus>((['open', 'watch', 'closed'].includes(initialStatusFilter) ? initialStatusFilter : 'all') as 'all' | ReviewSessionStatus)
  const [pinnedOnly, setPinnedOnly] = useState(initialPinnedOnly)
  const [title, setTitle] = useState(initialSessions[0]?.title ?? '')
  const [note, setNote] = useState(initialSessions[0]?.note ?? '')
  const [labelsInput, setLabelsInput] = useState(initialSessions[0]?.labels?.join(', ') ?? '')
  const [sessionStatus, setSessionStatus] = useState<ReviewSessionStatus>(initialSessions[0]?.sessionStatus ?? 'open')
  const [isPinned, setIsPinned] = useState(Boolean(initialSessions[0]?.isPinned))
  const [status, setStatus] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setSessions((current) => (source === 'mock' ? mergeSavedSessions(current, initialSessions) : initialSessions))
  }, [initialSessions, source])

  useEffect(() => {
    if (source !== 'mock' || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(REVIEW_SESSION_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedReviewSession[]
      if (!Array.isArray(parsed)) return
      setSessions((current) => mergeSavedSessions(current, parsed))
    } catch {
      // ignore malformed local storage payloads
    }
  }, [source])

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sessions.filter((session) => {
      if (sessionTypeFilter !== 'all' && session.sessionType !== sessionTypeFilter) return false
      if (periodPresetFilter !== 'all' && session.periodPreset !== periodPresetFilter) return false
      if (statusFilter !== 'all' && session.sessionStatus !== statusFilter) return false
      if (pinnedOnly && !session.isPinned) return false
      if (!query) return true

      return [
        session.title,
        session.note,
        session.focusTitle ?? '',
        session.focusDescription ?? '',
        ...(session.topTags ?? []),
        ...(session.chips ?? []),
        ...(session.labels ?? []),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [periodPresetFilter, pinnedOnly, search, sessionTypeFilter, sessions, statusFilter])

  const pageSize = pagination?.pageSize ?? 24
  const currentPage = pagination?.page ?? 1
  const clientTotalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize))
  const effectivePage = source === 'mock' ? Math.min(currentPage, clientTotalPages) : currentPage
  const visibleSessions = useMemo(() => {
    if (source === 'mock') {
      const start = (effectivePage - 1) * pageSize
      return filteredSessions.slice(start, start + pageSize)
    }
    return filteredSessions
  }, [effectivePage, filteredSessions, pageSize, source])
  const totalPages = source === 'mock' ? clientTotalPages : (pagination?.totalPages ?? 1)
  const totalSessions = source === 'mock' ? filteredSessions.length : (pagination?.total ?? sessions.length)

  useEffect(() => {
    if (!visibleSessions.length) {
      setSelectedSessionId(undefined)
      return
    }
    if (!selectedSessionId || !visibleSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(visibleSessions[0].id)
    }
  }, [selectedSessionId, visibleSessions])

  const selectedSession = useMemo(
    () => visibleSessions.find((session) => session.id === selectedSessionId) ?? visibleSessions[0],
    [selectedSessionId, visibleSessions],
  )

  useEffect(() => {
    if (!selectedSession) return
    setTitle(selectedSession.title)
    setNote(selectedSession.note)
    setLabelsInput(selectedSession.labels.join(', '))
    setSessionStatus(selectedSession.sessionStatus)
    setIsPinned(selectedSession.isPinned)
  }, [selectedSession?.id])

  const compareSessions = useMemo(
    () => compareIds.map((id) => sessions.find((session) => session.id === id)).filter(Boolean) as SavedReviewSession[],
    [compareIds, sessions],
  )

  const comparison = useMemo(() => {
    if (compareSessions.length !== 2) return null
    const [left, right] = compareSessions
    const leftTags = new Set(left.topTags)
    const rightTags = new Set(right.topTags)
    const leftTradeIds = new Set(left.tradeIds)
    const rightTradeIds = new Set(right.tradeIds)
    const calculationsComparable = haveComparableReviewCalculations(left, right)
    const isMonetaryComparable = calculationsComparable && left.monetaryScopeKind === 'single'
      && right.monetaryScopeKind === 'single'
      && Boolean(left.currency)
      && left.currency === right.currency

    return {
      left,
      right,
      isMonetaryComparable,
      netPnLDelta: left.netPnL - right.netPnL,
      averageRDelta: calculationsComparable && left.averageR !== null && right.averageR !== null ? left.averageR - right.averageR : null,
      winRateDelta: calculationsComparable ? left.winRate - right.winRate : null,
      tradeCountDelta: left.tradeCount - right.tradeCount,
      sharedTags: left.topTags.filter((tag) => rightTags.has(tag)),
      uniqueLeftTags: left.topTags.filter((tag) => !rightTags.has(tag)),
      uniqueRightTags: right.topTags.filter((tag) => !leftTags.has(tag)),
      sharedTrades: left.tradeIds.filter((tradeId) => rightTradeIds.has(tradeId)),
      onlyLeftTrades: left.tradeIds.filter((tradeId) => !rightTradeIds.has(tradeId)).length,
      onlyRightTrades: right.tradeIds.filter((tradeId) => !leftTradeIds.has(tradeId)).length,
    }
  }, [compareSessions])

  const timelineEntries = useMemo(() => {
    return visibleSessions.slice(0, 8).map((session) => ({
      id: session.id,
      day: formatReviewTimelineDay(session.createdAt, locale),
      title: session.title,
      status: session.sessionStatus,
      pinned: session.isPinned,
      count: session.tradeCount,
      pnl: session.netPnL,
      currency: session.currency,
      monetaryScopeKind: session.monetaryScopeKind,
    }))
  }, [visibleSessions, locale])

  function persistMockSessions(nextSessions: SavedReviewSession[]) {
    const merged = mergeSavedSessions(nextSessions)
    setSessions(merged)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REVIEW_SESSION_STORAGE_KEY, JSON.stringify(merged))
    }
  }

  function toggleCompare(sessionId: string) {
    setCompareIds((current) => {
      if (current.includes(sessionId)) return current.filter((id) => id !== sessionId)
      if (current.length === 2) return [current[1], sessionId]
      return [...current, sessionId]
    })
  }

  function handleSaveMeta() {
    if (!selectedSession) return
    const trimmedTitle = title.trim()
    const labels = parseLabels(labelsInput)
    if (!trimmedTitle) {
      setStatus(text('Bitte einen Titel für die Session vergeben.', 'Enter a title for the review.'))
      return
    }

    if (source === 'mock') {
      const nextSessions = sessions.map((session) =>
        session.id === selectedSession.id
          ? { ...session, title: trimmedTitle, note: note.trim(), labels, sessionStatus, isPinned }
          : session,
      )
      persistMockSessions(nextSessions)
      setStatus(text(`Review „${trimmedTitle}“ lokal aktualisiert.`, `Local review “${trimmedTitle}” updated.`))
      return
    }

    startTransition(async () => {
      const result = await persistUpdateReviewSession(selectedSession.id, {
        title: trimmedTitle,
        note,
        labels,
        sessionStatus,
        isPinned,
      }, locale)
      setStatus(result.message)
      if (result.success && result.session) {
        setSessions((current) => mergeSavedSessions(current.map((session) => (session.id === result.session?.id ? result.session : session))))
      }
    })
  }

  function handleDelete() {
    if (!selectedSession) return
    const deletedId = selectedSession.id

    if (source === 'mock') {
      const nextSessions = sessions.filter((session) => session.id !== deletedId)
      persistMockSessions(nextSessions)
      setCompareIds((current) => current.filter((id) => id !== deletedId))
      setStatus(text('Review lokal gelöscht.', 'Local review deleted.'))
      return
    }

    startTransition(async () => {
      const result = await persistDeleteReviewSession(deletedId, locale)
      setStatus(result.message)
      if (result.success) {
        setSessions((current) => current.filter((session) => session.id !== deletedId))
        setCompareIds((current) => current.filter((id) => id !== deletedId))
      }
    })
  }

  function buildPageHref(page: number) {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (sessionTypeFilter !== 'all') params.set('type', sessionTypeFilter)
    if (periodPresetFilter !== 'all') params.set('periodPreset', periodPresetFilter)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (pinnedOnly) params.set('pinned', '1')
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/review-sessions?${query}` : '/review-sessions'
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="mt-2 text-2xl font-semibold text-orange-300">{text('Review-Sammlungen', 'Review collections')}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{text('Öffne gespeicherte Reviews, ergänze deine Notizen und vergleiche ausgewählte Sammlungen.', 'Open saved reviews, add notes and compare two collections.')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100/80">{text(`${visibleSessions.length} sichtbar · ${totalSessions} Treffer`, `${visibleSessions.length} shown · ${totalSessions} results`)}</span>
            <span className={`rounded-full px-3 py-1 text-xs ${source === 'supabase' ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-white/10 bg-white/5 text-white/70'}`}>{source === 'supabase' ? 'Live' : text('Lokal', 'Local')}</span>
          </div>
        </div>

        <details className="group mt-5 rounded-3xl border border-white/10 bg-black/25 p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="text-sm font-medium text-white">Filter</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65"><span className="group-open:hidden">{text('Öffnen', 'Show')}</span><span className="hidden group-open:inline">{text('Schließen', 'Hide')}</span></span>
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <FilterField label={text('Suche', 'Search')}>
              <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder={text('Titel und Stichwörter', 'Title and keywords')} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
            </FilterField>
            <FilterField label={text('Typ', 'Type')}>
              <select value={sessionTypeFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSessionTypeFilter(event.target.value as 'all' | ReviewSessionType)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                <option value="all">{text('Alle', 'All')}</option>
                <option value="spotlight">{text('Trade-Auswahl', 'Trade selection')}</option>
                <option value="review">Review</option>
              </select>
            </FilterField>
            <FilterField label={text('Zeitraum', 'Period')}>
              <select value={periodPresetFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPeriodPresetFilter(event.target.value as 'all' | ReviewSessionPeriodPreset)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                <option value="all">{text('Alle', 'All')}</option>
                <option value="7d">{text('7 Tage', '7 days')}</option>
                <option value="14d">{text('14 Tage', '14 days')}</option>
                <option value="30d">{text('30 Tage', '30 days')}</option>
                <option value="90d">{text('90 Tage', '90 days')}</option>
              </select>
            </FilterField>
            <FilterField label="Status">
              <select value={statusFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatusFilter(event.target.value as 'all' | ReviewSessionStatus)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                <option value="all">{text('Alle', 'All')}</option>
                <option value="open">{text('Offen', 'Open')}</option>
                <option value="watch">{text('Beobachten', 'Watching')}</option>
                <option value="closed">{text('Geschlossen', 'Closed')}</option>
              </select>
            </FilterField>
            <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Angeheftete Reviews', 'Pinned reviews')}</span>
              <button type="button" aria-pressed={pinnedOnly} onClick={() => setPinnedOnly((current) => !current)} className={`mt-2 flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm transition ${pinnedOnly ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-orange-400/15 bg-orange-400/5 text-white/70 hover:border-orange-300/30 hover:text-white'}`}>
                {pinnedOnly ? text('Nur angeheftete', 'Pinned only') : text('Alle Reviews', 'All reviews')}
              </button>
            </div>
          </div>
        </details>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{text('Review-Sammlungen', 'Review collections')}</h3>
              </div>
              <Link href="/trades" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Trades</Link>
            </div>
            <div className="mt-4 space-y-3">
              {visibleSessions.length ? visibleSessions.map((session) => {
                const isSelected = selectedSession?.id === session.id
                const isCompared = compareIds.includes(session.id)
                return (
                  <div key={session.id} className={`rounded-2xl border p-3 transition ${isSelected ? 'border-orange-300/35 bg-orange-400/10' : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.03]'}`}>
                    <button type="button" onClick={() => setSelectedSessionId(session.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {session.isPinned ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-200">{text('Angeheftet', 'Pinned')}</span> : null}
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${session.sessionType === 'review' ? 'border-orange-400/20 bg-orange-400/10 text-orange-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{getTypeLabel(session.sessionType, locale)}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusClass(session.sessionStatus)}`}>{getStatusLabel(session.sessionStatus, locale)}</span>
                            {session.periodPreset ? <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/60">{getPeriodLabel(session.periodPreset, locale)}</span> : null}
                          </div>
                          <p className="mt-2 break-words text-sm font-medium text-white">{session.title}</p>
                          <p className="mt-1 text-xs text-white/45">{session.periodLabel ?? formatReviewSavedDate(session.createdAt, locale)} · {session.tradeCount} Trades</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${session.monetaryScopeKind !== 'single' ? 'border border-orange-400/20 bg-orange-400/10 text-orange-100' : session.netPnL >= 0 ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/20 bg-red-400/10 text-red-200'}`}>{formatSessionPnL(session, locale)}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/55">{session.note || session.focusDescription || '—'}</p>
                      {session.labels.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {session.labels.slice(0, 4).map((label) => (
                            <span key={`${session.id}-${label}`} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-white/65">{label}</span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={buildTradesHref(session, source)} className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Trades</Link>
                      {session.sessionType === 'review' && session.periodPreset ? <Link href={`/review?periodPreset=${session.periodPreset}`} className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Review</Link> : null}
                      <button type="button" onClick={() => toggleCompare(session.id)} className={`rounded-full border px-3 py-1.5 text-xs transition ${isCompared ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-black/30 text-white/70 hover:border-white/20 hover:text-white'}`}>{isCompared ? text('Vergleich an', 'Selected to compare') : text('Vergleich', 'Compare')}</button>
                    </div>
                  </div>
                )
              }) : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">{text('Keine Reviews für diese Auswahl. Prüfe deine Filter oder speichere einen neuen Review.', 'No reviews match. Change the filters or save a new review.')}</div>}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
              <span>{text(`Seite ${Math.min(effectivePage, totalPages)} von ${totalPages}`, `Page ${Math.min(effectivePage, totalPages)} of ${totalPages}`)}</span>
              <div className="flex items-center gap-2">
                {effectivePage > 1 ? (
                  <Link href={buildPageHref(effectivePage - 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">{text('Zurück', 'Previous')}</Link>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/35">{text('Zurück', 'Previous')}</span>
                )}
                {effectivePage < totalPages ? (
                  <Link href={buildPageHref(effectivePage + 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">{text('Weiter', 'Next')}</Link>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/35">{text('Weiter', 'Next')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">{text('Verlauf', 'History')}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{text('Zuletzt', 'Recent')}</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{text(`${timelineEntries.length} ${timelineEntries.length === 1 ? 'Eintrag' : 'Einträge'}`, `${timelineEntries.length} ${timelineEntries.length === 1 ? 'entry' : 'entries'}`)}</span>
            </div>
            <div className="mt-4 space-y-3">
              {timelineEntries.length ? timelineEntries.map((entry) => (
                <button key={entry.id} type="button" onClick={() => setSelectedSessionId(entry.id)} className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.03]">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[11px] text-white/65">
                    <span>{entry.day.weekday}</span>
                    <span>{entry.day.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{entry.title}</p>
                      {entry.pinned ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">{text('Angeheftet', 'Pinned')}</span> : null}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusClass(entry.status)}`}>{getStatusLabel(entry.status, locale)}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/45">{entry.count} Trades · {entry.monetaryScopeKind === 'single' && entry.currency ? formatCurrency(entry.pnl, 0, entry.currency, locale) : text('Gesperrt', 'Unavailable')}</p>
                  </div>
                </button>
              )) : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">{text('Für diese Auswahl gibt es keine Verlaufseinträge.', 'No recent reviews match these filters.')}</div>}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <details open className="group rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-lg font-semibold text-white">{text('Detail', 'Details')}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65"><span className="group-open:hidden">{text('Öffnen', 'Show')}</span><span className="hidden group-open:inline">{text('Schließen', 'Hide')}</span></span>
            </summary>
            <div className="mt-4">
            {selectedSession ? (
              <>
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/40">{text('Detail', 'Details')}</p>
                    <h3 className="mt-2 break-words text-lg font-semibold text-white">{selectedSession.title}</h3>
                    <p className="mt-2 text-sm text-white/55">{selectedSession.focusDescription || '—'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={buildTradesHref(selectedSession, source)} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-300/35 hover:text-white">Trades</Link>
                    <button type="button" onClick={handleDelete} disabled={isPending} className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-60">{text('Löschen', 'Delete')}</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <FilterField label={text('Titel', 'Title')}>
                    <input value={title} onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                  </FilterField>
                  <FilterField label={text('Stichwörter', 'Keywords')}>
                    <input value={labelsInput} onChange={(event: ChangeEvent<HTMLInputElement>) => setLabelsInput(event.target.value)} placeholder={text('z. B. Wochenrückblick, FOMO', 'e.g. weekly review, FOMO')} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                  </FilterField>
                  <label className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Notiz', 'Note')}</span>
                    <textarea value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                  </label>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
                    <FilterField label={text('Reviewstatus', 'Review status')}>
                      <select value={sessionStatus} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSessionStatus(event.target.value as ReviewSessionStatus)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                        <option value="open">{text('Offen', 'Open')}</option>
                        <option value="watch">{text('Beobachten', 'Watching')}</option>
                        <option value="closed">{text('Geschlossen', 'Closed')}</option>
                      </select>
                    </FilterField>
                    <div className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{text('Oben in der Sammlung', 'At the top of the collection')}</span>
                      <button type="button" aria-pressed={isPinned} onClick={() => setIsPinned((current) => !current)} className={`mt-2 flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm transition ${isPinned ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-orange-400/15 bg-orange-400/5 text-white/70 hover:border-orange-300/30 hover:text-white'}`}>{isPinned ? text('Angeheftet', 'Pinned') : text('Anheften', 'Pin')}</button>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-white/55">{text('Der Reviewstatus beschreibt deine Nachbereitung, nicht den Abschluss der enthaltenen Trades.', 'This status tracks your review progress. Trades have their own status.')}</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleSaveMeta} disabled={isPending} className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">{text('Änderungen speichern', 'Save changes')}</button>
                  <span className="text-xs text-white/50">{status || text('Änderungen für diesen Review.', 'Edit the details of this review.')}</span>
                </div>

                <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
                  <MetricTile label={text('Typ', 'Type')} value={getTypeLabel(selectedSession.sessionType, locale)} tone="text-orange-200" />
                  <MetricTile label={text('Reviewstatus', 'Review status')} value={getStatusLabel(selectedSession.sessionStatus, locale)} tone="text-white" />
                  <MetricTile label={text('Zeitraum', 'Period')} value={getPeriodLabel(selectedSession.periodPreset, locale)} tone="text-white" />
                  <MetricTile label={text('Angeheftet', 'Pinned')} value={selectedSession.isPinned ? text('Ja', 'Yes') : text('Nein', 'No')} tone={selectedSession.isPinned ? 'text-emerald-300' : 'text-white/80'} />
                  <MetricTile label="P&L" value={formatSessionPnL(selectedSession, locale)} tone={selectedSession.monetaryScopeKind !== 'single' ? 'text-orange-100' : selectedSession.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Ø R" value={formatRMultiple(getSavedReviewRValue(selectedSession), 2, locale)} tone="text-white/80" />
                  <MetricTile label={text('Trefferquote', 'Win rate')} value={`${formatPlainNumber(selectedSession.winRate, 1, locale)}%`} tone={selectedSession.winRate >= 50 ? 'text-emerald-300' : 'text-orange-200'} />
                  <MetricTile label="Trades" value={String(selectedSession.tradeCount)} tone="text-white" />
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  {hasVerifiedReviewCalculation(selectedSession) && !isCurrentReviewCalculation(selectedSession) ? <p className="text-sm text-orange-100">{text('Früher gespeicherte Auswertung. Neue Reviews berücksichtigen nur abgeschlossene Trades; die bisherigen Werte bleiben erhalten.', 'This review uses an earlier calculation. New reviews include only closed trades.')}</p> : null}
                  <p className="text-sm text-white/65">{hasVerifiedReviewCalculation(selectedSession)
                    ? text(`${selectedSession.rCount} von ${selectedSession.tradeCount} Trades mit dokumentiertem R-Ergebnis.`, `R is recorded for ${selectedSession.rCount} of ${selectedSession.tradeCount} trades.`)
                    : text('Die Berechnungsgrundlage dieses Reviews ist nicht vollständig dokumentiert. Aktuelle Kennzahlenvergleiche sind deshalb nicht verfügbar.', 'The calculation behind this saved review is incomplete. Its metrics are unavailable for comparison.')}</p>
                  {!hasVerifiedReviewCalculation(selectedSession) && selectedSession.legacyAverageR !== null && selectedSession.legacyAverageR !== undefined
                    ? <p className="mt-2 text-xs text-white/50">{text(`Gespeicherter R-Wert: ${formatRMultiple(selectedSession.legacyAverageR, 2, locale)}. Dieser Wert wird nicht als aktuelles dokumentiertes Ergebnis eingeordnet.`, `Previously saved R: ${formatRMultiple(selectedSession.legacyAverageR, 2, locale)}. It is excluded from current verified results.`)}</p> : null}
                  <p className="mt-3 text-xs uppercase tracking-[0.22em] text-white/35">{text('Stichwörter', 'Keywords')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSession.labels.length ? selectedSession.labels.map((label) => <span key={`${selectedSession.id}-${label}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{label}</span>) : <span className="text-sm text-white/40">{text('Keine Stichwörter.', 'No keywords.')}</span>}
                  </div>
                </div>
              </>
            ) : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">{text('Wähle einen Review.', 'Select a review.')}</div>}
            </div>
          </details>

          <details className="group rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="text-lg font-semibold text-white">{text('Vergleich', 'Compare')}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{compareSessions.length}/2</span>
            </summary>
            <div className="mt-4">
            {comparison ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <CompareCard title={comparison.left.title} subtitle={`${getTypeLabel(comparison.left.sessionType, locale)} · ${getStatusLabel(comparison.left.sessionStatus, locale)}`} />
                  <CompareCard title={comparison.right.title} subtitle={`${getTypeLabel(comparison.right.sessionType, locale)} · ${getStatusLabel(comparison.right.sessionStatus, locale)}`} />
                </div>
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
                  <MetricTile label="Δ P&L" value={comparison.isMonetaryComparable ? formatCurrency(comparison.netPnLDelta, 0, comparison.left.currency, locale) : text('Gesperrt', 'Unavailable')} tone={!comparison.isMonetaryComparable ? 'text-orange-100' : comparison.netPnLDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Δ Ø R" value={formatRMultiple(comparison.averageRDelta, 2, locale)} tone={comparison.averageRDelta === null ? 'text-white/55' : comparison.averageRDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label={text('Δ Trefferquote', 'Change in win rate')} value={comparison.winRateDelta === null ? text('Nicht vergleichbar', 'Not comparable') : text(`${formatPlainNumber(comparison.winRateDelta, 1, locale)} Prozentpunkte`, `${formatPlainNumber(comparison.winRateDelta, 1, locale)} percentage points`)} tone={comparison.winRateDelta === null ? 'text-white/55' : comparison.winRateDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label={text('Δ Trades', 'Change in trade count')} value={String(comparison.tradeCountDelta)} tone={comparison.tradeCountDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <TagBucket title={text('Gemeinsame Tags', 'Shared tags')} items={comparison.sharedTags} emptyLabel={text('Keine Überschneidung', 'No shared tags')} />
                  <TagBucket title={text(`Nur ${comparison.left.title}`, `Only in ${comparison.left.title}`)} items={comparison.uniqueLeftTags} emptyLabel={text('Keine exklusiven Tags', 'No unique tags')} />
                  <TagBucket title={text(`Nur ${comparison.right.title}`, `Only in ${comparison.right.title}`)} items={comparison.uniqueRightTags} emptyLabel={text('Keine exklusiven Tags', 'No unique tags')} />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/65">Gemeinsame Trades: <span className="text-white">{comparison.sharedTrades.length}</span> · Nur links: <span className="text-white">{comparison.onlyLeftTrades}</span> · Nur rechts: <span className="text-white">{comparison.onlyRightTrades}</span></div>
              </div>
            ) : <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">{text('Wähle zwei Reviews für den Vergleich.', 'Select two reviews to compare.')}</div>}
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}

function FilterField({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <label className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</span>
      {children}
    </label>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className={`mt-3 break-words text-base font-semibold ${tone}`}>{value}</p>
    </div>
  )
}

function CompareCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-xs text-white/45">{subtitle}</p>
    </div>
  )
}

function TagBucket({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length ? items.map((item) => <span key={`${title}-${item}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{item}</span>) : <span className="text-sm text-white/40">{emptyLabel}</span>}
      </div>
    </div>
  )
}
