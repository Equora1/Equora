import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { QuickTradeForm } from '@/components/trades/quick-trade-form'
import { TradeLedgerCapture } from '@/components/trades/trade-ledger-capture'
import { TradeForm } from '@/components/trades/trade-form'
import { TradesWorkbench } from '@/components/trades/trades-workbench'
import { TradeCaptureDeck } from '@/components/trades/trade-capture-deck'
import { CloseTradeForm } from '@/components/trades/close-trade-form'
import { TradeImportPanel } from '@/components/trades/trade-import-panel'
import { getJournalAccess } from '@/lib/server/auth'
import { getTradesSnapshotServer } from '@/lib/server/journal'
import { getTradeByIdServer, getTradeCountServer, getTradeMediaCountsServer, getTradeMediaServer, getTradeTagsServer } from '@/lib/server/trades'
import { getReviewSessionByIdServer, getReviewSessionsServer } from '@/lib/server/review-sessions'
import { getUserCostProfilesServer } from '@/lib/server/user-cost-profiles'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import { extractTradeImportMeta } from '@/lib/utils/trade-import-meta'
import { formatTradeTimeInputValue } from '@/lib/utils/trade-time'
import type { TradeMediaRow, TradeRow } from '@/lib/types/db'
import {

  buildTradeTagMap,
  createDefaultTradeTableFilters,
  filterTradeTableRows,
  getTradeWeekdayLabel,
  type TradeTableFilters,
} from '@/lib/utils/trade-table'
import { buildLinkedSetupByTradeId } from '@/lib/utils/trade-setup-links'
import { getAccountOptionLabels } from '@/lib/utils/account-context'
import { measurePerformance, measurePerformanceSync } from '@/lib/server/performance'


export const dynamic = 'force-dynamic'

const defaultMarkets = ['NASDAQ', 'DAX', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'BTC/USD']
const defaultEmotions = ['Fokussiert', 'Ruhig', 'Selbstbewusst', 'Unsicher', 'Gestresst', 'Gierig', 'Diszipliniert']
const defaultBiases = ['Long', 'Short', 'Neutral / Beobachten']
const defaultRuleFlags = ['Kein Regelverstoß', 'Regelkonform', 'Zu früher Entry', 'FOMO-Entry', 'Stop zu eng', 'Overtrading']
const defaultTags = ['FOMO', 'Zu früh', 'News', 'Overtrade', 'Regelkonform', 'Geduldig', 'Chase', 'A-Setup', 'B-Setup', 'Impulsiv', 'Diszipliniert']

type TradesSearchParams = Record<string, string | string[] | undefined>

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0]
  return value
}

function parseCsvList(value: string | undefined, separators = /[|,]/) {
  if (!value) return []

  return value
    .split(separators)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseRequiredTags(value: string | undefined) {
  return parseCsvList(value, /[,]/)
}

function toFormFieldValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? '' : String(value)
}

