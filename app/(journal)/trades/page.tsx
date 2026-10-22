import { AppShell } from '@/components/layout/app-shell'
import { QuickTradeForm } from '@/components/trades/quick-trade-form'
import { TradeLedgerCapture } from '@/components/trades/trade-ledger-capture'
import { TradeForm } from '@/components/trades/trade-form'
import { TradesWorkbench } from '@/components/trades/trades-workbench'
import { TradeCaptureDeck } from '@/components/trades/trade-capture-deck'
import { CloseTradeForm } from '@/components/trades/close-trade-form'
import { TradeImportPanel } from '@/components/trades/trade-import-panel'
import { getJournalAccess } from '@/lib/server/auth'
import { getTradesWorkspaceSnapshotServer } from '@/lib/server/journal'
import { getTradeByIdServer, getTradeMediaServer, getTradeTagsServer } from '@/lib/server/trades'
import { buildTradeTableHref, parseTradeTableQuery } from '@/lib/utils/trade-table-query'
import { readReviewDrilldownScope, selectReviewDrilldownTrades } from '@/lib/utils/review-drilldown-scope'
import { resolveTradeSelection } from '@/lib/utils/trade-selection'
import { getReviewSessionByIdServer, getReviewSessionsServer } from '@/lib/server/review-sessions'
import { getUserCostProfilesServer } from '@/lib/server/user-cost-profiles'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import { extractTradeImportMeta } from '@/lib/utils/trade-import-meta'
import { formatTradeTimeInputValue } from '@/lib/utils/trade-time'
import type { TradeMediaRow, TradeRow } from '@/lib/types/db'
import {

  buildTradeTagMap,
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
    exitPriceBasis: row.exit_price_basis ?? null,
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
  if (!reviewFocus && !overrides?.title) return undefined

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
  const queryParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) queryParams.append(key, item)
  const tableQuery = parseTradeTableQuery(queryParams)
  const reviewScope = readReviewDrilldownScope(queryParams)
  if (reviewScope.kind === 'invalid') {
    return <AppShell><section role="alert" className="rounded-3xl border border-orange-400/20 p-6">
      <h1 className="text-xl font-semibold">Review-Auswahl nicht verfügbar</h1>
      <p className="mt-3 text-sm text-white/65">Bitte öffne die passenden Trades erneut über dein Review.</p>
      <a href="/review" className="mt-4 inline-block">Zum Review</a>
    </section></AppShell>
  }
  const pageSize = 30
  const page = tableQuery.page
  const access = await getJournalAccess()

  const [snapshot, savedSessions, userCostProfiles] = await Promise.all([
    getTradesWorkspaceSnapshotServer(access.user?.id),
    measurePerformance('database.review_sessions.recent', 'database', () => getReviewSessionsServer(access.user?.id), { route: '/trades' }),
    measurePerformance('database.user_cost_profiles', 'database', () => getUserCostProfilesServer(access.user?.id), { route: '/trades' }),
  ])

  if (snapshot.availability !== 'ready') {
    return <AppShell><div role="alert" className="rounded-3xl border border-orange-400/20 bg-black/30 p-6 text-white">
      <h1 className="text-xl font-semibold">Journal konnte nicht vollständig geladen werden</h1>
      <p className="mt-3 text-sm text-white/65">Bitte lade die Seite erneut. Es werden keine unvollständigen Treffer angezeigt. Die globale Ansicht unterstützt derzeit bis zu 10.000 Trades.</p>
      <a href="/trades" className="mt-4 inline-block rounded-full border border-white/20 px-4 py-2">Erneut laden</a>
    </div></AppShell>
  }
  const totalTradeCount = snapshot.tradeRows.length

  const linkedSetupByTradeId = buildLinkedSetupByTradeId(snapshot.setupRows, snapshot.setupTradeLinkRows)
  const mediaCounts = snapshot.tradeMediaCounts
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
  const initialFilters = tableQuery.filters

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
      const scopedTrades = reviewScope.kind === 'valid' ? selectReviewDrilldownTrades(trades, reviewScope.scope) : trades
      const drilldownSpotlightTrades = reviewFocus || reviewScope.kind === 'valid' ? filterTradeTableRows(scopedTrades, buildTradeTagMap(snapshot.tradeTags), initialFilters) : []
      spotlightTradeIds = drilldownSpotlightTrades.map((trade) => trade.id)
      spotlightTotalCount = drilldownSpotlightTrades.length
      reviewContext = buildReviewContext(params, initialFilters, spotlightTotalCount)
    }
  }

  const selection = resolveTradeSelection({
    tradeId: getParamValue(params.tradeId), editTradeId: getParamValue(params.editTradeId),
    closeTradeId: getParamValue(params.closeTradeId), capture: getParamValue(params.capture),
  })
  const { selectedTradeId, editTradeId, closeTradeId, captureMode: activeCaptureMode } = selection
  let selectionError: string | undefined

  let selectedRow = selectedTradeId ? snapshot.tradeRows.find((row) => row.id === selectedTradeId) : undefined
  if (selectedTradeId && !selectedRow) {
    try {
      selectedRow = await measurePerformance('database.trade_detail', 'database', () => getTradeByIdServer(selectedTradeId, access.user?.id), { route: '/trades' })
    } catch {
      selectionError = 'Der ausgewählte Trade konnte nicht geladen werden. Bitte kehre zur Liste zurück oder versuche es erneut.'
    }
  }

  let selectedMediaRows: TradeMediaRow[] = []
  let selectedTags: Awaited<ReturnType<typeof getTradeTagsServer>> = []
  if (selectedRow) {
    try {
      if (selectedRow.id !== selectedTradeId) throw new Error('Trade selection mismatch')
      ;[selectedMediaRows, selectedTags] = await Promise.all([
        measurePerformance('database.trade_detail_media', 'database', () => getTradeMediaServer(selectedRow.id, access.user?.id, true), { route: '/trades' }),
        measurePerformance('database.trade_detail_tags', 'database', () => getTradeTagsServer(selectedRow.id, access.user?.id, true), { route: '/trades' }),
      ])
    } catch {
      selectionError = 'Die Details des ausgewählten Trades konnten nicht vollständig geladen werden. Bitte versuche es erneut.'
    }
  }

  const editTradeRow = !selectionError && editTradeId && selectedRow?.id === editTradeId ? selectedRow : undefined
  const closeTradeRow = !selectionError && closeTradeId && selectedRow?.id === closeTradeId ? selectedRow : undefined

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
  const returnHref = (tradeId?: string) => buildTradeTableHref(queryParams.toString(), {
    filters: initialFilters, sort: tableQuery.sort, page, reviewOnly: tableQuery.reviewOnly, tradeId,
  })

  const editTradeInitialValues = editTradeRow
    ? buildTradeFormInitialValues(editTradeRow, selectedTags.map((tag) => tag.tag), selectedMediaRows, selectedLinkedSetup)
    : undefined

  return (
    <AppShell>
      <div className="space-y-6">
        {selectionError && !selection.drawerTradeId ? <div role="alert" className="rounded-2xl border border-orange-300/20 bg-orange-400/5 p-4 text-sm text-orange-50">
          <p>{selectionError}</p>
          <a href={returnHref()} className="mt-3 inline-block underline">Zur Journal-Liste</a>
        </div> : null}
        {!activeCaptureMode && !closeTradeRow && !(editTradeInitialValues && editTradeRow) ? (
          <TradeLedgerCapture marketOptions={marketOptions} setupOptions={setupOptions} emotionOptions={emotionOptions.length ? emotionOptions : defaultEmotions} />
        ) : null}
        {closeTradeRow || (editTradeInitialValues && editTradeRow) || activeCaptureMode ? (
          <section id="trade-editor" className="rounded-3xl border border-orange-300/18 bg-white/[0.05] p-5 shadow-2xl">
            {closeTradeRow ? (
              <CloseTradeForm
                key={`close-${closeTradeRow.id}`}
                tradeId={closeTradeRow.id}
                market={closeTradeRow.market}
                setup={selectedLinkedSetup?.title ?? closeTradeRow.setup}
                trade={selectedTradeSummary}
                cancelHref={returnHref(closeTradeRow.id)}
                editHref={`${returnHref(closeTradeRow.id)}&editTradeId=${encodeURIComponent(closeTradeRow.id)}#trade-editor`}
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
                cancelHref={returnHref(editTradeRow.id)}
              />
            ) : (
              <TradeCaptureDeck
                initialMode={activeCaptureMode}
                closeHref={returnHref(selectedTradeId)}
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
          selectedTradeId={selection.drawerTradeId}
          tradeDetailError={selectionError}
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
          initialSort={tableQuery.sort}
          initialReviewOnly={tableQuery.reviewOnly}
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
        />
      </div>
    </AppShell>
  )
}
