import type { SetupMediaRow, SetupRow, SetupTradeLinkRow } from '@/lib/types/db'
import type { SavedSetup, SavedSetupMedia, SetupDetail, SetupImageItem, SetupLibraryItem } from '@/lib/types/setup'
import type { Trade } from '@/lib/types/trade'
import { findBestMarket, getCoreMetrics } from '@/lib/utils/analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'

function normalizeCategory(category: string | null | undefined) {
  return category?.trim() || 'Custom'
}


export type SetupPerformanceStatus = 'active' | 'watch' | 'pause' | 'empty'

export type SetupPerformanceRow = {
  title: string
  trades: number
  resolvedTrades: number
  openTrades: number
  winRate: number
  profitFactor: number
  netPnL: number
  grossProfit: number
  grossLoss: number
  totalCosts: number
  averageCost: number
  averageR: number
  expectancyR: number
  wins: number
  losses: number
  breakeven: number
  riskCoverage: number
  bestSession: string
  weakestSession: string
  bestMarket: string
  weakestMarket: string
  lastTradeDate: string | null
  lastTradePnL: number | null
  status: SetupPerformanceStatus
  statusLabel: string
  statusHint: string
  tone: 'green' | 'red' | 'neutral'
  verdict: string
  guardrail: string
}

export function getTradesForSetupTitle(title: string, trades: Trade[], savedSetups: Array<Pick<SavedSetup, 'title' | 'linkedTradeIds'>> = []) {
  const linkedTradeIds = new Set(savedSetups.find((setup) => setup.title === title)?.linkedTradeIds ?? [])
  return trades.filter((trade) => trade.setup === title || linkedTradeIds.has(trade.id))
}

function getSetupVerdict(metrics: ReturnType<typeof getCoreMetrics>, tradeCount: number) {
  if (tradeCount === 0) return 'Noch nicht gehandelt.'
  if (metrics.netPnL > 0 && metrics.expectancyR > 0) return 'Trägt aktuell.'
  if (metrics.netPnL < 0 && metrics.expectancyR < 0) return 'Kostet aktuell.'
  if (metrics.netPnL > 0) return 'P&L positiv, Ausführung prüfen.'
  if (metrics.netPnL < 0) return 'P&L negativ, Regel prüfen.'
  return 'Neutral. Mehr Daten nötig.'
}

function getSetupGuardrail(metrics: ReturnType<typeof getCoreMetrics>, tradeCount: number) {
  if (tradeCount === 0) return 'Erst nach klarem Beispiel handeln.'
  if (tradeCount < 3) return 'Kleine Stichprobe. Nicht übergewichten.'
  if (metrics.netPnL < 0 && metrics.winRate < 45) return 'Nur A-Lage oder pausieren.'
  if (metrics.netPnL < 0) return 'Fehlerquelle vor dem nächsten Trade prüfen.'
  if (metrics.netPnL > 0 && metrics.currentWinStreak >= 2) return 'Nicht größer werden. Gleich sauber bleiben.'
  if (metrics.netPnL > 0) return 'Weiter nur nach Regel.'
  return 'Beobachten.'
}

