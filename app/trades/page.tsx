import { AppShell } from '@/components/layout/app-shell'
import { QuickTradeForm } from '@/components/trades/quick-trade-form'
import { TradeForm } from '@/components/trades/trade-form'
import { TradesFirstRunCard } from '@/components/trades/trades-first-run-card'
import { TradesWorkbench } from '@/components/trades/trades-workbench'
import { TradeCaptureDeck } from '@/components/trades/trade-capture-deck'
import { CloseTradeForm } from '@/components/trades/close-trade-form'
import { TradeImportPanel } from '@/components/trades/trade-import-panel'
import { RuntimeStatusCard } from '@/components/runtime/runtime-status-card'
import { FocusBridgeCard } from '@/components/focus/focus-bridge-card'
import { getJournalAccess } from '@/lib/server/auth'
import { getJournalSnapshotServer } from '@/lib/server/journal'
import { getTradeByIdServer } from '@/lib/server/trades'
import { getReviewSessionByIdServer, getReviewSessionsServer } from '@/lib/server/review-sessions'
import { getUserCostProfilesServer } from '@/lib/server/user-cost-profiles'
import { mapTradeRowToTrade, mapTradeRowToTradeDetail } from '@/lib/server/transformers'
import type { TradeMediaRow, TradeRow } from '@/lib/types/db'
import {

  buildTradeTagMap,
  createDefaultTradeTableFilters,
  filterTradeTableRows,
  getTradeWeekdayLabel,
  type TradeTableFilters,
} from '@/lib/utils/trade-table'


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

function buildTradeFormInitialValues(row: TradeRow, tags: string[], mediaRows: TradeMediaRow[]) {
  const partialExits = Array.isArray(row.partial_exits) ? row.partial_exits : []
  return {
    market: row.market,
    setup: row.setup,
    emotion: row.emotion ?? '',
    bias: row.bias ?? '',
    ruleCheck: row.rule_check ?? '',
    reviewRepeatability: row.review_repeatability ?? '',
    reviewState: row.review_state ?? '',
    reviewLesson: row.review_lesson ?? '',
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
    notes: row.notes ?? '',
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
    title: overrides?.title ?? reviewFocus ?? 'Review-Fokus aktiv',
    description: overrides?.description ?? (spotlightTotalCount > 0
      ? 'Diese Trades wurden direkt aus dem Review vorgefiltert und als konkrete Treffer markiert. Du kannst den Fokus hier weiter verfeinern oder komplett lösen.'
      : 'Diese Trades wurden direkt aus dem Review vorgefiltert. Du kannst den Fokus hier weiter verfeinern oder komplett lösen.'),
    chips: uniqueChips,
  }
}

