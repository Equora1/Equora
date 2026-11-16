'use client'

import { useJournalLocale } from '@/components/layout/journal-locale-provider'
import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatJournalTradeDate, formatJournalTradeResult, formatJournalTradeR } from '@/lib/i18n/trade-display'
import { getTradeRValue } from '@/lib/utils/trade-r'
import React from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { deleteTradeEntry } from '@/app/actions/trades'
import { TradeDetailDrawer } from '@/components/trades/trade-detail-drawer'
import { TradeCurrencyCorrection } from '@/components/trades/trade-currency-correction'
import { TradeCurrencyQualityPanel } from '@/components/trades/trade-currency-quality-panel'
import type { TradeDetail, Trade } from '@/lib/types/trade'
import type { TradeTag } from '@/lib/types/tag'
import type { SavedReviewSession } from '@/lib/types/review-session'
import { buildStreakMetrics } from '@/lib/utils/analytics'
import { getTradeTrustMeta } from '@/lib/utils/trade-trust'
import { getTradeAccountDisplayLabels, getTradeAccountLabel } from '@/lib/utils/account-context'
import { getBrokerFileImportCopy } from '@/lib/i18n/broker-file'
import { brokerFileImportCapability } from '@/lib/utils/broker-file-import-capability'
import { createTradeTableDateRange, getTradeTableDateRangeError } from '@/lib/utils/trade-table-date-range'
import { buildTradeTableHref } from '@/lib/utils/trade-table-query'
import { summarizeTradeCurrencyQuality } from '@/lib/utils/currency'
import {
  buildTradeTagMap,
  buildTradeTableView,
  countActiveTradeTableFilters,
  createDefaultTradeTableFilters,
  type TradeTableFilters,
  type TradeTableSort,
} from '@/lib/utils/trade-table'

const sortOptions: Array<{ value: TradeTableSort; de: string; en: string }> = [
  { value: 'newest', de: 'Neueste zuerst', en: 'Newest first' },
  { value: 'oldest', de: 'Älteste zuerst', en: 'Oldest first' },
  { value: 'pnl-desc', de: 'P&L absteigend', en: 'Highest P&L first' },
  { value: 'pnl-asc', de: 'P&L aufsteigend', en: 'Lowest P&L first' },
]

function getStreakTone(streak: ReturnType<typeof buildStreakMetrics>) {
  if (streak.currentLossStreak >= 3) return 'danger'
  if (streak.currentLossStreak > 0) return 'caution'
  if (streak.currentWinStreak > 0) return 'positive'
  return 'neutral'
}

function getStreakTitle(streak: ReturnType<typeof buildStreakMetrics>, text: ReturnType<typeof journalText>) {
  if (streak.currentLossStreak >= 3) return text(`Vorsicht: ${streak.currentLossStreak} Verluste in Folge`, `Caution: ${streak.currentLossStreak} losses in a row`)
  if (streak.currentLossStreak > 0) return text(`${streak.currentLossStreak} Verlust${streak.currentLossStreak === 1 ? '' : 'e'} in Folge`, `${streak.currentLossStreak} ${streak.currentLossStreak === 1 ? 'loss' : 'losses'} in a row`)
  if (streak.currentWinStreak > 0) return text(`${streak.currentWinStreak} Gewinn-Trade${streak.currentWinStreak === 1 ? '' : 's'} in Folge`, `${streak.currentWinStreak} ${streak.currentWinStreak === 1 ? 'win' : 'wins'} in a row`)
  return text('Keine aktive Serie', 'No active streak')
}

function getStreakHint(streak: ReturnType<typeof buildStreakMetrics>, text: ReturnType<typeof journalText>) {
  if (streak.currentLossStreak >= 3) return text('Nicht rächen. Setup prüfen, Größe ruhig halten, erst Klarheit.', 'Avoid revenge trading. Review your setup and keep your position size steady.')
  if (streak.currentLossStreak > 0) return text('Verlustserie erkannt. Nächster Trade braucht Regelklarheit, nicht Tempo.', 'Review your rules before taking the next trade.')
  if (streak.currentWinStreak >= 3) return text('Gute Serie. Nicht größer werden, nur sauber bleiben.', 'Stick to your rules and keep your position size steady.')
  if (streak.currentWinStreak > 0) return text('Momentum da. Weiter nur A-Logik handeln.', 'Keep focusing on your best setups.')
  return text('Sobald geschlossene Trades mit P&L vorliegen, wird die Serie sichtbar.', 'Streaks appear once closed trades have recorded P&L.')
}

function getTodayLabel(streak: ReturnType<typeof buildStreakMetrics>, text: ReturnType<typeof journalText>) {
  if (streak.todayTrades === 0) return text('Heute noch kein Trade', 'No trades today')
  if (streak.todayOpenTrades > 0 && streak.todayWins + streak.todayLosses + streak.todayBreakeven === 0) return `${streak.todayOpenTrades} ${text('offen', 'open')}`
  return `${streak.todayWins}W · ${streak.todayLosses}L · ${streak.todayBreakeven}BE${streak.todayOpenTrades ? ` · ${streak.todayOpenTrades} ${text('offen', 'open')}` : ''}`
}