function buildTradeFormInitialValues(
  row: TradeRow,
  tags: string[],
  mediaRows: TradeMediaRow[],
  linkedSetup?: { id: string; title: string } | null,
) {
  const partialExits = Array.isArray(row.partial_exits) ? row.partial_exits : []
  const cleanNotes = extractTradeImportMeta(row.notes).cleanNotes
  return {
    market: row.market,
    setup: linkedSetup?.title ?? row.setup,
    setupId: linkedSetup?.id ?? '',
    emotion: row.emotion ?? '',
    bias: row.bias ?? '',
    ruleCheck: row.rule_check ?? '',
    reviewRepeatability: row.review_repeatability ?? '',
    reviewState: row.review_state ?? '',
    reviewLesson: row.review_lesson ?? '',
    tradeOccurredAt: formatTradeTimeInputValue(row.captured_at ?? row.created_at),
    entry: toFormFieldValue(row.entry),
    stopLoss: toFormFieldValue(row.stop_loss),
    takeProfit: toFormFieldValue(row.take_profit),
    exit: toFormFieldValue(row.exit),
    netPnL: toFormFieldValue(row.net_pnl),
    riskPercent: toFormFieldValue(row.risk_percent),
    accountSize: toFormFieldValue(row.account_size),
    rMultiple: toFormFieldValue(row.r_multiple),
    pnlMode: row.pnl_mode ?? 'manual',
    costProfile: row.cost_profile ?? 'manual',
    brokerProfile: row.broker_profile ?? 'manual',
    instrumentType: row.instrument_type ?? 'unknown',
    accountTemplate: row.account_template ?? 'manual',
    marketTemplate: row.market_template ?? 'manual',
    positionSize: toFormFieldValue(row.position_size),
    pointValue: toFormFieldValue(row.point_value),
    fees: toFormFieldValue(row.fees),
    exchangeFees: toFormFieldValue(row.exchange_fees),
    fundingFees: toFormFieldValue(row.funding_fees),
    fundingRateBps: toFormFieldValue(row.funding_rate_bps),
    fundingIntervals: toFormFieldValue(row.funding_intervals),
    spreadCost: toFormFieldValue(row.spread_cost),
    slippage: toFormFieldValue(row.slippage),
    accountCurrency: row.account_currency ?? '',
    cryptoMarketType: row.crypto_market_type ?? 'manual',
    executionType: row.execution_type ?? 'manual',
    fundingDirection: row.funding_direction ?? 'manual',
    quoteAsset: row.quote_asset ?? '',
    leverage: toFormFieldValue(row.leverage),
    partialExit1Percent: toFormFieldValue(partialExits[0]?.percent),
    partialExit1Price: toFormFieldValue(partialExits[0]?.price),
    partialExit2Percent: toFormFieldValue(partialExits[1]?.percent),
    partialExit2Price: toFormFieldValue(partialExits[1]?.price),
    partialExit3Percent: toFormFieldValue(partialExits[2]?.percent),
    partialExit3Price: toFormFieldValue(partialExits[2]?.price),
    userCostProfileId: row.user_cost_profile_id ?? '',
    notes: cleanNotes,
    screenshotUrl: row.screenshot_url ?? '',
    screenshotUrls: mediaRows.map((media) => media.public_url),
    mediaItems: mediaRows.map((media) => ({
      id: media.id,
      tradeId: media.trade_id,
      storagePath: media.storage_path,
      publicUrl: media.public_url,
      fileName: media.file_name,
      mimeType: media.mime_type,
      byteSize: media.byte_size,
      sortOrder: media.sort_order ?? 0,
      isPrimary: media.is_primary ?? false,
      createdAt: media.created_at,
    })),
    tags,
    captureStatus: row.capture_status ?? 'complete',
  }
}


function buildTradeMediaMap(mediaRows: TradeMediaRow[]) {
  return mediaRows.reduce<Record<string, TradeMediaRow[]>>((accumulator, mediaRow) => {
    if (!accumulator[mediaRow.trade_id]) accumulator[mediaRow.trade_id] = []
    accumulator[mediaRow.trade_id].push(mediaRow)
    return accumulator
  }, {})
}

function buildInitialFilters(params: TradesSearchParams): TradeTableFilters {
  const filters = createDefaultTradeTableFilters()

  const assignIfPresent = <K extends keyof TradeTableFilters>(key: K, value: TradeTableFilters[K] | undefined) => {
    if (value === undefined || value === null) return
    filters[key] = value
  }

  assignIfPresent('search', getParamValue(params.search) ?? undefined)
  assignIfPresent('market', getParamValue(params.market) ?? undefined)
  assignIfPresent('account', getParamValue(params.account) ?? undefined)
  assignIfPresent('setup', getParamValue(params.setup) ?? undefined)
  assignIfPresent('session', getParamValue(params.session) ?? undefined)
  assignIfPresent('concept', getParamValue(params.concept) ?? undefined)
  assignIfPresent('quality', getParamValue(params.quality) ?? undefined)
  assignIfPresent('emotion', getParamValue(params.emotion) ?? undefined)
  assignIfPresent('tag', getParamValue(params.tag) ?? undefined)
  assignIfPresent('weekday', getParamValue(params.weekday) ?? undefined)
  assignIfPresent('tagging', getParamValue(params.tagging) as TradeTableFilters['tagging'] | undefined)
  assignIfPresent('outcome', getParamValue(params.outcome) as TradeTableFilters['outcome'] | undefined)
  assignIfPresent('direction', getParamValue(params.direction) as TradeTableFilters['direction'] | undefined)
  assignIfPresent('status', getParamValue(params.status) as TradeTableFilters['status'] | undefined)

  const requiredTags = parseRequiredTags(getParamValue(params.tags))
  if (requiredTags.length > 1) {
    filters.requiredTags = requiredTags
  } else if (requiredTags.length === 1 && filters.tag === 'Alle') {
    filters.tag = requiredTags[0]
  }

  return filters
}

