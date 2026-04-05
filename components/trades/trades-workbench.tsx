'use client'

import React from 'react'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTradeEntry } from '@/app/actions/trades'
import { TradeDetailCard } from '@/components/trades/trade-detail-card'
import type { TradeDetail, Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import type { SavedReviewSession } from '@/lib/types/review-session'
import { formatCurrency } from '@/lib/utils/calculations'
import { getTradeTrustMeta, getTradeTrustState, getTradeTrustSummary } from '@/lib/utils/trade-trust'
import {
  buildTradeTagMap,
  countActiveTradeTableFilters,
  createDefaultTradeTableFilters,
  filterTradeTableRows,
  sortTradeTableRows,
  summarizeTrades,
  type TradeTableFilters,
  type TradeTableSort,
} from '@/lib/utils/trade-table'

const sortOptions: Array<{ value: TradeTableSort; label: string }> = [
  { value: 'newest', label: 'Neueste zuerst' },
  { value: 'oldest', label: 'Älteste zuerst' },
  { value: 'pnl-desc', label: 'P&L absteigend' },
  { value: 'pnl-asc', label: 'P&L aufsteigend' },
]

const PAGE_SIZE = 15
const COLUMN_STORAGE_KEY = 'equora-trades-visible-columns-v56.23'

type ColumnKey = 'asset' | 'date' | 'session' | 'grund' | 'strategie' | 'status' | 'bild' | 'ergebnis'

const defaultVisibleColumns: ColumnKey[] = ['asset', 'date', 'session', 'grund', 'strategie', 'status', 'bild', 'ergebnis']

const columnDefinitions: Array<{ key: ColumnKey; label: string }> = [
  { key: 'asset', label: 'Asset' },
  { key: 'date', label: 'Datum' },
  { key: 'session', label: 'Session' },
  { key: 'grund', label: 'Grund' },
  { key: 'strategie', label: 'Strategie' },
  { key: 'status', label: 'Status' },
  { key: 'bild', label: 'Bild' },
  { key: 'ergebnis', label: 'Ergebnis' },
]

type TradesWorkbenchProps = {
  trades: Trade[]
  tradeDetails: Record<string, TradeDetail>
  tradeTags: TradeTag[]
  selectedTradeId?: string
  tagOptions: string[]
  marketOptions: string[]
  setupOptions: string[]
  sessionOptions: string[]
  conceptOptions: string[]
  emotionOptions: string[]
  weekdayOptions: string[]
  source: 'supabase' | 'mock'
  initialFilters?: TradeTableFilters
  reviewContext?: {
    title: string
    description: string
    chips: string[]
  }
  spotlightTradeIds?: string[]
  spotlightTotalCount?: number
  savedSessions?: SavedReviewSession[]
  newTradeHref?: string
  snipHref?: string
  importHref?: string
  isEditorOpen?: boolean
  activeEditTradeId?: string
  activeCloseTradeId?: string
}

export function TradesWorkbench({
  trades,
  tradeDetails,
  tradeTags,
  selectedTradeId,
  tagOptions,
  marketOptions,
  setupOptions,
  sessionOptions,
  source,
  initialFilters,
  reviewContext,
  spotlightTradeIds = [],
  newTradeHref = '/trades?capture=full#trade-editor',
  snipHref = '/trades?capture=quick#trade-editor',
  importHref = '/trades?capture=import#trade-editor',
  isEditorOpen = false,
  activeEditTradeId,
  activeCloseTradeId,
}: TradesWorkbenchProps) {
  const router = useRouter()
  const [tradeItems, setTradeItems] = useState<Trade[]>(trades)
  const [tradeDetailItems, setTradeDetailItems] = useState<Record<string, TradeDetail>>(tradeDetails)
  const [tradeTagItems, setTradeTagItems] = useState<TradeTag[]>(tradeTags)
  const [filters, setFilters] = useState<TradeTableFilters>(() => initialFilters ?? createDefaultTradeTableFilters())
  const [sort, setSort] = useState<TradeTableSort>('newest')
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(selectedTradeId ?? trades[0]?.id)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [showReviewOnly, setShowReviewOnly] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultVisibleColumns)
  const [isDeletingTrade, startDeletingTrade] = useTransition()
  const [isExporting, startExporting] = useTransition()

  useEffect(() => setTradeItems(trades), [trades])
  useEffect(() => setTradeDetailItems(tradeDetails), [tradeDetails])
  useEffect(() => setTradeTagItems(tradeTags), [tradeTags])

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
  const visibleTrades = useMemo(() => displayedTrades.slice(0, visibleCount), [displayedTrades, visibleCount])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters, sort, showReviewOnly])

  useEffect(() => {
    if (!displayedTrades.length) {
      setSelectedTrade(undefined)
      return
    }
    if (!selectedTrade || !displayedTrades.some((trade) => trade.id === selectedTrade)) {
      setSelectedTrade(displayedTrades[0].id)
    }
  }, [displayedTrades, selectedTrade])

  const selectedTradeDetail = useMemo(() => {
    const fallbackTrade = displayedTrades[0] ?? tradeItems[0]
    const resolvedTradeId = selectedTrade && tradeDetailItems[selectedTrade] ? selectedTrade : fallbackTrade?.id
    if (!resolvedTradeId) return null

    return {
      id: resolvedTradeId,
      detail: tradeDetailItems[resolvedTradeId],
      tags: (tradeTagMap[resolvedTradeId] ?? []).map((tag, index) => ({ id: `${resolvedTradeId}-${index}`, tag })),
    }
  }, [displayedTrades, selectedTrade, tradeDetailItems, tradeItems, tradeTagMap])

  const selectedTradeSummary = useMemo(
    () => (selectedTradeDetail ? tradeItems.find((trade) => trade.id === selectedTradeDetail.id) : undefined),
    [selectedTradeDetail, tradeItems],
  )

  const summary = useMemo(() => summarizeTrades(displayedTrades), [displayedTrades])
  const trustSummary = useMemo(() => getTradeTrustSummary(displayedTrades), [displayedTrades])
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
      setTradeDetailItems((current) => {
        const next = { ...current }
        delete next[result.deletedId as string]
        return next
      })

      const nextTrade = displayedTrades.find((trade) => trade.id !== result.deletedId) ?? tradeItems.find((trade) => trade.id !== result.deletedId)
      setSelectedTrade(nextTrade?.id)
      router.refresh()
    })
  }

  return (
    <section className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">Workspace</p>
          <h2 className="mt-2 text-2xl font-semibold text-orange-300">Trade Workspace</h2>
          <p className="mt-2 text-sm leading-6 text-white/60">Tabelle zum Finden, Detailpanel zum Verstehen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs ${source === 'supabase' ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-white/10 bg-white/5 text-white/70'}`}>
            {source === 'supabase' ? 'Live-Daten' : 'Demo-Daten'}
          </span>
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/60">
            {displayedTrades.length} Trades sichtbar
          </span>
        </div>
      </div>

      {reviewContext ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Review-Fokus</p>
              <h3 className="mt-2 text-base font-semibold text-white">{reviewContext.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">{reviewContext.description}</p>
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
          <ToolbarLink href={newTradeHref} label="Trade erfassen" icon="plus" />
          <ToolbarLink href={snipHref} label="Schnell erfassen" icon="scissors" />
          <ToolbarLink href={importHref} label="CSV Import" icon="download" />
          <ToolbarButton
            label={showMoreFilters ? 'Filter zu' : 'Filter'}
            icon="filter"
            onClick={() => setShowMoreFilters((current) => !current)}
            active={showMoreFilters}
            title="Filter ein- oder ausblenden"
          />
          <ToolbarButton
            label="Spalten"
            icon="columns"
            onClick={() => setShowColumnsMenu((current) => !current)}
            active={showColumnsMenu}
            title="Sichtbare Spalten wählen"
          />
          <ToolbarButton
            label={isExporting ? 'Export läuft' : 'Export'}
            icon="upload"
            onClick={() => {
              startExporting(async () => {
                if (typeof window === 'undefined') return

                const headers = [
                  'asset', 'date', 'session', 'grund', 'strategie', 'status', 'trade_state', 'trust', 'direction', 'result', 'net_pnl', 'r_value', 'has_screenshot', 'tag_count', 'trade_id',
                ]
                const csvEscape = (value: unknown) => {
                  const text = String(value ?? '')
                  return `\"${text.replace(/\"/g, '\"\"')}\"`
                }
                const rows = displayedTrades.map((trade) => {
                  const tags = tradeTagMap[trade.id] ?? []
                  const trustMeta = getTradeTrustMeta(trade)
                  const status = trade.captureResult === 'open' ? 'Offen' : trade.captureStatus === 'incomplete' ? 'Unvollständig' : 'Geschlossen'
                  return [trade.market, trade.date, trade.session || '', trade.concept || trade.emotion || '', trade.setup || '', status, trade.captureStatus || '', trustMeta.shortLabel, trade.direction || '', trade.result || '', trade.netPnL ?? '', trade.rValue ?? '', (trade.screenshotCount ?? 0) > 0 ? 'yes' : 'no', tags.length, trade.id].map(csvEscape).join(',')
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
            placeholder="Trade, Asset, Strategie oder Tag suchen"
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
          Editor aktiv. Aktionen aus Tabelle und Detail öffnen jetzt direkt den sichtbaren Bereich oberhalb des Workspace.
        </div>
      ) : null}

      {showColumnsMenu ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/35">Spalten wählen</p>
              <p className="mt-1 text-sm text-white/55">Zeige nur die Felder, die ihr in eurer täglichen Trade-Ablage wirklich braucht.</p>
            </div>
            <button
              type="button"
              onClick={() => setVisibleColumns(defaultVisibleColumns)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Standard wiederherstellen
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
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
          Bilder · {listSummary.screenshots}
        </span>
        <span className={`rounded-full border px-3 py-1.5 text-xs ${summary.netPnL >= 0 ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-red-400/20 bg-red-400/10 text-red-200'}`}>
          Net P&amp;L · {formatCurrency(summary.netPnL)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70">
          Belastbar · {trustSummary.trustedTrades}/{trustSummary.totalTrades}
        </span>
        {trustSummary.needsAttention > 0 ? (
          <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100/85">
            Prüfen · {trustSummary.needsAttention}
          </span>
        ) : null}
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
          <FilterSelect label="Markt" value={filters.market} onChange={(value) => updateFilter('market', value)} options={marketOptions} />
          <FilterSelect label="Strategie" value={filters.setup} onChange={(value) => updateFilter('setup', value)} options={setupOptions} />
          <FilterSelect label="Session" value={filters.session} onChange={(value) => updateFilter('session', value)} options={sessionOptions} />
          <FilterSelect label="Tag" value={filters.tag} onChange={(value) => updateFilter('tag', value)} options={tagOptions} />
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-orange-400/15 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/35">Trade-Tabelle</p>
              <p className="mt-1 text-sm text-white/55">{displayedTrades.length} Treffer, davon {visibleTrades.length} sichtbar</p>
            </div>
            <p className="text-xs text-white/40">Klick auf eine Zeile öffnet darunter das Detail</p>
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
                        onClick={() => setSelectedTrade(trade.id)}
                        className={`cursor-pointer align-top transition hover:bg-white/5 ${isSelected ? 'bg-orange-400/10' : ''}`}
                      >
                        {visibleColumns.map((column) => (
                          <td key={`${trade.id}-${column}`} className="px-4 py-3 text-white/75">
                            <TradeTableCell column={column} trade={trade} tagCount={tags.length} trustState={trustState} />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                          <RowActions
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
            <div className="px-4 py-10 text-center text-sm text-white/50">Keine Trades treffen auf die aktuelle Kombination zu.</div>
          )}

          {displayedTrades.length > visibleTrades.length ? (
            <div className="border-t border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
              >
                Mehr laden ({displayedTrades.length - visibleTrades.length} weitere)
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {statusMessage ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">{statusMessage}</div>
          ) : null}

          {selectedTradeSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricTile label="Status" value={selectedTradeSummary.captureResult === 'open' ? 'Offen' : selectedTradeSummary.captureStatus === 'incomplete' ? 'Unvollständig' : 'Geschlossen'} tone={selectedTradeSummary.captureResult === 'open' ? 'text-emerald-200' : selectedTradeSummary.captureStatus === 'incomplete' ? 'text-orange-100/85' : 'text-white'} />
              <MetricTile label="Bilder" value={String(selectedTradeSummary.screenshotCount ?? 0)} tone="text-white/80" />
              <MetricTile label="P&L" value={selectedTradeSummary.result} tone={selectedTradeSummary.netPnL === undefined || selectedTradeSummary.netPnL === null ? 'text-white/60' : selectedTradeSummary.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'} />
              <MetricTile label="Teilstaffel" value={selectedTradeSummary.partialExitCoveragePercent ? `${Math.round(selectedTradeSummary.partialExitCoveragePercent)}% · ${Math.round(selectedTradeSummary.partialExitRemainderPercent ?? 0)}% Rest` : '—'} tone={selectedTradeSummary.partialExitCoveragePercent ? 'text-orange-100/85' : 'text-white/55'} />
              <MetricTile label="Vertrauen" value={getTradeTrustMeta(selectedTradeSummary).shortLabel} tone={getTradeTrustMeta(selectedTradeSummary).tone === 'red' ? 'text-red-200' : getTradeTrustMeta(selectedTradeSummary).tone === 'orange' ? 'text-orange-100/85' : getTradeTrustMeta(selectedTradeSummary).tone === 'emerald' ? 'text-emerald-200' : 'text-white/70'} />
            </div>
          ) : null}

          {selectedTradeDetail ? (
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
          ) : (
            <div className="rounded-3xl border border-orange-400/15 bg-black/35 p-6 text-sm text-white/55">
              Wähle links einen Trade aus, um Bild, Zahlen und Details zu sehen.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ToolbarLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  return (
    <Link
      href={href}
      prefetch={false}
      title={label}
      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
    >
      <span className="rounded-xl border border-white/8 bg-white/[0.03] p-1.5"><WorkspaceIcon icon={icon} /></span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
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

function RowActions({ trade, isSelected, isEditing, isClosing }: { trade: Trade; isSelected: boolean; isEditing: boolean; isClosing: boolean }) {
  const isOpenTrade = trade.captureResult === 'open'
  const actionLabel = isOpenTrade ? 'Schließen' : trade.captureStatus === 'incomplete' ? 'Vervollständigen' : 'Bearbeiten'
  const actionHref = isOpenTrade
    ? `/trades?tradeId=${encodeURIComponent(trade.id)}&closeTradeId=${encodeURIComponent(trade.id)}#trade-editor`
    : `/trades?tradeId=${encodeURIComponent(trade.id)}&editTradeId=${encodeURIComponent(trade.id)}#trade-editor`
  const detailHref = `/trades?tradeId=${encodeURIComponent(trade.id)}`
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