const COLUMN_STORAGE_KEY = 'equora-trades-visible-columns-v56.23'

type ColumnKey = 'account' | 'asset' | 'date' | 'session' | 'grund' | 'strategie' | 'status' | 'bild' | 'ergebnis'

const defaultVisibleColumns: ColumnKey[] = ['account', 'asset', 'date', 'session', 'grund', 'strategie', 'status', 'bild', 'ergebnis']

const columnDefinitions: Array<{ key: ColumnKey; de: string; en: string }> = [
  { key: 'account', de: 'Konto', en: 'Account' },
  { key: 'asset', de: 'Asset', en: 'Asset' },
  { key: 'date', de: 'Datum', en: 'Date' },
  { key: 'session', de: 'Session', en: 'Session' },
  { key: 'grund', de: 'Grund', en: 'Reason' },
  { key: 'strategie', de: 'Setup', en: 'Setup' },
  { key: 'status', de: 'Status', en: 'Status' },
  { key: 'bild', de: 'Bild', en: 'Image' },
  { key: 'ergebnis', de: 'P&L', en: 'P&L' },
]

function escapeCsvCell(value: unknown) {
  const text = String(value ?? '')
  const formulaSafeText = typeof value !== 'number' && /^[\u0000-\u0020]*[=+\-@]/.test(text)
    ? `'${text}`
    : text
  return `\"${formulaSafeText.replace(/\"/g, '\"\"')}\"`
}

type TradesWorkbenchProps = {
  trades: Trade[]
  activeTradeDetail?: TradeDetail
  activeTradeSummary?: Trade
  activeTradeTags?: TradeTag[]
  tradeTags: TradeTag[]
  selectedTradeId?: string
  tradeDetailError?: string
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
  initialSort?: TradeTableSort
  initialReviewOnly?: boolean
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
}