function buildReviewContext(
  params: TradesSearchParams,
  filters: TradeTableFilters,
  spotlightTotalCount = 0,
  overrides?: { title?: string; description?: string; chips?: string[] },
) {
  const reviewFocus = getParamValue(params.reviewFocus)
  const chips = [...(overrides?.chips ?? [])]

  if (filters.market !== 'Alle') chips.push(`Markt: ${filters.market}`)
  if (filters.account !== 'Alle') chips.push(`Konto: ${filters.account}`)
  if (filters.setup !== 'Alle') chips.push(`Setup: ${filters.setup}`)
  if (filters.session !== 'Alle') chips.push(`Session: ${filters.session}`)
  if (filters.concept !== 'Alle') chips.push(`Konzept: ${filters.concept}`)
  if (filters.quality !== 'Alle') chips.push(`Qualität: ${filters.quality}`)
  if (filters.emotion !== 'Alle') chips.push(`Emotion: ${filters.emotion}`)
  if (filters.tag !== 'Alle') chips.push(`Tag: ${filters.tag}`)
  if (filters.requiredTags.length) chips.push(`Tag-Kombi: ${filters.requiredTags.join(' + ')}`)
  if (filters.weekday !== 'Alle') chips.push(`Wochentag: ${filters.weekday}`)
  if (filters.tagging !== 'Alle') chips.push(`Tagging: ${filters.tagging}`)
  if (filters.outcome !== 'Alle') chips.push(`Ausgang: ${filters.outcome}`)
  if (filters.direction !== 'Alle') chips.push(`Richtung: ${filters.direction}`)
  if (filters.status !== 'Alle') chips.push(`Status: ${filters.status}`)
  if (filters.search.trim()) chips.push(`Suche: ${filters.search}`)
  if (spotlightTotalCount > 0) chips.push(`Spotlight: ${spotlightTotalCount} Treffer`)

  const uniqueChips = Array.from(new Set(chips))
  if (!reviewFocus && !overrides?.title && uniqueChips.length === 0) return undefined

  return {
    title: overrides?.title ?? reviewFocus ?? 'Review aktiv',
    description: overrides?.description ?? (spotlightTotalCount > 0
      ? 'Aus Review geöffnet.'
      : 'Aus Review gefiltert.'),
    chips: uniqueChips,
  }
}