export default async function TradesPage({ searchParams }: { searchParams?: Promise<TradesSearchParams> }) {
  const params = (await searchParams) ?? {}
  const reviewFocus = getParamValue(params.reviewFocus)
  const reviewSessionId = getParamValue(params.reviewSession)
  const access = await getJournalAccess()
  const snapshot = await getJournalSnapshotServer(access.user?.id)
  const savedSessions = await getReviewSessionsServer(access.user?.id)
  const userCostProfiles = await getUserCostProfilesServer(access.user?.id)
  const tradeMediaMap = buildTradeMediaMap(snapshot.tradeMediaRows)
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row, tradeMediaMap[row.id] ?? []))
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
        description: session.note || session.focusDescription || 'Gespeicherte Spotlight-Session aus dem Review Hub geöffnet.',
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
        description: getParamValue(params.reviewDescription) ?? 'Mini-Review aus dem Review Hub geöffnet.',
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

  let selectedRow = snapshot.tradeRows[0]
  if (selectedTradeId) {
    const matched = snapshot.tradeRows.find((row) => row.id === selectedTradeId)
    if (matched) selectedRow = matched
    else {
      try {
        selectedRow = await getTradeByIdServer(selectedTradeId, access.user?.id)
      } catch {
        selectedRow = snapshot.tradeRows[0]
      }
    }
  }

  let editTradeRow: TradeRow | undefined
  if (editTradeId) {
    if (selectedRow?.id === editTradeId) editTradeRow = selectedRow
    else {
      const matched = snapshot.tradeRows.find((row) => row.id === editTradeId)
      if (matched) editTradeRow = matched
      else {
        try {
          editTradeRow = await getTradeByIdServer(editTradeId, access.user?.id)
        } catch {
          editTradeRow = undefined
        }
      }
    }
  }


  let closeTradeRow: TradeRow | undefined
  if (closeTradeId) {
    if (selectedRow?.id === closeTradeId) closeTradeRow = selectedRow
    else {
      const matched = snapshot.tradeRows.find((row) => row.id === closeTradeId)
      if (matched) closeTradeRow = matched
      else {
        try {
          closeTradeRow = await getTradeByIdServer(closeTradeId, access.user?.id)
        } catch {
          closeTradeRow = undefined
        }
      }
    }
  }

  const setupOptions = Array.from(new Set([...snapshot.setupRows.filter((setup) => !setup.is_archived).map((setup) => setup.title), ...snapshot.tradeRows.map((trade) => trade.setup)])).filter(Boolean)
  const marketOptions = Array.from(new Set([...defaultMarkets, ...snapshot.tradeRows.map((trade) => trade.market)])).filter(Boolean)
  const emotionOptions = Array.from(new Set([...defaultEmotions, ...snapshot.tradeRows.map((trade) => trade.emotion ?? '').filter(Boolean)])).filter(Boolean)
  const tagOptions = Array.from(new Set([...defaultTags, ...snapshot.tradeTags.map((tag) => tag.tag)])).filter(Boolean)
  const sessionOptions = Array.from(new Set(snapshot.tradeRows.map((trade) => trade.session ?? '').filter(Boolean)))
  const conceptOptions = Array.from(new Set(snapshot.tradeRows.map((trade) => trade.concept ?? '').filter(Boolean)))
  const weekdayOptions = Array.from(new Set(trades.map(getTradeWeekdayLabel)))

  const firstIncompleteTradeId = snapshot.tradeRows.find((row) => (row.capture_status ?? 'complete') === 'incomplete')?.id

  const tradeDetails = Object.fromEntries(snapshot.tradeRows.map((row) => [row.id, mapTradeRowToTradeDetail(row, tradeMediaMap[row.id] ?? [])]))
  if (selectedRow) tradeDetails[selectedRow.id] = mapTradeRowToTradeDetail(selectedRow, tradeMediaMap[selectedRow.id] ?? [])

  const editTradeTags = editTradeRow
    ? snapshot.tradeTags.filter((tag) => tag.trade_id === editTradeRow?.id).map((tag) => tag.tag)
    : []
  const editTradeInitialValues = editTradeRow
    ? buildTradeFormInitialValues(editTradeRow, editTradeTags, tradeMediaMap[editTradeRow.id] ?? [])
    : undefined

  return (
    <AppShell filteredTradesCount={trades.length} filteredASetupsCount={trades.filter((trade) => trade.quality === 'A-Setup').length} filteredLossesCount={trades.filter((trade) => (trade.netPnL ?? 0) < 0).length}>
      <div className="space-y-6">
        <RuntimeStatusCard />
        <TradesFirstRunCard trades={trades} firstIncompleteTradeId={firstIncompleteTradeId} />
        <FocusBridgeCard dailyNotes={snapshot.dailyNotes} variant="workspace" />
        {closeTradeRow || (editTradeInitialValues && editTradeRow) || activeCaptureMode ? (
          <section id="trade-editor" className="rounded-3xl border border-orange-300/18 bg-white/[0.05] p-5 shadow-2xl">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs uppercase tracking-[0.24em] text-white/40">Trade Editor</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {closeTradeRow
                    ? 'Offenen Trade mit Mini-Flow schließen'
                    : editTradeInitialValues && editTradeRow
                      ? (editTradeRow.capture_status ?? 'complete') === 'incomplete'
                        ? 'Schnellerfassung jetzt sauber vervollständigen'
                        : 'Trade gezielt bearbeiten'
                      : activeCaptureMode === 'quick'
                        ? 'Snip direkt sichtbar sichern'
                        : activeCaptureMode === 'import'
                          ? 'CSV-Datei direkt ins Workspace holen'
                          : 'Neuen Trade direkt sichtbar eintragen'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  Aktionen aus der Tabelle landen jetzt hier oben statt versteckt am Seitenende. Erst sichern, später veredeln oder bestehende Trades als CSV in dasselbe Arbeitsbrett holen.
                </p>
              </div>
            </div>
            {closeTradeRow ? (
              <CloseTradeForm
                tradeId={closeTradeRow.id}
                market={closeTradeRow.market}
                setup={closeTradeRow.setup}
                cancelHref={`/trades?tradeId=${encodeURIComponent(closeTradeRow.id)}`}
              />
            ) : editTradeInitialValues && editTradeRow ? (
              <TradeForm
                key={`edit-${editTradeRow.id}`}
                markets={marketOptions.length ? marketOptions : defaultMarkets}
                setups={setupOptions.length ? setupOptions : ['Liquidity Sweep']}
                emotions={emotionOptions.length ? emotionOptions : defaultEmotions}
                biases={defaultBiases}
                ruleFlags={defaultRuleFlags}
                tagOptions={tagOptions}
                initialUserCostProfiles={userCostProfiles}
                mode="edit"
                tradeId={editTradeRow.id}
                initialValues={editTradeInitialValues}
                cancelHref={`/trades?tradeId=${encodeURIComponent(editTradeRow.id)}`}
              />
            ) : (
              <TradeCaptureDeck
                initialMode={activeCaptureMode}
                closeHref={selectedTradeId ? `/trades?tradeId=${encodeURIComponent(selectedTradeId)}` : '/trades'}
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
          tradeDetails={tradeDetails}
          tradeTags={snapshot.tradeTags}
          selectedTradeId={selectedTradeId}
          tagOptions={tagOptions}
          marketOptions={marketOptions}
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
          newTradeHref="/trades?capture=full#trade-editor"
          snipHref="/trades?capture=quick#trade-editor"
          importHref="/trades?capture=import#trade-editor"
          isEditorOpen={Boolean(closeTradeRow || (editTradeInitialValues && editTradeRow) || activeCaptureMode)}
          activeEditTradeId={editTradeId}
          activeCloseTradeId={closeTradeId}
        />
      </div>
    </AppShell>
  )
}
