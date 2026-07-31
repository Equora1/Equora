'use client'

import React from 'react'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { deleteTradeEntry } from '@/app/actions/trades'
import { TradeDetailCard } from '@/components/trades/trade-detail-card'
import type { TradeDetail, Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import type { SavedReviewSession } from '@/lib/types/review-session'
import { buildStreakMetrics } from '@/lib/utils/analytics'
import { getTradeTrustMeta, getTradeTrustState } from '@/lib/utils/trade-trust'
import { getTradeAccountLabel } from '@/lib/utils/account-context'
import {
  buildTradeTagMap,
  countActiveTradeTableFilters,
  createDefaultTradeTableFilters,
  filterTradeTableRows,
  sortTradeTableRows,
  type TradeTableFilters,
  type TradeTableSort,
} from '@/lib/utils/trade-table'

const sortOptions: Array<{ value: TradeTableSort; label: string }> = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'oldest', label: 'Älteste zuerst' },
  { value: 'pnl-desc', label: 'P&L absteigend' },
  { value: 'pnl-asc', label: 'P&L aufsteigend' },
]

function getStreakTone(streak: ReturnType<typeof buildStreakMetrics>) {
  if (streak.currentLossStreak >= 3) return 'danger'
  if (streak.currentLossStreak > 0) return 'caution'
  if (streak.currentWinStreak > 0) return 'positive'
  return 'neutral'
}

function getStreakTitle(streak: ReturnType<typeof buildStreakMetrics>) {
  if (streak.currentLossStreak >= 3) return `Vorsicht: ${streak.currentLossStreak} Verluste in Folge`
  if (streak.currentLossStreak > 0) return `${streak.currentLossStreak} Verlust${streak.currentLossStreak === 1 ? '' : 'e'} in Folge`
  if (streak.currentWinStreak > 0) return `${streak.currentWinStreak} Gewinn-Trade${streak.currentWinStreak === 1 ? '' : 's'} in Folge`
  return 'Keine aktive Serie'
}

function getStreakHint(streak: ReturnType<typeof buildStreakMetrics>) {
  if (streak.currentLossStreak >= 3) return 'Nicht rächen. Setup prüfen, Größe ruhig halten, erst Klarheit.'
  if (streak.currentLossStreak > 0) return 'Verlustserie erkannt. Nächster Trade braucht Regelklarheit, nicht Tempo.'
  if (streak.currentWinStreak >= 3) return 'Gute Serie. Nicht größer werden, nur sauber bleiben.'
  if (streak.currentWinStreak > 0) return 'Momentum da. Weiter nur A-Logik handeln.'
  return 'Sobald geschlossene Trades mit P&L vorliegen, wird die Serie sichtbar.'
}

function getTodayLabel(streak: ReturnType<typeof buildStreakMetrics>) {
  if (streak.todayTrades === 0) return 'Heute noch kein Trade'
  if (streak.todayOpenTrades > 0 && streak.todayWins + streak.todayLosses + streak.todayBreakeven === 0) return `${streak.todayOpenTrades} offen`
  return `${streak.todayWins}W · ${streak.todayLosses}L · ${streak.todayBreakeven}BE${streak.todayOpenTrades ? ` · ${streak.todayOpenTrades} offen` : ''}`
}

const COLUMN_STORAGE_KEY = 'equora-trades-visible-columns-v56.23'

type ColumnKey = 'account' | 'asset' | 'date' | 'session' | 'grund' | 'strategie' | 'status' | 'bild' | 'ergebnis'

const defaultVisibleColumns: ColumnKey[] = ['account', 'asset', 'date', 'session', 'grund', 'strategie', 'status', 'bild', 'ergebnis']

const columnDefinitions: Array<{ key: ColumnKey; label: string }> = [
  { key: 'account', label: 'Konto' },
  { key: 'asset', label: 'Asset' },
  { key: 'date', label: 'Datum' },
  { key: 'session', label: 'Session' },
  { key: 'grund', label: 'Grund' },
  { key: 'strategie', label: 'Setup' },
  { key: 'status', label: 'Status' },
  { key: 'bild', label: 'Bild' },
  { key: 'ergebnis', label: 'P&L' },
]