export default async function TradesPage({ searchParams }: { searchParams?: Promise<TradesSearchParams> }) {
  const params = (await searchParams) ?? {}
  const reviewFocus = getParamValue(params.reviewFocus)
  const reviewSessionId = getParamValue(params.reviewSession)
  const requestedPage = Number.parseInt(getParamValue(params.page) ?? '1', 10)
  const pageSize = 30
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const offset = (page - 1) * pageSize
  const access = await getJournalAccess()

  const [snapshot, savedSessions, userCostProfiles, totalTradeCount] = await Promise.all([
    getTradesSnapshotServer(access.user?.id, { limit: pageSize, offset }),
    measurePerformance('database.review_sessions.recent', 'database', () => getReviewSessionsServer(access.user?.id), { route: '/trades' }),
    measurePerformance('database.user_cost_profiles', 'database', () => getUserCostProfilesServer(access.user?.id), { route: '/trades' }),
    measurePerformance('database.trade_count', 'database', () => getTradeCountServer(access.user?.id), { route: '/trades' }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalTradeCount / pageSize))
  if (totalTradeCount > 0 && page > totalPages) {
    redirect(`/trades?page=${totalPages}`)
  }

  const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
  const mediaCounts = await measurePerformance('database.trade_media_counts', 'database', () => getTradeMediaCountsServer(snapshot.tradeRows.map((row) => row.id), access.user?.id), { route: '/trades', meta: { trades: snapshot.tradeRows.length } })
  const trades = measurePerformanceSync('transform.trades.page', 'transform', () => snapshot.tradeRows.map((row) => {
    const trade = mapTradeRowToTrade(row, [], linkedSetupByTradeId[row.id] ?? null)
    const mediaCount = mediaCounts[row.id] ?? (row.screenshot_url ? 1 : 0)
    return {
      ...trade,
      screenshotCount: mediaCount,
      screenshotUrls: row.screenshot_url ? [row.screenshot_url] : [],
      screenshotUrl: row.screenshot_url ?? undefined,
    }
  }), { route: '/trades', meta: { trades: snapshot.tradeRows.length } })
  const initialFilters = buildInitialFilters(params)

  let spotlightTradeIds: string[] = []
  let spotlightTotalCount = 0
  let reviewContext = buildReviewContext(params, initialFilters, 0)

  if (reviewSessionId) {
    const session = await getReviewSessionByIdServer(reviewSessionId, access.user?.id)
    if (session) {
      spotlightTradeIds = session.tradeIds
      spotlightTotalCount = session.tradeIds.length
      reviewContext = buildReviewContext(params, initialFilters, spotlightTotalCount, {
        title: session.title,
        description: session.note || session.focusDescription || 'Gespeicherte Session geöffnet.',
        chips: [
          `Archiv: ${session.tradeCount} Trades`,
          ...session.chips,
          ...session.topTags.slice(0, 3).map((tag) => `Top-Tag: ${tag}`),
        ],
      })
    }
  } else {
    const directReviewTradeIds = parseCsvList(getParamValue(params.reviewTradeIds))
    if (directReviewTradeIds.length) {
      spotlightTradeIds = directReviewTradeIds
      spotlightTotalCount = directReviewTradeIds.length
      reviewContext = buildReviewContext(params, initialFilters, spotlightTotalCount, {
        title: getParamValue(params.reviewTitle) ?? reviewFocus ?? 'Gespeicherte Spotlight-Session',
        description: getParamValue(params.reviewDescription) ?? 'Review geöffnet.',
        chips: parseCsvList(getParamValue(params.reviewChips)),
      })
    } else {
      const drilldownSpotlightTrades = reviewFocus ? filterTradeTableRows(trades, buildTradeTagMap(snapshot.tradeTags), initialFilters) : []
      spotlightTradeIds = drilldownSpotlightTrades.map((trade) => trade.id).slice(0, 12)
      spotlightTotalCount = drilldownSpotlightTrades.length
      reviewContext = buildReviewContext(params, initialFilters, spotlightTotalCount)
    }
  }

  const editTradeId = getParamValue(params.editTradeId)
  const closeTradeId = getParamValue(params.closeTradeId)
  const captureModeRaw = getParamValue(params.capture)
  const activeCaptureMode = captureModeRaw === 'quick' || captureModeRaw === 'full' || captureModeRaw === 'import' ? captureModeRaw : undefined
  const selectedTradeId = getParamValue(params.tradeId) ?? closeTradeId ?? editTradeId ?? spotlightTradeIds[0]

  let selectedRow = selectedTradeId ? snapshot.tradeRows.find((row) => row.id === selectedTradeId) : undefined
  if (selectedTradeId && !selectedRow) {
    try {
      selectedRow = await measurePerformance('database.trade_detail', 'database', () => getTradeByIdServer(selectedTradeId, access.user?.id), { route: '/trades' })
    } catch {
      selectedRow = snapshot.tradeRows[0]
    }
  }

  const [selectedMediaRows, selectedTags] = selectedRow
    ? await Promise.all([
        measurePerformance('database.trade_detail_media', 'database', () => getTradeMediaServer(selectedRow.id, access.user?.id), { route: '/trades' }),
        measurePerformance('database.trade_detail_tags', 'database', () => getTradeTagsServer(selectedRow.id, access.user?.id), { route: '/trades' }),
      ])
    : [[], []]

  const editTradeRow = editTradeId && selectedRow?.id === editTradeId ? selectedRow : undefined
  const closeTradeRow = closeTradeId && selectedRow?.id === closeTradeId ? selectedRow : undefined

  const savedSetupOptions = snapshot.setupRows
    .filter((setup) => !setup.is_archived)
    .map((setup) => ({ id: setup.id, title: setup.title }))
  const setupOptions = Array.from(new Set([...savedSetupOptions.map((setup) => setup.title), ...trades.map((trade) => trade.setup)])).filter(Boolean)
  const accountOptions = getAccountOptionLabels(trades)
  const marketOptions = Array.from(new Set([...defaultMarkets, ...snapshot.tradeRows.map((trade) => trade.market)])).filter(Boolean)
  const emotionOptions = Array.from(new Set([...defaultEmotions, ...snapshot.tradeRows.map((trade) => trade.emotion ?? '').filter(Boolean)])).filter(Boolean)
  const tagOptions = Array.from(new Set([...defaultTags, ...snapshot.tradeTags.map((tag) => tag.tag), ...selectedTags.map((tag) => tag.tag)])).filter(Boolean)
  const sessionOptions = Array.from(new Set(snapshot.tradeRows.map((trade) => trade.session ?? '').filter(Boolean)))
  const conceptOptions = Array.from(new Set(snapshot.tradeRows.map((trade) => trade.concept ?? '').filter(Boolean)))
  const weekdayOptions = Array.from(new Set(trades.map(getTradeWeekdayLabel)))

  const selectedLinkedSetup = selectedRow ? linkedSetupByTradeId[selectedRow.id] ?? null : null
  const selectedTradeDetail = selectedRow ? mapTradeRowToTradeDetail(selectedRow, selectedMediaRows, selectedLinkedSetup) : undefined
  const selectedTradeSummary = selectedRow ? mapTradeRowToTrade(selectedRow, selectedMediaRows, selectedLinkedSetup) : undefined

  const editTradeInitialValues = editTradeRow
    ? buildTradeFormInitialValues(editTradeRow, selectedTags.map((tag) => tag.tag), selectedMediaRows, selectedLinkedSetup)
    : undefined

  return (
    <AppShell>
      <div className="space-y-6">
        {!activeCaptureMode && !closeTradeRow && !(editTradeInitialValues && editTradeRow) ? (
          <TradeLedgerCapture marketOptions={marketOptions} setupOptions={setupOptions} emotionOptions={emotionOptions.length ? emotionOptions : defaultEmotions} />
        ) : null}
        {closeTradeRow || (editTradeInitialValues && editTradeRow) || activeCaptureMode ? (
          <section id="trade-editor" className="rounded-3xl border border-orange-300/18 bg-white/[0.05] p-5 shadow-2xl">
            {closeTradeRow ? (
              <CloseTradeForm
                tradeId={closeTradeRow.id}
                market={closeTradeRow.market}
                setup={selectedLinkedSetup?.title ?? closeTradeRow.setup}
                trade={selectedTradeSummary}
                cancelHref={`/trades?page=${page}&tradeId=${encodeURIComponent(closeTradeRow.id)}`}
                editHref={`/trades?page=${page}&tradeId=${encodeURIComponent(closeTradeRow.id)}&editTradeId=${encodeURIComponent(closeTradeRow.id)}#trade-editor`}
              />
            ) : editTradeInitialValues && editTradeRow ? (
              <TradeForm
                key={`edit-${editTradeRow.id}`}
                markets={marketOptions.length ? marketOptions : defaultMarkets}
                setups={setupOptions.length ? setupOptions : ['Liquidity Sweep']}
                savedSetupOptions={savedSetupOptions}
                emotions={emotionOptions.length ? emotionOptions : defaultEmotions}
                biases={defaultBiases}
                ruleFlags={defaultRuleFlags}
                tagOptions={tagOptions}
                initialUserCostProfiles={userCostProfiles}
                mode="edit"
                tradeId={editTradeRow.id}
                initialValues={editTradeInitialValues}
                cancelHref={`/trades?page=${page}&tradeId=${encodeURIComponent(editTradeRow.id)}`}
              />
            ) : (
              <TradeCaptureDeck
                initialMode={activeCaptureMode}
                closeHref={selectedTradeId ? `/trades?page=${page}&tradeId=${encodeURIComponent(selectedTradeId)}` : `/trades?page=${page}`}
                quickCapture={
                  <QuickTradeForm
                    markets={marketOptions.length ? marketOptions : defaultMarkets}
                    setups={setupOptions.length ? setupOptions : ['Liquidity Sweep']}
                    tagOptions={tagOptions}
                  />
                }
                importCapture={<TradeImportPanel />}
                fullCapture={
                  <TradeForm
                    key="create-trade"
                    markets={marketOptions.length ? marketOptions : defaultMarkets}
                    setups={setupOptions.length ? setupOptions : ['Liquidity Sweep']}
                    savedSetupOptions={savedSetupOptions}
                    emotions={emotionOptions.length ? emotionOptions : defaultEmotions}
                    biases={defaultBiases}
                    ruleFlags={defaultRuleFlags}
                    tagOptions={tagOptions}
                    initialUserCostProfiles={userCostProfiles}
                  />
                }
              />
            )}
          </section>
        ) : null}
        <TradesWorkbench
          trades={trades}
          activeTradeDetail={selectedTradeDetail}
          activeTradeSummary={selectedTradeSummary}
          activeTradeTags={selectedTags}
          tradeTags={snapshot.tradeTags}
          selectedTradeId={selectedTradeId}
          tagOptions={tagOptions}
          marketOptions={marketOptions}
          accountOptions={accountOptions}
          setupOptions={setupOptions}
          sessionOptions={sessionOptions}
          conceptOptions={conceptOptions}
          emotionOptions={emotionOptions}
          weekdayOptions={weekdayOptions}
          source={snapshot.source}
          initialFilters={initialFilters}
          reviewContext={reviewContext}
          spotlightTradeIds={spotlightTradeIds}
          spotlightTotalCount={spotlightTotalCount}
          savedSessions={savedSessions}
          isEditorOpen={Boolean(closeTradeRow || (editTradeInitialValues && editTradeRow) || activeCaptureMode)}
          activeEditTradeId={editTradeId}
          activeCloseTradeId={closeTradeId}
          page={page}
          pageSize={pageSize}
          totalTradeCount={totalTradeCount}
          totalPages={totalPages}
        />
      </div>
    </AppShell>
  )
}
