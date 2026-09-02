import type { Trade, TradeDetail } from '@/lib/types/trade'

export type TradeActivityEvidence = 'recorded' | 'derived' | 'manual'
export type TradeActivityTone = 'neutral' | 'positive' | 'caution' | 'evidence'

export type TradeActivityItem = Readonly<{
  id: string
  title: string
  description: string
  meta?: string
  evidence: TradeActivityEvidence
  tone: TradeActivityTone
}>

const EMPTY_LABELS = new Set([
  '',
  '—',
  'Noch keine Review-Notiz vorhanden.',
  'Noch keine Notiz hinterlegt.',
])

function hasMeaningfulText(value?: string | null) {
  return Boolean(value && !EMPTY_LABELS.has(value.trim()))
}

function joinMeaningful(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => hasMeaningfulText(value)).join(' · ')
}

function hasRecordedCosts(trade: Trade) {
  const values = [
    trade.totalCosts,
    trade.fees,
    trade.exchangeFees,
    trade.fundingFees,
    trade.spreadCost,
    trade.slippage,
  ]

  return values.some((value) => value !== null && value !== undefined)
    || Boolean(trade.costProfile && trade.costProfile !== 'manual' && trade.costProfile !== 'none')
}

function getCaptureDescription(trade: Trade) {
  if (trade.hasImportMeta) {
    const preset = trade.importPresetLabel ? ` über ${trade.importPresetLabel}` : ''
    return `Importierter Journal-Eintrag${preset}. Feldherkunft und Importqualität bleiben separat ausgewiesen.`
  }

  return trade.captureStatus === 'incomplete'
    ? 'Schnellerfassung gespeichert. Fehlende Ausführungs- oder Reviewfelder bleiben ausdrücklich unvollständig.'
    : 'Journal-Eintrag gespeichert. Das ist kein Nachweis eines Broker-Fills.'
}

function getExecutionEvidence(trade: Trade): TradeActivityEvidence {
  if (trade.pnlSource === 'derived') return 'derived'
  if (trade.pnlSource === 'manual' || trade.pnlSource === 'override') return 'manual'
  return 'recorded'
}

export function buildTradeActivityTimeline(
  trade: Trade,
  detail?: TradeDetail,
  tagCount = 0,
): TradeActivityItem[] {
  const items: TradeActivityItem[] = []

  items.push({
    id: 'journal-capture',
    title: 'Journal-Eintrag',
    description: getCaptureDescription(trade),
    meta: trade.capturedAt ?? trade.createdAt ?? trade.date,
    evidence: trade.hasImportMeta ? 'recorded' : 'manual',
    tone: trade.captureStatus === 'incomplete' ? 'caution' : 'neutral',
  })

  if (trade.tradeOccurredAt || hasMeaningfulText(detail?.tradeTimeLabel)) {
    items.push({
      id: 'trade-time',
      title: 'Trade-Zeitpunkt',
      description: joinMeaningful([
        trade.direction === 'long' ? 'Long' : trade.direction === 'short' ? 'Short' : 'Richtung neutral oder offen',
        trade.market,
        detail?.sessionLabel,
        detail?.killZoneLabel,
      ]),
      meta: trade.tradeOccurredAt ?? detail?.tradeTimeLabel,
      evidence: trade.tradeOccurredAt ? 'recorded' : 'derived',
      tone: 'neutral',
    })
  }

  if (trade.partialExits?.length) {
    items.push({
      id: 'partial-exits',
      title: 'Teil-Exits dokumentiert',
      description: joinMeaningful([
        detail?.partialExitsLabel,
        detail?.partialExitRealizedLabel,
        detail?.partialExitRemainingLabel,
      ]) || `${trade.partialExits.length} Teil-Exit${trade.partialExits.length === 1 ? '' : 's'} gespeichert.`,
      evidence: 'recorded',
      tone: trade.partialExitHasOpenRemainder ? 'caution' : 'positive',
    })
  }

  if (hasMeaningfulText(detail?.executionLabel) || trade.netPnL !== null && trade.netPnL !== undefined) {
    items.push({
      id: 'execution-result',
      title: trade.captureResult === 'open' ? 'Zwischenstand berechnet' : 'Ergebnis bilanziert',
      description: detail?.executionLabel ?? 'Gespeichertes Nettoergebnis ohne vollständige Ausführungsdetails.',
      meta: trade.completedAt ?? undefined,
      evidence: getExecutionEvidence(trade),
      tone: trade.netPnL === undefined || trade.netPnL === null
        ? 'neutral'
        : trade.netPnL >= 0
          ? 'positive'
          : 'caution',
    })
  }

  if (hasRecordedCosts(trade) && hasMeaningfulText(detail?.costLabel)) {
    items.push({
      id: 'costs',
      title: 'Kosten berücksichtigt',
      description: detail?.costLabel ?? 'Kostenfelder gespeichert.',
      evidence: 'derived',
      tone: 'neutral',
    })
  }

  const screenshotCount = trade.screenshotCount ?? detail?.screenshotCount ?? 0
  if (screenshotCount > 0) {
    items.push({
      id: 'evidence',
      title: 'Visuelle Evidence verknüpft',
      description: `${screenshotCount} Screenshot${screenshotCount === 1 ? '' : 's'}${tagCount > 0 ? ` · ${tagCount} Tag${tagCount === 1 ? '' : 's'}` : ''}.`,
      evidence: 'recorded',
      tone: 'evidence',
    })
  }

  const reviewDescription = joinMeaningful([
    detail?.reviewState,
    detail?.reviewRepeatability,
    detail?.reviewLesson ?? detail?.lesson,
  ])
  if (reviewDescription) {
    items.push({
      id: 'review',
      title: 'Review dokumentiert',
      description: reviewDescription,
      evidence: 'manual',
      tone: 'evidence',
    })
  }

  return items
}