type TradesWorkbenchProps = {
  trades: Trade[]
  activeTradeDetail?: TradeDetail
  activeTradeSummary?: Trade
  activeTradeTags?: TradeTag[]
  tradeTags: TradeTag[]
  selectedTradeId?: string
  tagOptions: string[]
  marketOptions: string[]
  setupOptions: string[]
  sessionOptions: string[]
  accountOptions: string[]
  conceptOptions: string[]
  emotionOptions: string[]
  weekdayOptions: string[]
  source: 'supabase' | 'mock'
  initialFilters?: TradeTableFilters
  reviewContext?: {
    title: string
    description?: string
    chips: string[]
  }
  spotlightTradeIds?: string[]
  spotlightTotalCount?: number
  savedSessions?: SavedReviewSession[]
  isEditorOpen?: boolean
  activeEditTradeId?: string
  activeCloseTradeId?: string
  page: number
  pageSize: number
  totalTradeCount: number
  totalPages: number
}

export function TradesWorkbench({
  trades,
  activeTradeDetail,
  activeTradeSummary,
  activeTradeTags = [],
  tradeTags,
  selectedTradeId,
  tagOptions,
  marketOptions,
  setupOptions,
  sessionOptions,
  accountOptions,
  source,
  initialFilters,
  reviewContext,
  spotlightTradeIds = [],
  isEditorOpen = false,
  activeEditTradeId,
  activeCloseTradeId,
  page,
  pageSize,
  totalTradeCount,
  totalPages,
}: TradesWorkbenchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tradeItems, setTradeItems] = useState<Trade[]>(trades)
  const [tradeTagItems, setTradeTagItems] = useState<TradeTag[]>(tradeTags)
  const [filters, setFilters] = useState<TradeTableFilters>(() => initialFilters ?? createDefaultTradeTableFilters())
  const [sort, setSort] = useState<TradeTableSort>('newest')
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(selectedTradeId)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [showReviewOnly, setShowReviewOnly] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultVisibleColumns)
  const [isDeletingTrade, startDeletingTrade] = useTransition()
  const [isExporting, startExporting] = useTransition()
  const hasExplicitSelection = Boolean(selectedTradeId)

  useEffect(() => setTradeItems(trades), [trades])
  useEffect(() => setTradeTagItems(tradeTags), [tradeTags])
  useEffect(() => setSelectedTrade(selectedTradeId), [selectedTradeId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as ColumnKey[]
      const cleaned = parsed.filter((column) => columnDefinitions.some((definition) => definition.key === column))
      if (cleaned.length) setVisibleColumns(cleaned)
    } catch {
      // ignore corrupted local preference and continue with defaults
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns))
  }, [visibleColumns])

  const tradeTagMap = useMemo(() => buildTradeTagMap(tradeTagItems), [tradeTagItems])
  const reviewTradeSet = useMemo(() => new Set(spotlightTradeIds), [spotlightTradeIds])
  const filteredTrades = useMemo(() => filterTradeTableRows(tradeItems, tradeTagMap, filters), [filters, tradeItems, tradeTagMap])
  const sortedTrades = useMemo(() => sortTradeTableRows(filteredTrades, sort), [filteredTrades, sort])
  const displayedTrades = useMemo(
    () => (showReviewOnly ? sortedTrades.filter((trade) => reviewTradeSet.has(trade.id)) : sortedTrades),
    [reviewTradeSet, showReviewOnly, sortedTrades],
  )
  const visibleTrades = displayedTrades

  useEffect(() => {
    if (!displayedTrades.length) {
      setSelectedTrade(undefined)
      return
    }

    if (selectedTrade && displayedTrades.some((trade) => trade.id === selectedTrade)) return
    if (selectedTrade || hasExplicitSelection) {
      setSelectedTrade(displayedTrades[0].id)
    }
  }, [displayedTrades, hasExplicitSelection, selectedTrade])

  const selectedTradeDetail = useMemo(() => {
    if (!selectedTrade || !activeTradeDetail || selectedTrade !== selectedTradeId) return null

    return {
      id: selectedTrade,
      detail: activeTradeDetail,
      tags: activeTradeTags.map((tag) => ({ id: tag.id, tag: tag.tag })),
    }
  }, [activeTradeDetail, activeTradeTags, selectedTrade, selectedTradeId])

  const selectedTradeSummary = useMemo(
    () => selectedTrade === selectedTradeId ? activeTradeSummary : selectedTrade ? tradeItems.find((trade) => trade.id === selectedTrade) : undefined,
    [activeTradeSummary, selectedTrade, selectedTradeId, tradeItems],
  )

  const activeFilterCount = countActiveTradeTableFilters(filters)
  const listSummary = useMemo(
    () => ({
      open: displayedTrades.filter((trade) => trade.captureResult === 'open').length,
      incomplete: displayedTrades.filter((trade) => trade.captureStatus === 'incomplete').length,
      closed: displayedTrades.filter((trade) => trade.captureStatus === 'complete' && trade.captureResult !== 'open').length,
      screenshots: displayedTrades.filter((trade) => (trade.screenshotCount ?? 0) > 0).length,
    }),
    [displayedTrades],
  )
  const streak = useMemo(() => buildStreakMetrics(tradeItems), [tradeItems])
  const streakTone = getStreakTone(streak)


  function buildHrefForPage(targetPage: number, tradeId?: string) {
    const next = new URLSearchParams(searchParams.toString())
    next.set('page', String(targetPage))
    next.delete('editTradeId')
    next.delete('closeTradeId')
    if (tradeId) next.set('tradeId', tradeId)
    else next.delete('tradeId')
    const query = next.toString()
    return query ? `/trades?${query}` : '/trades'
  }

  function selectTrade(tradeId: string) {
    setSelectedTrade(tradeId)
    router.push(buildHrefForPage(page, tradeId), { scroll: false })
  }

  function updateFilter<K extends keyof TradeTableFilters>(key: K, value: TradeTableFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function applyStatus(status: TradeTableFilters['status']) {
    setFilters((current) => ({ ...current, status }))
  }

  function resetWorkbench() {
    setFilters(createDefaultTradeTableFilters())
    setSort('newest')
    setShowReviewOnly(false)
    setStatusMessage('')
    setShowMoreFilters(false)
    router.push('/trades')
  }

  function toggleColumn(column: ColumnKey) {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) return current
        return current.filter((item) => item !== column)
      }

      const next = [...current, column]
      return columnDefinitions.map((definition) => definition.key).filter((key) => next.includes(key))
    })
  }

  function handleDeleteSelectedTrade() {
    if (!selectedTradeDetail) return

    const tradeSummary = tradeItems.find((trade) => trade.id === selectedTradeDetail.id)
    const confirmed = window.confirm(`Trade „${tradeSummary?.market ?? 'Trade'} · ${tradeSummary?.setup ?? ''}“ wirklich löschen?`)
    if (!confirmed) return

    startDeletingTrade(async () => {
      const result = await deleteTradeEntry(selectedTradeDetail.id)
      setStatusMessage(result.message)
      if (!result.success || !result.deletedId) return

      setTradeItems((current) => current.filter((trade) => trade.id !== result.deletedId))
      setTradeTagItems((current) => current.filter((tag) => tag.trade_id !== result.deletedId))
      const nextTrade = displayedTrades.find((trade) => trade.id !== result.deletedId) ?? tradeItems.find((trade) => trade.id !== result.deletedId)
      setSelectedTrade(nextTrade?.id)
      router.refresh()
    })
  }

  return (
    <section className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold text-orange-300">Trades</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/60">
            {displayedTrades.length} Trades
          </span>
        </div>
      </div>

      <StreakPulseCard streak={streak} tone={streakTone} />

      {reviewContext ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Review</p>
              <h3 className="mt-2 text-base font-semibold text-white">{reviewContext.title}</h3>
            </div>
            {spotlightTradeIds.length ? (
              <button
                type="button"
                onClick={() => setShowReviewOnly((current) => !current)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${showReviewOnly ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-black/25 text-white/75 hover:border-white/25 hover:text-white'}`}
              >
                {showReviewOnly ? 'Alle sichtbaren Trades' : 'Nur Review-Treffer'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <ToolbarButton
            label={showMoreFilters ? 'Filter zu' : 'Filter'}
            icon="filter"
            onClick={() => setShowMoreFilters((current) => !current)}
            active={showMoreFilters}
            title="Filter ein- oder ausblenden"
          />
          <ToolbarButton
            label={showColumnsMenu ? 'Spalten zu' : 'Spalten'}
            icon="columns"
            onClick={() => setShowColumnsMenu((current) => !current)}
            active={showColumnsMenu}
            title="Sichtbare Spalten wählen"
          />
          <ToolbarButton
            label={isExporting ? 'Export' : 'CSV'}
            icon="upload"
            onClick={() => {
              startExporting(async () => {
                if (typeof window === 'undefined') return

                const headers = [
                  'account', 'asset', 'date', 'session', 'grund', 'strategie', 'status', 'trade_state', 'trust', 'direction', 'result', 'net_pnl', 'r_value', 'has_screenshot', 'tag_count', 'trade_id',
                ]
                const csvEscape = (value: unknown) => {
                  const text = String(value ?? '')
                  return `\"${text.replace(/\"/g, '\"\"')}\"`
                }
                const rows = displayedTrades.map((trade) => {
                  const tags = tradeTagMap[trade.id] ?? []
                  const trustMeta = getTradeTrustMeta(trade)
                  const status = trade.captureResult === 'open' ? 'Offen' : trade.captureStatus === 'incomplete' ? 'Unvollständig' : 'Geschlossen'
                  return [getTradeAccountLabel(trade), trade.market, trade.date, trade.session || '', trade.concept || trade.emotion || '', trade.setup || '', status, trade.captureStatus || '', trustMeta.shortLabel, trade.direction || '', trade.result || '', trade.netPnL ?? '', trade.rValue ?? '', (trade.screenshotCount ?? 0) > 0 ? 'yes' : 'no', tags.length, trade.id].map(csvEscape).join(',')
                })
                const csv = [headers.join(','), ...rows].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const url = window.URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = `equora-trades-${new Date().toISOString().slice(0, 10)}.csv`
                document.body.appendChild(anchor)
                anchor.click()
                anchor.remove()
                window.URL.revokeObjectURL(url)
                setStatusMessage(`${displayedTrades.length} Trades als CSV exportiert.`)
              })
            }}
            title="Aktuelle Tabelle als CSV exportieren"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Konto, Markt, Setup, Tag"
            className="w-full min-w-[240px] rounded-2xl border border-orange-400/15 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as TradeTableSort)}
            className="rounded-2xl border border-orange-400/15 bg-black/35 px-4 py-3 text-sm text-white outline-none"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-black text-white">
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isEditorOpen ? (
        <div className="mt-4 rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-50/90">
          Editor aktiv
        </div>
      ) : null}

      {showColumnsMenu ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              
            </div>
            <button
              type="button"
              onClick={() => setVisibleColumns(defaultVisibleColumns)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
Standard
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {columnDefinitions.map((column) => {
              const checked = visibleColumns.includes(column.key)
              return (
                <label key={column.key} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition ${checked ? 'border-orange-300/35 bg-orange-400/10 text-white' : 'border-white/10 bg-black/25 text-white/70 hover:border-white/20 hover:text-white'}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleColumn(column.key)}
                    className="h-4 w-4 rounded border-white/20 bg-black/35"
                  />
                  <span>{column.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: 'Offen', value: 'Offen' as const, tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200', count: listSummary.open },
          { label: 'Unvollständig', value: 'Unvollständig' as const, tone: 'border-orange-400/20 bg-orange-400/10 text-orange-100/85', count: listSummary.incomplete },
          { label: 'Geschlossen', value: 'Geschlossen' as const, tone: 'border-white/10 bg-white/5 text-white/75', count: listSummary.closed },
          { label: 'Alle', value: 'Alle' as const, tone: 'border-white/10 bg-black/30 text-white/75', count: displayedTrades.length },
        ].map((tab) => {
          const isActive = filters.status === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => applyStatus(tab.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${isActive ? tab.tone : 'border-white/10 bg-black/30 text-white/55 hover:border-white/20 hover:text-white'}`}
            >
              {tab.label} · {tab.count}
            </button>
          )
        })}
        <button
          type="button"
          onClick={resetWorkbench}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65 transition hover:border-white/20 hover:text-white"
        >
          Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {showMoreFilters ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="Konto" value={filters.account} onChange={(value) => updateFilter('account', value)} options={accountOptions} />
          <FilterSelect label="Markt" value={filters.market} onChange={(value) => updateFilter('market', value)} options={marketOptions} />
          <FilterSelect label="Setup" value={filters.setup} onChange={(value) => updateFilter('setup', value)} options={setupOptions} />
          <FilterSelect label="Session" value={filters.session} onChange={(value) => updateFilter('session', value)} options={sessionOptions} />
          <FilterSelect label="Tag" value={filters.tag} onChange={(value) => updateFilter('tag', value)} options={tagOptions} />
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-orange-400/15 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm text-white/60">{visibleTrades.length} auf Seite {page} · {totalTradeCount} gesamt</p>
            {selectedTradeSummary ? <p className="text-xs text-white/40">{getTradeAccountLabel(selectedTradeSummary)} · {selectedTradeSummary.market} · {selectedTradeSummary.setup || 'Ohne Setup'}</p> : null}
          </div>

          {visibleTrades.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-white/10 bg-black/35 text-left text-[11px] uppercase tracking-[0.18em] text-white/40">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column} className="px-4 py-3 font-medium whitespace-nowrap">{columnDefinitions.find((definition) => definition.key === column)?.label}</th>
                    ))}
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleTrades.map((trade) => {
                    const isSelected = selectedTrade === trade.id
                    const tags = tradeTagMap[trade.id] ?? []
                    const trustState = getTradeTrustState(trade)
                    return (
                      <tr
                        key={trade.id}
                        onClick={() => selectTrade(trade.id)}
                        className={`cursor-pointer align-top transition hover:bg-white/5 ${isSelected ? 'bg-orange-400/10' : ''}`}
                      >
                        {visibleColumns.map((column) => (
                          <td key={`${trade.id}-${column}`} className="px-4 py-3 text-white/75">
                            <TradeTableCell column={column} trade={trade} tagCount={tags.length} trustState={trustState} />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                          <RowActions
                            page={page}
                            trade={trade}
                            isSelected={isSelected}
                            isEditing={activeEditTradeId === trade.id}
                            isClosing={activeCloseTradeId === trade.id}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-white/50">Keine Trades.</div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">Seite {page} von {totalPages} · maximal {pageSize} Trades pro Seite. Filter wirken auf die aktuell geladene Seite.</p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={buildHrefForPage(page - 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white">Zurück</Link>
              ) : (
                <span className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-white/25">Zurück</span>
              )}
              <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100">{page} / {totalPages}</span>
              {page < totalPages ? (
                <Link href={buildHrefForPage(page + 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white">Weiter</Link>
              ) : (
                <span className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-white/25">Weiter</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {statusMessage ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">{statusMessage}</div>
          ) : null}

          {selectedTradeDetail ? (
            <div id="trade-detail" className="scroll-mt-24">
              <TradeDetailCard
                detail={selectedTradeDetail.detail}
                trade={selectedTradeSummary}
                tags={selectedTradeDetail.tags}
                tradeId={selectedTradeDetail.id}
                tagOptions={tagOptions}
                source={source}
                onDelete={handleDeleteSelectedTrade}
                isDeleting={isDeletingTrade}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}


function StreakPulseCard({ streak, tone }: { streak: ReturnType<typeof buildStreakMetrics>; tone: ReturnType<typeof getStreakTone> }) {
  const toneClass = tone === 'danger'
    ? 'border-red-400/25 bg-red-400/10'
    : tone === 'caution'
      ? 'border-orange-300/25 bg-orange-400/10'
      : tone === 'positive'
        ? 'border-emerald-400/22 bg-emerald-400/10'
        : 'border-white/10 bg-black/25'

  const titleTone = tone === 'danger'
    ? 'text-red-100'
    : tone === 'positive'
      ? 'text-emerald-100'
      : 'text-orange-50'

  return (
    <section className={`mt-5 rounded-2xl border p-4 ${toneClass}`}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)] xl:items-center">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">Aktuelle Serie</p>
          <h3 className={`mt-2 text-xl font-semibold ${titleTone}`}>{getStreakTitle(streak)}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{getStreakHint(streak)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <StreakMiniStat label="Heute" value={getTodayLabel(streak)} />
          <StreakMiniStat label="Gewinnserie" value={streak.longestWinStreak ? String(streak.longestWinStreak) : '—'} />
          <StreakMiniStat label="Verlustserie" value={streak.longestLossStreak ? String(streak.longestLossStreak) : '—'} />
        </div>
      </div>
    </section>
  )
}

function StreakMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[9px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function ToolbarButton({ label, icon, onClick, active = false, disabled = false, title }: { label: string; icon: IconName; onClick?: () => void; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${disabled ? 'cursor-not-allowed border-white/10 bg-black/20 text-white/30' : active ? 'border-orange-300/35 bg-orange-400/10 text-white' : 'border-white/10 bg-black/30 text-white/75 hover:border-white/20 hover:text-white'}`}
    >
      <span className="rounded-xl border border-white/8 bg-white/[0.03] p-1.5"><WorkspaceIcon icon={icon} /></span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="rounded-2xl border border-orange-400/15 bg-black/35 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
        <option value="Alle" className="bg-black text-white">
          Alle
        </option>
        {options.map((option) => (
          <option key={option} value={option} className="bg-black text-white">
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 px-5 py-4">
      <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">{label}</p>
      <p className={`mt-2 text-sm font-medium ${tone}`}>{value}</p>
    </div>
  )
}

function TradeTableCell({ column, trade, tagCount, trustState }: { column: ColumnKey; trade: Trade; tagCount: number; trustState: ReturnType<typeof getTradeTrustState> }) {
  const trustMeta = getTradeTrustMeta(trade)
  if (column === 'account') {
    return <span className="whitespace-nowrap text-white/70">{getTradeAccountLabel(trade)}</span>
  }

  if (column === 'asset') {
    return (
      <div className="min-w-[160px]">
        <p className="font-medium text-white">{trade.market}</p>
        <p className="mt-1 text-xs text-white/45">{formatDirection(trade.direction)} · {tagCount > 0 ? `${tagCount} Tag${tagCount === 1 ? '' : 's'}` : 'ohne Tags'}</p>
      </div>
    )
  }

  if (column === 'date') {
    return <span className="whitespace-nowrap text-white/70">{trade.date}</span>
  }

  if (column === 'session') {
    return <span className="whitespace-nowrap text-white/70">{trade.session || '—'}</span>
  }

  if (column === 'grund') {
    return <span className="text-white/70">{trade.concept || trade.emotion || '—'}</span>
  }

  if (column === 'strategie') {
    return <span className="text-white">{trade.setup || '—'}</span>
  }

  if (column === 'status') {
    const statusTone = trade.captureResult === 'open' ? 'emerald' : trade.captureStatus === 'incomplete' ? 'orange' : 'neutral'
    return (
      <div className="min-w-[132px] space-y-2">
        <Pill tone={statusTone}>
          {trade.captureResult === 'open' ? 'Offen' : trade.captureStatus === 'incomplete' ? 'Unvollständig' : 'Geschlossen'}
        </Pill>
        <p className={`text-xs ${trustMeta.tone === 'red' ? 'text-red-200/80' : trustMeta.tone === 'orange' ? 'text-orange-100/75' : trustMeta.tone === 'emerald' ? 'text-emerald-200/80' : 'text-white/45'}`}>{trustMeta.shortLabel}</p>
      </div>
    )
  }

  if (column === 'bild') {
    const count = trade.screenshotCount ?? 0
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${count > 0 ? 'border-white/10 bg-white/5 text-white/75' : 'border-white/10 bg-black/20 text-white/35'}`}>
        {count > 0 ? `${count} Bild${count === 1 ? '' : 'er'}` : '—'}
      </span>
    )
  }

  if (column === 'ergebnis') {
    return (
      <div className="min-w-[110px] text-right">
        <p className={`font-medium ${trade.netPnL === undefined || trade.netPnL === null ? 'text-white/55' : trade.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{trade.result}</p>
        <p className="mt-1 text-xs text-white/40">{trade.r}</p>
      </div>
    )
  }

  return <span className="text-white/60">—</span>
}

function RowActions({ page, trade, isSelected, isEditing, isClosing }: { page: number; trade: Trade; isSelected: boolean; isEditing: boolean; isClosing: boolean }) {
  const isOpenTrade = trade.captureResult === 'open'
  const actionLabel = isOpenTrade ? 'Schließen' : trade.captureStatus === 'incomplete' ? 'Vervollständigen' : 'Bearbeiten'
  const actionHref = isOpenTrade
    ? `/trades?page=${page}&tradeId=${encodeURIComponent(trade.id)}&closeTradeId=${encodeURIComponent(trade.id)}#trade-editor`
    : `/trades?page=${page}&tradeId=${encodeURIComponent(trade.id)}&editTradeId=${encodeURIComponent(trade.id)}#trade-editor`
  const completeHref = `/trades?page=${page}&tradeId=${encodeURIComponent(trade.id)}&editTradeId=${encodeURIComponent(trade.id)}#trade-editor`
  const detailHref = `/trades?page=${page}&tradeId=${encodeURIComponent(trade.id)}`
  const active = isOpenTrade ? isClosing : isEditing

  return (
    <div className="flex min-w-[190px] flex-wrap justify-end gap-2">
      <Link
        href={detailHref}
        prefetch={false}
        className={`rounded-full border px-2.5 py-1 text-xs transition ${isSelected ? 'border-orange-300/35 bg-orange-400/10 text-white' : 'border-white/10 bg-black/25 text-white/65 hover:border-white/20 hover:text-white'}`}
      >
        Details
      </Link>
      {isOpenTrade ? (
        <Link
          href={completeHref}
          prefetch={false}
          className={`rounded-full border px-2.5 py-1 text-xs transition ${isEditing ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-black/25 text-white/72 hover:border-white/20 hover:text-white'}`}
        >
          Ergänzen
        </Link>
      ) : null}
      <Link
        href={actionHref}
        prefetch={false}
        className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100/90 hover:border-emerald-300/35 hover:bg-emerald-400/15'}`}
      >
        {active ? 'Im Editor' : actionLabel}
      </Link>
    </div>
  )
}


function Pill({ children, tone }: { children: React.ReactNode; tone: 'emerald' | 'orange' | 'neutral' | 'ghost' }) {
  const styles = {
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    orange: 'border-orange-400/20 bg-orange-400/10 text-orange-100/85',
    neutral: 'border-white/10 bg-white/5 text-white/70',
    ghost: 'border-white/10 bg-black/30 text-white/50',
  }

  return <span className={`rounded-full border px-2.5 py-1 text-xs ${styles[tone]}`}>{children}</span>
}

type IconName = 'plus' | 'scissors' | 'filter' | 'columns' | 'download' | 'upload'

function WorkspaceIcon({ icon }: { icon: IconName }) {
  const common = 'h-4 w-4 flex-none'

  if (icon === 'plus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    )
  }

  if (icon === 'scissors') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M5 6l14 12" strokeLinecap="round" />
        <path d="M19 6L8 15" strokeLinecap="round" />
        <circle cx="6" cy="6" r="2.2" />
        <circle cx="6" cy="18" r="2.2" />
      </svg>
    )
  }

  if (icon === 'filter') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" strokeLinejoin="round" />
      </svg>
    )
  }

  if (icon === 'columns') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <rect x="4" y="5" width="5" height="14" rx="1.5" />
        <rect x="10" y="5" width="4" height="14" rx="1.5" />
        <rect x="15" y="5" width="5" height="14" rx="1.5" />
      </svg>
    )
  }

  if (icon === 'download') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M12 5v10" strokeLinecap="round" />
        <path d="M8.5 11.5L12 15l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19h14" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
      <path d="M12 19V9" strokeLinecap="round" />
      <path d="M8.5 12.5L12 9l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  )
}

function formatDirection(direction?: Trade['direction']) {
  if (direction === 'long') return 'Long'
  if (direction === 'short') return 'Short'
  return 'Neutral'
}