export function TradesWorkbench({
  trades,
  activeTradeDetail,
  activeTradeSummary,
  activeTradeTags = [],
  tradeTags,
  selectedTradeId,
  tradeDetailError,
  tagOptions,
  marketOptions,
  setupOptions,
  sessionOptions,
  accountOptions,
  source,
  initialFilters,
  initialSort = 'newest',
  initialReviewOnly = false,
  reviewContext,
  spotlightTradeIds = [],
  savedSessions = [],
  isEditorOpen = false,
  activeEditTradeId,
  activeCloseTradeId,
  page: initialPage,
  pageSize,
  totalTradeCount,
}: TradesWorkbenchProps) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const importCopy = getBrokerFileImportCopy(locale)
  const router = useRouter()
  const searchParams = useSearchParams()
  const lastClosedTradeIdRef = useRef<string | null>(null)
  const [tradeItems, setTradeItems] = useState<Trade[]>(trades)
  const [tradeTagItems, setTradeTagItems] = useState<TradeTag[]>(tradeTags)
  const [filters, setFilters] = useState<TradeTableFilters>(() => initialFilters ?? createDefaultTradeTableFilters())
  const [sort, setSort] = useState<TradeTableSort>(initialSort)
  const [requestedPage, setRequestedPage] = useState(initialPage)
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(selectedTradeId)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [showColumnsMenu, setShowColumnsMenu] = useState(false)
  const [showReviewOnly, setShowReviewOnly] = useState(initialReviewOnly)
  const [statusMessage, setStatusMessage] = useState<{ text: string; lang: JournalLocale } | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultVisibleColumns)
  const [hasLoadedColumnPreference, setHasLoadedColumnPreference] = useState(false)
  const [isDeletingTrade, startDeletingTrade] = useTransition()
  const [isExporting, startExporting] = useTransition()

  useEffect(() => setTradeItems(trades), [trades])
  useEffect(() => setTradeTagItems(tradeTags), [tradeTags])
  useEffect(() => setSelectedTrade(selectedTradeId), [selectedTradeId])
  useEffect(() => {
    setFilters(initialFilters ?? createDefaultTradeTableFilters())
    setSort(initialSort)
    setRequestedPage(initialPage)
    setShowReviewOnly(initialReviewOnly)
  }, [initialFilters, initialSort, initialPage, initialReviewOnly])

  useEffect(() => {
    if (selectedTrade || selectedTradeId || !lastClosedTradeIdRef.current) return

    const closedTradeId = lastClosedTradeIdRef.current
    const timer = window.setTimeout(() => {
      const triggers = Array.from(document.querySelectorAll<HTMLElement>('[data-trade-detail-trigger]'))
      const visibleTrigger = triggers.find((trigger) => (
        trigger.dataset.tradeDetailTrigger === closedTradeId && trigger.offsetParent !== null
      ))
      visibleTrigger?.focus()
      lastClosedTradeIdRef.current = null
    }, 0)

    return () => window.clearTimeout(timer)
  }, [selectedTrade, selectedTradeId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const cleaned = Array.from(new Set(parsed.filter(
        (column): column is ColumnKey => typeof column === 'string'
          && columnDefinitions.some((definition) => definition.key === column),
      )))
      if (cleaned.length) setVisibleColumns(cleaned)
    } catch {
      // ignore corrupted local preference and continue with defaults
    } finally {
      setHasLoadedColumnPreference(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !hasLoadedColumnPreference) return
    try {
      window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibleColumns))
    } catch {
      // local preference persistence is optional and may be unavailable
    }
  }, [hasLoadedColumnPreference, visibleColumns])

  const tradeTagMap = useMemo(() => buildTradeTagMap(tradeTagItems), [tradeTagItems])
  const accountLabels = useMemo(() => getTradeAccountDisplayLabels(tradeItems, locale), [tradeItems, locale])
  const tableView = useMemo(() => buildTradeTableView(tradeItems, tradeTagMap, filters, sort, requestedPage, pageSize, showReviewOnly ? spotlightTradeIds : undefined), [tradeItems, tradeTagMap, filters, sort, requestedPage, pageSize, showReviewOnly, spotlightTradeIds])
  const displayedTrades = tableView.matches
  const visibleTrades = tableView.rows
  const { page, totalPages, effectiveSort, canSortByPnL } = tableView

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
  const currencyQuality = useMemo(() => summarizeTradeCurrencyQuality(tradeItems), [tradeItems])
  const dateRangeError = getTradeTableDateRangeError(filters, locale)
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
  const pinnedSessions = useMemo(
    () => savedSessions.filter((session) => session.isPinned).slice(0, 3),
    [savedSessions],
  )


  function buildHrefForPage(targetPage: number, tradeId?: string) {
    return buildTradeTableHref(searchParams.toString(), { filters, sort: effectiveSort, page: targetPage, reviewOnly: showReviewOnly, tradeId })
  }

  function selectTrade(tradeId: string) {
    setSelectedTrade(tradeId)
    router.push(buildHrefForPage(page, tradeId), { scroll: false })
  }

  const closeTradeDetail = useCallback(() => {
    if (selectedTrade) lastClosedTradeIdRef.current = selectedTrade
    setSelectedTrade(undefined)
    router.push(buildTradeTableHref(searchParams.toString(), { filters, sort: effectiveSort, page, reviewOnly: showReviewOnly }), { scroll: false })
  }, [filters, effectiveSort, showReviewOnly, page, router, searchParams, selectedTrade])

  function updateFilter<K extends keyof TradeTableFilters>(key: K, value: TradeTableFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
    setRequestedPage(1)
  }

  function applyStatus(status: TradeTableFilters['status']) {
    updateFilter('status', status)
  }

  function resetWorkbench() {
    setFilters(createDefaultTradeTableFilters())
    setSort('newest')
    setRequestedPage(1)
    setShowReviewOnly(false)
    setStatusMessage(null)
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
    const confirmed = window.confirm(text(
      `Trade „${tradeSummary?.market ?? 'Trade'} · ${tradeSummary?.setup ?? ''}“ wirklich löschen?`,
      `Delete “${tradeSummary?.market ?? 'Trade'} · ${tradeSummary?.setup ?? ''}”?`,
    ))
    if (!confirmed) return

    startDeletingTrade(async () => {
      const result = await deleteTradeEntry(selectedTradeDetail.id)
      setStatusMessage({ text: result.message, lang: 'de' })
      if (!result.success || !result.deletedId) return

      setTradeItems((current) => current.filter((trade) => trade.id !== result.deletedId))
      setTradeTagItems((current) => current.filter((tag) => tag.trade_id !== result.deletedId))
      setSelectedTrade(undefined)
      router.replace(buildHrefForPage(page), { scroll: false })
    })
  }

  return (
    <section lang={locale} className="rounded-3xl border border-orange-400/15 bg-white/[0.045] p-4 shadow-2xl sm:p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#b09a7a]">{text('Deine Trades', 'Your trades')}</p>
          <h1 className="mt-2 text-2xl font-semibold text-orange-50 sm:text-3xl">{text('Trade-Journal', 'Trade journal')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {text(
              'Trades prüfen, filtern und direkt im Detail bearbeiten. Fehlende Angaben und die Herkunft deiner Ergebnisse bleiben erkennbar.',
              'Find and edit your trades. See which details are missing and where the results come from.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${buildHrefForPage(page)}&capture=full#trade-editor`} className="rounded-full border border-orange-300/30 bg-orange-400/12 px-3 py-2 text-xs font-medium text-orange-50 transition hover:border-orange-300/45 hover:bg-orange-400/18">
            + Trade
          </Link>
          {brokerFileImportCapability.previewEnabled ? (
            <Link
              href={`${buildHrefForPage(page)}&capture=import#trade-editor`}
              title={importCopy.reason}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
              {importCopy.preview}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="cursor-not-allowed rounded-full border border-white/8 bg-black/20 px-3 py-2 text-xs text-white/40"
            >
              {importCopy.blocked}
            </span>
          )}
          <Link href="/review" className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/70 transition hover:border-white/20 hover:text-white">
            Review
          </Link>
          <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/60">
            {text(`${totalTradeCount} gesamt`, `${totalTradeCount} total`)}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label={text('Treffer', 'Matches')} value={String(displayedTrades.length)} tone="text-white" />
        <MetricTile label={text('Offen', 'Open')} value={String(listSummary.open)} tone="text-emerald-200" />
        <MetricTile label={text('Unvollständig', 'Incomplete')} value={String(listSummary.incomplete)} tone="text-orange-100" />
        <MetricTile label={text('Mit Bild', 'With image')} value={String(listSummary.screenshots)} tone="text-sky-200" />
      </div>

      <TradeCurrencyQualityPanel summary={currencyQuality} selected={filters.currencyCheck} onChange={value => updateFilter('currencyCheck', value)} />
      <TradeCurrencyCorrection editingTrade={Boolean(searchParams.get('editTradeId') || searchParams.get('closeTradeId') || searchParams.get('capture'))} />

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
                aria-pressed={showReviewOnly}
                onClick={() => { setShowReviewOnly((current) => !current); setRequestedPage(1) }}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${showReviewOnly ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100' : 'border-white/10 bg-black/25 text-white/75 hover:border-white/25 hover:text-white'}`}
              >
                {showReviewOnly ? text('Alle sichtbaren Trades', 'All visible trades') : text('Nur Review-Treffer', 'Review matches only')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!reviewContext && pinnedSessions.length ? (
        <nav aria-label={text('Angepinnte Review-Sessions', 'Pinned review collections')} className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-black/20 p-3">
          <span className="mr-1 text-[10px] uppercase tracking-[0.18em] text-white/35">{text('Gespeicherte Views', 'Saved views')}</span>
          {pinnedSessions.map((session) => (
            <Link
              key={session.id}
              href={`/trades?reviewSession=${encodeURIComponent(session.id)}`}
              prefetch={false}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65 transition hover:border-orange-300/30 hover:text-white"
            >
              {session.title} · {session.tradeCount}
            </Link>
          ))}
          <Link href="/review" className="rounded-full border border-transparent px-2 py-1.5 text-xs text-[#f0a855] transition hover:border-[#c8823a]/25">
            {text('Alle Reviews', 'All reviews')}
          </Link>
        </nav>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          <ToolbarButton
            label={showMoreFilters ? text('Filter zu', 'Hide filters') : text('Filter', 'Filters')}
            icon="filter"
            onClick={() => setShowMoreFilters((current) => !current)}
            active={showMoreFilters}
            title={text('Filter ein- oder ausblenden', 'Show or hide filters')}
            ariaExpanded={showMoreFilters}
            ariaControls="trade-more-filters"
          />
          <ToolbarButton
            label={showColumnsMenu ? text('Spalten zu', 'Hide columns') : text('Spalten', 'Columns')}
            icon="columns"
            onClick={() => setShowColumnsMenu((current) => !current)}
            active={showColumnsMenu}
            title={text('Sichtbare Spalten wählen', 'Choose visible columns')}
            ariaExpanded={showColumnsMenu}
            ariaControls="trade-columns-menu"
          />
          <ToolbarButton
            label={isExporting ? text('Exportiert …', 'Exporting …') : 'CSV'}
            icon="upload"
            onClick={() => {
              startExporting(async () => {
                if (typeof window === 'undefined') return

                const headers = [
                  'account', 'asset', 'date', 'session', 'grund', 'strategie', 'status', 'trade_state', 'trust', 'direction', 'result', 'net_pnl', 'r_value', 'r_source', 'has_screenshot', 'tag_count', 'trade_id',
                ]
                const rows = displayedTrades.map((trade) => {
                  const tags = tradeTagMap[trade.id] ?? []
                  const trustMeta = getTradeTrustMeta(trade)
                  const status = trade.captureResult === 'open' ? 'Offen' : trade.captureStatus === 'incomplete' ? 'Unvollständig' : 'Geschlossen'
                  return [getTradeAccountLabel(trade), trade.market, trade.date, trade.session || '', trade.concept || trade.emotion || '', trade.setup || '', status, trade.captureStatus || '', trustMeta.shortLabel, trade.direction || '', trade.result || '', trade.netPnL ?? '', getTradeRValue(trade) ?? '', trade.rSource ?? '', (trade.screenshotCount ?? 0) > 0 ? 'yes' : 'no', tags.length, trade.id].map(escapeCsvCell).join(',')
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
                setStatusMessage({
                  text: text(`${displayedTrades.length} Trades als CSV exportiert.`, `${displayedTrades.length} ${displayedTrades.length === 1 ? 'trade' : 'trades'} exported as CSV.`),
                  lang: locale,
                })
              })
            }}
            title={text('Alle gefilterten Treffer als CSV exportieren', 'Export all matching trades as CSV')}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <input
              aria-label={text('Trades durchsuchen', 'Search trades')}
              aria-describedby="trade-search-help"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder={text('Z. B. BTC London', 'e.g. BTC London')}
              className="w-full min-w-0 rounded-2xl border border-orange-400/15 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
            />
            <p id="trade-search-help" className="mt-2 text-xs text-white/50">
              {text('Suche nach Konto, Markt, Setup oder Tag. Alle Begriffe müssen zum selben Trade passen.', 'Search by account, market, setup or tag. All terms must match the same trade.')}
            </p>
          </div>
          <select
            aria-label={text('Trades sortieren', 'Sort trades')}
            value={effectiveSort}
            onChange={(event) => { setSort(event.target.value as TradeTableSort); setRequestedPage(1) }}
            className="rounded-2xl border border-orange-400/15 bg-black/35 px-4 py-3 text-sm text-white outline-none"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.value.startsWith('pnl-') && !canSortByPnL} className="bg-black text-white">
                {option[locale]}
              </option>
            ))}
          </select>
        </div>
        {!canSortByPnL && displayedTrades.length > 0 ? <p className="text-xs text-white/50">{text('P&L-Sortierung benötigt eine gemeinsame bekannte Kontowährung. Bitte grenze die Auswahl über das Konto ein.', 'Sorting by P&L requires one known account currency. Filter by account to narrow your results.')}</p> : null}
      </div>

      <fieldset className="mt-4 min-w-0 rounded-2xl border border-white/10 bg-black/25 p-4">
        <legend className="px-2 text-xs font-medium text-white/70">{text('Zeitraum', 'Date range')}</legend>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-white/65">
            {text('Von', 'From')}
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(event) => updateFilter('dateFrom', event.target.value)}
              aria-invalid={Boolean(dateRangeError)}
              aria-describedby={dateRangeError ? 'trade-date-range-help trade-date-range-error' : 'trade-date-range-help'}
              className="mt-1 block w-full min-w-0 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white [color-scheme:dark]"
            />
          </label>
          <label className="min-w-0 text-xs text-white/65">
            {text('Bis', 'To')}
            <input
              type="date"
              value={filters.dateTo}
              onChange={(event) => updateFilter('dateTo', event.target.value)}
              aria-invalid={Boolean(dateRangeError)}
              aria-describedby={dateRangeError ? 'trade-date-range-help trade-date-range-error' : 'trade-date-range-help'}
              className="mt-1 block w-full min-w-0 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white [color-scheme:dark]"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['today', text('Heute', 'Today')],
            ['last-seven-days', text('Letzte 7 Tage', 'Last 7 days')],
            ['this-month', text('Dieser Monat', 'This month')],
          ] as const).map(([preset, label]) => (
            <button key={preset} type="button" onClick={() => { setFilters((current) => ({ ...current, ...createTradeTableDateRange(preset) })); setRequestedPage(1) }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => { setFilters((current) => ({ ...current, dateFrom: '', dateTo: '' })); setRequestedPage(1) }}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white">
            {text('Zeitraum aufheben', 'Clear dates')}
          </button>
        </div>
        <p id="trade-date-range-help" className="mt-2 text-xs text-white/50">
          {text('Beide Tage eingeschlossen · Europe/Berlin · Filter und Sortierung gelten für das gesamte Journal.', 'Both dates included · Europe/Berlin · Filters and sorting apply to the whole journal.')}
        </p>
        {dateRangeError ? <p id="trade-date-range-error" role="alert" className="mt-2 text-xs text-red-200">{dateRangeError}</p> : null}
      </fieldset>

      {isEditorOpen ? (
        <div className="mt-4 rounded-2xl border border-orange-300/20 bg-orange-400/10 px-4 py-3 text-sm text-orange-50/90">
          {text('Editor aktiv', 'Editor open')}
        </div>
      ) : null}

      {showColumnsMenu ? (
        <div id="trade-columns-menu" className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>

            </div>
            <button
              type="button"
              onClick={() => setVisibleColumns(defaultVisibleColumns)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/20 hover:text-white"
            >
{text('Standard', 'Default')}
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
                  <span>{column[locale]}</span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { label: text('Offen', 'Open'), value: 'Offen' as const, tone: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200', count: listSummary.open },
          { label: text('Unvollständig', 'Incomplete'), value: 'Unvollständig' as const, tone: 'border-orange-400/20 bg-orange-400/10 text-orange-100/85', count: listSummary.incomplete },
          { label: text('Geschlossen', 'Closed'), value: 'Geschlossen' as const, tone: 'border-white/10 bg-white/5 text-white/75', count: listSummary.closed },
          { label: text('Alle', 'All'), value: 'Alle' as const, tone: 'border-white/10 bg-black/30 text-white/75', count: displayedTrades.length },
        ].map((tab) => {
          const isActive = filters.status === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={isActive}
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
          {text('Reset', 'Reset filters')}{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {showMoreFilters ? (
        <div id="trade-more-filters" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label={text('Konto', 'Account')} value={filters.account} onChange={(value) => updateFilter('account', value)} options={accountOptions} optionLabels={accountLabels} />
          <FilterSelect label={text('Markt', 'Market')} value={filters.market} onChange={(value) => updateFilter('market', value)} options={marketOptions} />
          <FilterSelect label="Setup" value={filters.setup} onChange={(value) => updateFilter('setup', value)} options={setupOptions} />
          <FilterSelect label="Session" value={filters.session} onChange={(value) => updateFilter('session', value)} options={sessionOptions} />
          <FilterSelect label="Tag" value={filters.tag} onChange={(value) => updateFilter('tag', value)} options={tagOptions} />
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-orange-400/15 bg-black/30">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm text-white/60">{text(`${visibleTrades.length} auf Seite ${page} · ${displayedTrades.length} Treffer · ${tradeItems.length} gesamt`, `${visibleTrades.length} on page ${page} · ${displayedTrades.length} matches · ${tradeItems.length} total`)}</p>
            {selectedTradeSummary ? <p className="text-xs text-white/40">{getTradeAccountLabel(selectedTradeSummary, locale)} · {selectedTradeSummary.market} · {selectedTradeSummary.setup || text('Ohne Setup', 'No setup')}</p> : null}
          </div>

          {visibleTrades.length ? (
            <>
            <div className="space-y-3 p-3 md:hidden">
              {visibleTrades.map((trade) => (
                <MobileTradeCard
                  key={trade.id}
                  detailHref={buildHrefForPage(page, trade.id)}
                  trade={trade}
                  tags={tradeTagMap[trade.id] ?? []}
                  isSelected={selectedTrade === trade.id}
                  isEditing={activeEditTradeId === trade.id}
                  isClosing={activeCloseTradeId === trade.id}
                  onSelect={() => selectTrade(trade.id)}
                />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="border-b border-white/10 bg-black/35 text-left text-[11px] uppercase tracking-[0.18em] text-white/40">
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column} className="px-4 py-3 font-medium whitespace-nowrap">{columnDefinitions.find((definition) => definition.key === column)?.[locale]}</th>
                    ))}
                    <th className="px-4 py-3 font-medium whitespace-nowrap text-right">{text('Aktion', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleTrades.map((trade) => {
                    const isSelected = selectedTrade === trade.id
                    const tags = tradeTagMap[trade.id] ?? []
                    return (
                      <tr
                        key={trade.id}
                        onClick={() => selectTrade(trade.id)}
                        className={`cursor-pointer align-top transition hover:bg-white/5 ${isSelected ? 'bg-orange-400/10' : ''}`}
                      >
                        {visibleColumns.map((column) => (
                          <td key={`${trade.id}-${column}`} className="px-4 py-3 text-white/75">
                            <TradeTableCell column={column} trade={trade} tagCount={tags.length} />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                          <RowActions
                            detailHref={buildHrefForPage(page, trade.id)}
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
            </>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-white/50">{text('Keine Trades.', 'No trades.')}</div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">{text(`Seite ${page} von ${totalPages} · maximal ${pageSize} Trades pro Seite · ${displayedTrades.length} Treffer im gesamten Journal.`, `Page ${page} of ${totalPages} · up to ${pageSize} trades per page · ${displayedTrades.length} matches in the journal.`)}</p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={buildHrefForPage(page - 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white">{text('Zurück', 'Previous')}</Link>
              ) : (
                <span className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-white/25">{text('Zurück', 'Previous')}</span>
              )}
              <span className="rounded-full border border-orange-300/20 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-100">{page} / {totalPages}</span>
              {page < totalPages ? (
                <Link href={buildHrefForPage(page + 1)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 transition hover:border-white/20 hover:text-white">{text('Weiter', 'Next')}</Link>
              ) : (
                <span className="rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-white/25">{text('Weiter', 'Next')}</span>
              )}
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div role="status" aria-live="polite" lang={statusMessage.lang} className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/65">{statusMessage.text}</div>
        ) : null}
      </div>

      <TradeDetailDrawer
        trade={selectedTradeSummary}
        detail={selectedTradeDetail?.detail}
        tags={selectedTradeDetail?.tags ?? []}
        tradeId={isEditorOpen ? undefined : selectedTrade}
        error={selectedTrade === selectedTradeId ? tradeDetailError : undefined}
        detailHref={selectedTrade ? buildHrefForPage(page, selectedTrade) : undefined}
        tagOptions={tagOptions}
        source={source}
        isLoading={Boolean(selectedTrade && !tradeDetailError && (!selectedTradeDetail || selectedTrade !== selectedTradeId))}
        onClose={closeTradeDetail}
        onDelete={handleDeleteSelectedTrade}
        isDeleting={isDeletingTrade}
      />
    </section>
  )
}


function StreakPulseCard({ streak, tone }: { streak: ReturnType<typeof buildStreakMetrics>; tone: ReturnType<typeof getStreakTone> }) {
  const text = journalText(useJournalLocale())
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
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/40">{text('Aktuelle Serie', 'Current streak')}</p>
          <h3 className={`mt-2 text-xl font-semibold ${titleTone}`}>{getStreakTitle(streak, text)}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{getStreakHint(streak, text)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <StreakMiniStat label={text('Heute', 'Today')} value={getTodayLabel(streak, text)} />
          <StreakMiniStat label={text('Gewinnserie', 'Win streak')} value={streak.longestWinStreak ? String(streak.longestWinStreak) : '—'} />
          <StreakMiniStat label={text('Verlustserie', 'Loss streak')} value={streak.longestLossStreak ? String(streak.longestLossStreak) : '—'} />
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

function ToolbarButton({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  title,
  ariaExpanded,
  ariaControls,
}: {
  label: string
  icon: IconName
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  title?: string
  ariaExpanded?: boolean
  ariaControls?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition ${disabled ? 'cursor-not-allowed border-white/10 bg-black/20 text-white/30' : active ? 'border-orange-300/35 bg-orange-400/10 text-white' : 'border-white/10 bg-black/30 text-white/75 hover:border-white/20 hover:text-white'}`}
    >
      <span aria-hidden="true" className="rounded-xl border border-white/8 bg-white/[0.03] p-1.5"><WorkspaceIcon icon={icon} /></span>
      <span>{label}</span>
    </button>
  )
}

function FilterSelect({ label, value, onChange, options, optionLabels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; optionLabels?: ReadonlyMap<string, string> }) {
  const text = journalText(useJournalLocale())
  return (
    <label className="rounded-2xl border border-orange-400/15 bg-black/35 p-4">
      <span className="text-xs uppercase tracking-[0.2em] text-white/40">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-3 w-full rounded-2xl border border-orange-400/15 bg-orange-400/5 px-4 py-3 text-sm text-white outline-none">
        <option value="Alle" className="bg-black text-white">
          {text('Alle', 'All')}
        </option>
        {options.map((option) => (
          <option key={option} value={option} className="bg-black text-white">
            {optionLabels?.get(option) ?? option}
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

function TradeTableCell({ column, trade, tagCount }: { column: ColumnKey; trade: Trade; tagCount: number }) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const trustMeta = getTradeTrustMeta(trade, locale)
  if (column === 'account') {
    return <span className="whitespace-nowrap text-white/70">{getTradeAccountLabel(trade, locale)}</span>
  }

  if (column === 'asset') {
    return (
      <div className="min-w-[160px]">
        <p className="font-medium text-white">{trade.market}</p>
        <p className="mt-1 text-xs text-white/45">{formatDirection(trade.direction, locale)} · {tagCount > 0 ? `${tagCount} Tag${tagCount === 1 ? '' : 's'}` : text('ohne Tags', 'No tags')}</p>
      </div>
    )
  }

  if (column === 'date') {
    return <span className="whitespace-nowrap text-white/70">{formatJournalTradeDate(trade, locale)}</span>
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
          {trade.captureResult === 'open' ? text('Offen', 'Open') : trade.captureStatus === 'incomplete' ? text('Unvollständig', 'Incomplete') : text('Geschlossen', 'Closed')}
        </Pill>
        <p className={`text-xs ${trustMeta.tone === 'red' ? 'text-red-200/80' : trustMeta.tone === 'orange' ? 'text-orange-100/75' : trustMeta.tone === 'emerald' ? 'text-emerald-200/80' : 'text-white/45'}`}>{trustMeta.shortLabel}</p>
      </div>
    )
  }

  if (column === 'bild') {
    const count = trade.screenshotCount ?? 0
    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${count > 0 ? 'border-white/10 bg-white/5 text-white/75' : 'border-white/10 bg-black/20 text-white/35'}`}>
        {count > 0 ? text(`${count} Bild${count === 1 ? '' : 'er'}`, `${count} ${count === 1 ? 'image' : 'images'}`) : '—'}
      </span>
    )
  }

  if (column === 'ergebnis') {
    return (
      <div className="min-w-[110px] text-right">
        <p className={`font-medium ${trade.netPnL === undefined || trade.netPnL === null ? 'text-white/55' : trade.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatJournalTradeResult(trade, locale)}</p>
        <p className="mt-1 text-xs text-white/40">{formatJournalTradeR(trade, locale)}</p>
      </div>
    )
  }

  return <span className="text-white/60">—</span>
}

function MobileTradeCard({
  detailHref,
  trade,
  tags,
  isSelected,
  isEditing,
  isClosing,
  onSelect,
}: {
  detailHref: string
  trade: Trade
  tags: string[]
  isSelected: boolean
  isEditing: boolean
  isClosing: boolean
  onSelect: () => void
}) {
  const locale = useJournalLocale()
  const text = journalText(locale)
  const trustMeta = getTradeTrustMeta(trade, locale)
  const status = trade.captureResult === 'open'
    ? text('Offen', 'Open')
    : trade.captureStatus === 'incomplete'
      ? text('Unvollständig', 'Incomplete')
      : text('Geschlossen', 'Closed')
  const statusTone = trade.captureResult === 'open'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
    : trade.captureStatus === 'incomplete'
      ? 'border-orange-400/20 bg-orange-400/10 text-orange-100'
      : 'border-white/10 bg-white/5 text-white/65'

  return (
    <article className={`rounded-2xl border p-4 transition ${isSelected ? 'border-orange-300/35 bg-orange-400/10' : 'border-white/8 bg-black/25'}`}>
      <button
        type="button"
        data-trade-detail-trigger={trade.id}
        onClick={onSelect}
        className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-base font-semibold text-white">{trade.market}</p>
            <p className="mt-1 break-words text-xs text-white/45">{getTradeAccountLabel(trade, locale)} · {trade.setup || text('Ohne Setup', 'No setup')}</p>
          </div>
          <div className="text-right">
            <p className={`text-sm font-semibold ${trade.netPnL === undefined || trade.netPnL === null ? 'text-white/50' : trade.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
              {formatJournalTradeResult(trade, locale)}
            </p>
            <p className="mt-1 text-[11px] text-white/35">{formatJournalTradeR(trade, locale)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusTone}`}>{status}</span>
          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-white/55">{formatDirection(trade.direction, locale)}</span>
          {tags.length ? <span className="rounded-full border border-sky-300/15 bg-sky-300/8 px-2.5 py-1 text-[11px] text-sky-100/75">{tags.length} Tag{tags.length === 1 ? '' : 's'}</span> : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/8 pt-3 text-xs">
          <span><span className="block text-[10px] uppercase tracking-[0.14em] text-white/30">{text('Datum', 'Date')}</span><span className="mt-1 block text-white/65">{formatJournalTradeDate(trade, locale)}</span></span>
          <span><span className="block text-[10px] uppercase tracking-[0.14em] text-white/30">{text('Datenstatus', 'Data status')}</span><span className="mt-1 block text-white/65">{trustMeta.shortLabel}</span></span>
        </div>
      </button>

      <div className="mt-4 border-t border-white/8 pt-3">
        <RowActions detailHref={detailHref} trade={trade} isSelected={isSelected} isEditing={isEditing} isClosing={isClosing} />
      </div>
    </article>
  )
}

function RowActions({ detailHref, trade, isSelected, isEditing, isClosing }: { detailHref: string; trade: Trade; isSelected: boolean; isEditing: boolean; isClosing: boolean }) {
  const text = journalText(useJournalLocale())
  const isOpenTrade = trade.captureResult === 'open'
  const actionLabel = isOpenTrade ? text('Schließen', 'Close trade') : trade.captureStatus === 'incomplete' ? text('Vervollständigen', 'Complete') : text('Bearbeiten', 'Edit')
  const actionHref = isOpenTrade
    ? `${detailHref}&closeTradeId=${encodeURIComponent(trade.id)}#trade-editor`
    : `${detailHref}&editTradeId=${encodeURIComponent(trade.id)}#trade-editor`
  const completeHref = `${detailHref}&editTradeId=${encodeURIComponent(trade.id)}#trade-editor`
  const active = isOpenTrade ? isClosing : isEditing

  return (
    <div className="flex min-w-[190px] flex-wrap justify-end gap-2">
      <Link
        href={detailHref}
        data-trade-detail-trigger={trade.id}
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
          {text('Ergänzen', 'Add details')}
        </Link>
      ) : null}
      <Link
        href={actionHref}
        prefetch={false}
        className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100' : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100/90 hover:border-emerald-300/35 hover:bg-emerald-400/15'}`}
      >
        {active ? text('Im Editor', 'Editing') : actionLabel}
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

function formatDirection(direction: Trade['direction'], locale: JournalLocale) {
  if (direction === 'long') return 'Long'
  if (direction === 'short') return 'Short'
  return journalText(locale)('Neutral', 'No direction')
}
