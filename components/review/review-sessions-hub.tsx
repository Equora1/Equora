'use client'

import Link from 'next/link'
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
    labels: Array.isArray(session.labels) ? session.labels.filter(Boolean) : [],
    sessionStatus: session.sessionStatus ?? 'open',
    isPinned: Boolean(session.isPinned),
  }
}

function mergeSavedSessions(...groups: SavedReviewSession[][]) {
  const merged = new Map<string, SavedReviewSession>()
  groups.flat().forEach((session) => merged.set(session.id, normalizeSavedSession(session)))
  return Array.from(merged.values()).sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

function formatSavedSessionDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatSavedSessionDay(value: string) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(value))
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

function getTypeLabel(type: ReviewSessionType) {
  return type === 'review' ? 'Review' : 'Spotlight'
}

function getStatusLabel(status: ReviewSessionStatus) {
  if (status === 'watch') return 'Beobachten'
  if (status === 'closed') return 'Geschlossen'
  return 'Offen'
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

    return {
      left,
      right,
      netPnLDelta: left.netPnL - right.netPnL,
      averageRDelta: left.averageR - right.averageR,
      winRateDelta: left.winRate - right.winRate,
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
      day: formatSavedSessionDay(session.createdAt),
      title: session.title,
      status: session.sessionStatus,
      pinned: session.isPinned,
      count: session.tradeCount,
      pnl: session.netPnL,
    }))
  }, [visibleSessions])

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
      setStatus('Bitte einen Titel für die Session vergeben.')
      return
    }

    if (source === 'mock') {
      const nextSessions = sessions.map((session) =>
        session.id === selectedSession.id
          ? { ...session, title: trimmedTitle, note: note.trim(), labels, sessionStatus, isPinned }
          : session,
      )
      persistMockSessions(nextSessions)
      setStatus(`Mini-Review „${trimmedTitle}“ lokal aktualisiert.`)
      return
    }

    startTransition(async () => {
      const result = await persistUpdateReviewSession(selectedSession.id, {
        title: trimmedTitle,
        note,
        labels,
        sessionStatus,
        isPinned,
      })
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
      setStatus('Mini-Review lokal gelöscht.')
      return
    }

    startTransition(async () => {
      const result = await persistDeleteReviewSession(deletedId)
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
            <p className="text-xs uppercase tracking-[0.25em] text-white/45">Review Hub</p>
            <h2 className="mt-2 text-2xl font-semibold text-orange-300">Sessions wie echte Wochen-Workflows behandeln</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/60">V33 härtet den Review Hub: Filter bleiben klarer, das Archiv kann paginiert werden und Sessions fühlen sich weniger nach Schublade, mehr nach Arbeitsfläche an.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-xs text-orange-100/80">{visibleSessions.length} sichtbar · {totalSessions} im Archiv</span>
            <span className={`rounded-full px-3 py-1 text-xs ${source === 'supabase' ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-white/10 bg-white/5 text-white/70'}`}>{source === 'supabase' ? 'Live-Archiv' : 'Lokales Archiv'}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.55fr]">
          <FilterField label="Suche">
            <input value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Titel, Tags, Labels, Notiz..." className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
          </FilterField>
          <FilterField label="Typ">
            <select value={sessionTypeFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSessionTypeFilter(event.target.value as 'all' | ReviewSessionType)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
              <option value="all">Alle</option>
              <option value="spotlight">Spotlight</option>
              <option value="review">Review</option>
            </select>
          </FilterField>
          <FilterField label="Zeitraum">
            <select value={periodPresetFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPeriodPresetFilter(event.target.value as 'all' | ReviewSessionPeriodPreset)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
              <option value="all">Alle</option>
              <option value="7d">7 Tage</option>
              <option value="14d">14 Tage</option>
              <option value="30d">30 Tage</option>
              <option value="90d">90 Tage</option>
            </select>
          </FilterField>
          <FilterField label="Status">
            <select value={statusFilter} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatusFilter(event.target.value as 'all' | ReviewSessionStatus)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
              <option value="all">Alle</option>
              <option value="open">Offen</option>
              <option value="watch">Beobachten</option>
              <option value="closed">Geschlossen</option>
            </select>
          </FilterField>
          <label className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70">
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Pinning</span>
            <button type="button" onClick={() => setPinnedOnly((current) => !current)} className={`mt-2 flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm transition ${pinnedOnly ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-orange-400/15 bg-orange-400/5 text-white/70 hover:border-orange-300/30 hover:text-white'}`}>
              {pinnedOnly ? 'Nur angepinnte' : 'Alle Sessions'}
            </button>
          </label>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Archivliste</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Deine Sessions</h3>
              </div>
              <Link href="/trades" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Neue Session bauen</Link>
            </div>
            <div className="mt-4 space-y-3">
              {visibleSessions.length ? visibleSessions.map((session) => {
                const isSelected = selectedSession?.id === session.id
                const isCompared = compareIds.includes(session.id)
                return (
                  <div key={session.id} className={`rounded-2xl border p-3 transition ${isSelected ? 'border-orange-300/35 bg-orange-400/10' : 'border-white/10 bg-black/30 hover:border-white/20 hover:bg-white/[0.03]'}`}>
                    <button type="button" onClick={() => setSelectedSessionId(session.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {session.isPinned ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-emerald-200">Pinned</span> : null}
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${session.sessionType === 'review' ? 'border-orange-400/20 bg-orange-400/10 text-orange-200' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'}`}>{getTypeLabel(session.sessionType)}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusClass(session.sessionStatus)}`}>{getStatusLabel(session.sessionStatus)}</span>
                            {session.periodPreset ? <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-white/60">{session.periodPreset}</span> : null}
                          </div>
                          <p className="mt-2 text-sm font-medium text-white">{session.title}</p>
                          <p className="mt-1 text-xs text-white/45">{session.periodLabel ?? formatSavedSessionDate(session.createdAt)} · {session.tradeCount} Trades</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${session.netPnL >= 0 ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-red-400/20 bg-red-400/10 text-red-200'}`}>{formatCurrency(session.netPnL)}</span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/55">{session.note || session.focusDescription || 'Gespeicherter Spotlight-Schnitt ohne Zusatznotiz.'}</p>
                      {session.labels.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {session.labels.slice(0, 4).map((label) => (
                            <span key={`${session.id}-${label}`} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-white/65">{label}</span>
                          ))}
                        </div>
                      ) : null}
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={buildTradesHref(session, source)} className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">In Trades öffnen</Link>
                      {session.sessionType === 'review' && session.periodPreset ? <Link href={`/review?periodPreset=${session.periodPreset}`} className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Review öffnen</Link> : null}
                      <button type="button" onClick={() => toggleCompare(session.id)} className={`rounded-full border px-3 py-1.5 text-xs transition ${isCompared ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-black/30 text-white/70 hover:border-white/20 hover:text-white'}`}>{isCompared ? 'Vergleich aktiv' : 'Vergleichen'}</button>
                    </div>
                  </div>
                )
              }) : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Keine Sessions für diese Filter. Probiere einen anderen Typ oder Zeitraum.</div>}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-white/60">
              <span>Seite {Math.min(effectivePage, totalPages)} von {totalPages}</span>
              <div className="flex items-center gap-2">
                {effectivePage > 1 ? (
                  <Link href={buildPageHref(effectivePage - 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Zurück</Link>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/35">Zurück</span>
                )}
                {effectivePage < totalPages ? (
                  <Link href={buildPageHref(effectivePage + 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white">Weiter</Link>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/35">Weiter</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Timeline</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Jüngste Wochen- und Spotlight-Wellen</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{timelineEntries.length} Einträge</span>
            </div>
            <div className="mt-4 space-y-3">
              {timelineEntries.length ? timelineEntries.map((entry) => (
                <button key={entry.id} type="button" onClick={() => setSelectedSessionId(entry.id)} className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.03]">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[11px] text-white/65">
                    <span>{entry.day.split(',')[0]}</span>
                    <span>{entry.day.split(',')[1] ?? ''}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{entry.title}</p>
                      {entry.pinned ? <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">Pinned</span> : null}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${getStatusClass(entry.status)}`}>{getStatusLabel(entry.status)}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/45">{entry.count} Trades · {formatCurrency(entry.pnl)}</p>
                  </div>
                </button>
              )) : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Noch keine Timeline-Einträge im aktuellen Filterraum.</div>}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
            {selectedSession ? (
              <>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-white/40">Session Detail</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{selectedSession.title}</h3>
                    <p className="mt-2 text-sm text-white/55">{selectedSession.focusDescription || 'Gespeicherte Spotlight-Session mit Kennzahlen, Top-Tags und Trading-Fokus.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={buildTradesHref(selectedSession, source)} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 transition hover:border-emerald-300/35 hover:text-white">In Trades öffnen</Link>
                    <button type="button" onClick={handleDelete} disabled={isPending} className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs text-red-200 transition hover:border-red-300/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-60">Session löschen</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <FilterField label="Titel">
                    <input value={title} onChange={(event: ChangeEvent<HTMLInputElement>) => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                  </FilterField>
                  <FilterField label="Labels (kommagetrennt)">
                    <input value={labelsInput} onChange={(event: ChangeEvent<HTMLInputElement>) => setLabelsInput(event.target.value)} placeholder="z. B. Weekly, FOMO, Fokus" className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                  </FilterField>
                  <label className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Notiz</span>
                    <textarea value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FilterField label="Status">
                      <select value={sessionStatus} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSessionStatus(event.target.value as ReviewSessionStatus)} className="mt-2 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
                        <option value="open">Offen</option>
                        <option value="watch">Beobachten</option>
                        <option value="closed">Geschlossen</option>
                      </select>
                    </FilterField>
                    <label className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm text-white/70">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">Pinning</span>
                      <button type="button" onClick={() => setIsPinned((current) => !current)} className={`mt-2 flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm transition ${isPinned ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-100' : 'border-orange-400/15 bg-orange-400/5 text-white/70 hover:border-orange-300/30 hover:text-white'}`}>{isPinned ? 'Session angepinnt' : 'Session anpinnen'}</button>
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={handleSaveMeta} disabled={isPending} className="rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm text-orange-100 transition hover:border-orange-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Änderungen speichern</button>
                  <span className="text-xs text-white/50">{status || 'Titel, Notiz, Status, Labels und Pinning lassen sich direkt im Hub pflegen.'}</span>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricTile label="Typ" value={getTypeLabel(selectedSession.sessionType)} tone="text-orange-200" />
                  <MetricTile label="Status" value={getStatusLabel(selectedSession.sessionStatus)} tone="text-white" />
                  <MetricTile label="Zeitraum" value={selectedSession.periodPreset ?? 'frei'} tone="text-white" />
                  <MetricTile label="Pinning" value={selectedSession.isPinned ? 'Angepinnt' : 'Normal'} tone={selectedSession.isPinned ? 'text-emerald-300' : 'text-white/80'} />
                  <MetricTile label="Net P&L" value={formatCurrency(selectedSession.netPnL)} tone={selectedSession.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Ø R" value={formatRMultiple(selectedSession.averageR)} tone={selectedSession.averageR >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Win Rate" value={`${formatPlainNumber(selectedSession.winRate, 1)}%`} tone={selectedSession.winRate >= 50 ? 'text-emerald-300' : 'text-orange-200'} />
                  <MetricTile label="Trades" value={String(selectedSession.tradeCount)} tone="text-white" />
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/35">Workflow Marker</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSession.labels.length ? selectedSession.labels.map((label) => <span key={`${selectedSession.id}-${label}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{label}</span>) : <span className="text-sm text-white/40">Noch keine Labels vergeben.</span>}
                  </div>
                </div>
              </>
            ) : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Wähle links eine Session aus, um Details, Vergleich und Rücksprung in Trades oder Review zu öffnen.</div>}
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/40 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-white/40">Session-Vergleich</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Zwei Sessions gegeneinander spiegeln</h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">{compareSessions.length}/2 aktiv</span>
            </div>
            {comparison ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <CompareCard title={comparison.left.title} subtitle={`${getTypeLabel(comparison.left.sessionType)} · ${getStatusLabel(comparison.left.sessionStatus)}`} />
                  <CompareCard title={comparison.right.title} subtitle={`${getTypeLabel(comparison.right.sessionType)} · ${getStatusLabel(comparison.right.sessionStatus)}`} />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <MetricTile label="Δ Net P&L" value={formatCurrency(comparison.netPnLDelta)} tone={comparison.netPnLDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Δ Ø R" value={formatRMultiple(comparison.averageRDelta)} tone={comparison.averageRDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Δ Win Rate" value={`${formatPlainNumber(comparison.winRateDelta, 1)} pp`} tone={comparison.winRateDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                  <MetricTile label="Δ Trades" value={String(comparison.tradeCountDelta)} tone={comparison.tradeCountDelta >= 0 ? 'text-emerald-300' : 'text-red-300'} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <TagBucket title="Gemeinsame Tags" items={comparison.sharedTags} emptyLabel="Keine Überschneidung" />
                  <TagBucket title={`Nur ${comparison.left.title}`} items={comparison.uniqueLeftTags} emptyLabel="Keine exklusiven Tags" />
                  <TagBucket title={`Nur ${comparison.right.title}`} items={comparison.uniqueRightTags} emptyLabel="Keine exklusiven Tags" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/65">Gemeinsame Trades: <span className="text-white">{comparison.sharedTrades.length}</span> · Nur links: <span className="text-white">{comparison.onlyLeftTrades}</span> · Nur rechts: <span className="text-white">{comparison.onlyRightTrades}</span></div>
              </div>
            ) : <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">Aktiviere links zwei Sessions über „Vergleichen“, um Deltas, gemeinsame Tags und Trade-Überschneidungen zu sehen.</div>}
          </div>
        </div>
      </div>
    </section>
  )
}

function FilterField({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <label className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</span>
      {children}
    </label>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className={`mt-3 text-base font-semibold ${tone}`}>{value}</p>
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