function getTradePnL(trade: Trade): number | null {
  if (trade.netPnL !== undefined && trade.netPnL !== null) return trade.netPnL
  const parsed = Number(String(trade.result ?? '').replace(',', '.').replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function getTradeR(trade: Trade): number | null {
  if (trade.rMultiple !== undefined && trade.rMultiple !== null) return trade.rMultiple
  if (trade.rValue !== undefined && trade.rValue !== null) return trade.rValue
  const parsed = Number(String(trade.r ?? '').replace(',', '.').replace(/[^0-9.+-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function getTradeTimestamp(trade: Trade) {
  const raw = trade.tradeOccurredAt || trade.completedAt || trade.capturedAt || trade.createdAt || trade.date
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}

function formatTradeDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function sumTradeCosts(trades: Trade[]) {
  return trades.reduce((sum, trade) => sum + Math.abs(trade.totalCosts ?? trade.fees ?? 0), 0)
}

function buildBestWeakestLabel(trades: Trade[], getLabel: (trade: Trade) => string | null | undefined) {
  const grouped = trades.reduce<Record<string, number>>((acc, trade) => {
    const label = getLabel(trade)?.trim() || '—'
    if (label === '—') return acc
    acc[label] = (acc[label] ?? 0) + (getTradePnL(trade) ?? 0)
    return acc
  }, {})
  const rows = Object.entries(grouped).sort((left, right) => right[1] - left[1])
  return {
    best: rows[0]?.[0] ?? '—',
    weakest: rows.length > 1 ? rows[rows.length - 1]?.[0] ?? '—' : rows[0]?.[0] ?? '—',
  }
}

function getRiskCoverage(trades: Trade[]) {
  if (!trades.length) return 0
  const covered = trades.filter((trade) => getTradeR(trade) !== null || trade.riskAmount || trade.plannedRiskAmount || trade.priceRisk).length
  return Math.round((covered / trades.length) * 100)
}

function getSetupStatus(metrics: ReturnType<typeof getCoreMetrics>, tradeCount: number, riskCoverage: number): Pick<SetupPerformanceRow, 'status' | 'statusLabel' | 'statusHint'> {
  if (tradeCount === 0) return { status: 'empty', statusLabel: 'Ohne Daten', statusHint: 'Erst mit echten Trades bewerten.' }
  if (tradeCount < 3) return { status: 'watch', statusLabel: 'Beobachten', statusHint: 'Stichprobe klein halten.' }
  if (metrics.netPnL < 0 && metrics.winRate < 45) return { status: 'pause', statusLabel: 'Pausieren', statusHint: 'Nur nach Regel-Check weiterhandeln.' }
  if (metrics.netPnL < 0) return { status: 'watch', statusLabel: 'Prüfen', statusHint: 'Fehlerquelle vor dem nächsten Entry klären.' }
  if (riskCoverage < 50) return { status: 'watch', statusLabel: 'Risiko offen', statusHint: 'Stop/Risiko häufiger dokumentieren.' }
  return { status: 'active', statusLabel: 'Aktiv', statusHint: 'Weiter nur nach Plan.' }
}

export function buildSetupPerformanceRows(
  setupTitles: string[],
  trades: Trade[],
  savedSetups: Array<Pick<SavedSetup, 'title' | 'linkedTradeIds'>> = [],
): SetupPerformanceRow[] {
  const titles = Array.from(new Set([...setupTitles.filter(Boolean), ...trades.map((trade) => trade.setup).filter(Boolean)]))

  return titles
    .map((title) => {
      const setupTrades = getTradesForSetupTitle(title, trades, savedSetups)
      const metrics = getCoreMetrics(setupTrades)
      const tone = setupTrades.length === 0 ? 'neutral' : metrics.netPnL > 0 ? 'green' : metrics.netPnL < 0 ? 'red' : 'neutral'

      const resolvedTrades = setupTrades.filter((trade) => getTradePnL(trade) !== null)
      const latestTrade = [...setupTrades].sort((left, right) => getTradeTimestamp(right) - getTradeTimestamp(left))[0]
      const sessionLabels = buildBestWeakestLabel(resolvedTrades, (trade) => trade.session)
      const marketLabels = buildBestWeakestLabel(resolvedTrades, (trade) => trade.market)
      const totalCosts = sumTradeCosts(setupTrades)
      const riskCoverage = getRiskCoverage(setupTrades)
      const status = getSetupStatus(metrics, setupTrades.length, riskCoverage)

      return {
        title,
        trades: setupTrades.length,
        resolvedTrades: metrics.resolvedTrades,
        openTrades: Math.max(0, setupTrades.length - metrics.resolvedTrades),
        winRate: metrics.winRate,
        profitFactor: metrics.profitFactor,
        netPnL: metrics.netPnL,
        grossProfit: metrics.grossProfit,
        grossLoss: metrics.grossLoss,
        totalCosts,
        averageCost: setupTrades.length ? totalCosts / setupTrades.length : 0,
        averageR: metrics.averageR,
        expectancyR: metrics.expectancyR,
        wins: metrics.winners,
        losses: metrics.losers,
        breakeven: metrics.breakeven,
        riskCoverage,
        bestSession: sessionLabels.best,
        weakestSession: sessionLabels.weakest,
        bestMarket: marketLabels.best,
        weakestMarket: marketLabels.weakest,
        lastTradeDate: formatTradeDate(latestTrade?.tradeOccurredAt || latestTrade?.completedAt || latestTrade?.capturedAt || latestTrade?.createdAt || latestTrade?.date),
        lastTradePnL: latestTrade ? getTradePnL(latestTrade) : null,
        ...status,
        tone,
        verdict: getSetupVerdict(metrics, setupTrades.length),
        guardrail: getSetupGuardrail(metrics, setupTrades.length),
      } satisfies SetupPerformanceRow
    })
    .sort((left, right) => right.netPnL - left.netPnL || right.trades - left.trades || left.title.localeCompare(right.title, 'de'))
}

export function buildSavedSetups(setupRows: SetupRow[], setupMediaRows: SetupMediaRow[], setupTradeLinkRows: SetupTradeLinkRow[] = []): SavedSetup[] {
  const mediaBySetup = setupMediaRows.reduce<Record<string, SavedSetupMedia[]>>((acc, row) => {
    if (!acc[row.setup_id]) acc[row.setup_id] = []
    acc[row.setup_id].push({
      id: row.id,
      storagePath: row.storage_path,
      publicUrl: row.public_url,
      fileName: row.file_name,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      sortOrder: row.sort_order ?? 0,
      isCover: Boolean(row.is_cover),
      caption: row.caption,
      mediaRole: row.media_role ?? 'example',
    })
    return acc
  }, {})

  const linkedTradeIdsBySetup = setupTradeLinkRows.reduce<Record<string, string[]>>((acc, row) => {
    if (!acc[row.setup_id]) acc[row.setup_id] = []
    acc[row.setup_id].push(row.trade_id)
    return acc
  }, {})

  return setupRows
    .map((row) => {
      const media = [...(mediaBySetup[row.id] ?? [])].sort((left, right) => left.sortOrder - right.sortOrder)
      const cover = media.find((item) => item.isCover)?.publicUrl ?? row.cover_image_url ?? null
      return {
        id: row.id,
        title: row.title,
        category: row.category,
        description: row.description,
        entry: row.entry,
        exit: row.exit,
        invalidation: row.invalidation,
        playbook: row.playbook,
        checklist: row.checklist ?? [],
        mistakes: row.mistakes ?? [],
        coverImageUrl: cover,
        isArchived: Boolean(row.is_archived),
        isMaster: Boolean(row.is_master),
        userId: row.user_id ?? null,
        sortOrder: row.sort_order ?? 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        media,
        linkedTradeIds: Array.from(new Set(linkedTradeIdsBySetup[row.id] ?? [])),
      } satisfies SavedSetup
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'de'))
}

export function buildSetupLibraryFromSources(baseSetups: SetupLibraryItem[], setupRows: SetupRow[], trades: Trade[]) {
  const prioritizedSetupRows = [...setupRows].sort((left, right) => Number(Boolean(left.is_master)) - Number(Boolean(right.is_master)))

  const ordered = [
    ...baseSetups.map((setup) => ({ ...setup, isMaster: false, isPersonal: false })),
    ...prioritizedSetupRows.map((setup) => ({
      title: setup.title,
      category: normalizeCategory(setup.category),
      description: setup.description?.trim() || (setup.is_master ? 'Master-Setup' : 'Persönliches Setup'),
      isMaster: Boolean(setup.is_master),
      isPersonal: Boolean(setup.created_at && !setup.is_master),
    })),
    ...Array.from(new Set(trades.map((trade) => trade.setup))).map((title) => ({
      title,
      category: normalizeCategory(trades.find((trade) => trade.setup === title)?.concept),
      description: 'Aus Trades erkannt',
      isMaster: false,
      isPersonal: false,
    })),
  ]

  return Array.from(new Map(ordered.map((setup) => [setup.title, setup])).values())
}

export function buildDynamicSetupDetail(
  base: SetupDetail | undefined,
  linkedTrades: Trade[],
  row?: SetupRow,
  mediaRows: SetupMediaRow[] = [],
): SetupDetail | undefined {
  if (!base && !row && !linkedTrades.length) return undefined

  const metrics = getCoreMetrics(linkedTrades)
  const bestMarket = findBestMarket(linkedTrades)?.[0] ?? base?.bestMarket ?? '—'
  const bestSession =
    Object.entries(
      linkedTrades.reduce<Record<string, number>>((acc, trade) => {
        acc[trade.session] = (acc[trade.session] ?? 0) + (trade.netPnL ?? 0)
        return acc
      }, {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? base?.bestSession ?? '—'

  const imageItems: SetupImageItem[] = mediaRows.length
    ? [...mediaRows]
        .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
        .map((row) => ({
          id: row.id,
          url: row.public_url,
          caption: row.caption,
          mediaRole: row.media_role ?? 'example',
          isCover: Boolean(row.is_cover),
        }))
    : base?.exampleImageItems ?? (base?.exampleImages ?? []).map((url, index) => ({ url, isCover: index === 0, mediaRole: 'example' as const }))

  const coverImage = imageItems.find((item) => item.isCover)?.url ?? row?.cover_image_url ?? base?.coverImage

  return {
    category: normalizeCategory(row?.category ?? base?.category),
    entry: row?.entry?.trim() || base?.entry || 'Noch keine feste Entry-Logik dokumentiert.',
    exit: row?.exit?.trim() || base?.exit || 'Noch keine feste Exit-Logik dokumentiert.',
    invalidation: row?.invalidation?.trim() || base?.invalidation || 'Noch keine Invalidierung dokumentiert.',
    mistakes: row?.mistakes?.length ? row.mistakes : base?.mistakes ?? ['Noch keine typischen Fehler gesammelt.'],
    checklist: row?.checklist?.length ? row.checklist : base?.checklist ?? [],
    playbook: row?.playbook ?? base?.playbook ?? undefined,
    performance:
      linkedTrades.length > 0
        ? `${formatCurrency(metrics.netPnL)} · ${metrics.winRate.toFixed(0)}% Winrate · ${formatRMultiple(metrics.averageR)}`
        : (base?.performance ?? 'Noch keine Performance-Daten vorhanden.'),
    bestMarket,
    bestSession,
    coverImage,
    exampleImages: imageItems.map((item) => item.url),
    exampleImageItems: imageItems,
  }
}
