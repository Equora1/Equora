import { journalText, type JournalLocale } from '@/lib/i18n/journal'
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
  'No note recorded yet.',
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

function getCaptureDescription(trade: Trade, locale: JournalLocale) {
  const text = journalText(locale)
  if (trade.hasImportMeta) {
    const preset = trade.importPresetLabel ? ` über ${trade.importPresetLabel}` : ''
    return text(
      `Importierter Journal-Eintrag${preset}. Feldherkunft und Importqualität bleiben separat ausgewiesen.`,
      `Journal entry imported${trade.importPresetLabel ? ` using ${trade.importPresetLabel}` : ''}. See Import for field sources and import quality.`,
    )
  }

  return trade.captureStatus === 'incomplete'
    ? text('Schnellerfassung gespeichert. Fehlende Ausführungs- oder Reviewfelder bleiben ausdrücklich unvollständig.', 'Quick entry saved. Any missing execution or review fields are still incomplete.')
    : text('Journal-Eintrag gespeichert. Das ist kein Nachweis eines Broker-Fills.', 'Journal entry saved. It does not verify a broker fill.')
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
  locale: JournalLocale = 'de',
): TradeActivityItem[] {
  const text = journalText(locale)
  const items: TradeActivityItem[] = []

  items.push({
    id: 'journal-capture',
    title: text('Journal-Eintrag', 'Journal entry'),
    description: getCaptureDescription(trade, locale),
    meta: trade.capturedAt ?? trade.createdAt ?? trade.date,
    evidence: trade.hasImportMeta ? 'recorded' : 'manual',
    tone: trade.captureStatus === 'incomplete' ? 'caution' : 'neutral',
  })

  if (trade.tradeOccurredAt || hasMeaningfulText(detail?.tradeTimeLabel)) {
    items.push({
      id: 'trade-time',
      title: text('Trade-Zeitpunkt', 'Trade time'),
      description: joinMeaningful([
        trade.direction === 'long' ? 'Long' : trade.direction === 'short' ? 'Short' : text('Richtung neutral oder offen', 'Direction not specified'),
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
      title: text('Teil-Exits dokumentiert', 'Partial exits recorded'),
      description: joinMeaningful([
        detail?.partialExitsLabel,
        detail?.partialExitRealizedLabel,
        detail?.partialExitRemainingLabel,
      ]) || text(`${trade.partialExits.length} Teil-Exit${trade.partialExits.length === 1 ? '' : 's'} gespeichert.`, `${trade.partialExits.length} partial ${trade.partialExits.length === 1 ? 'exit' : 'exits'} saved.`),
      evidence: 'recorded',
      tone: trade.partialExitHasOpenRemainder ? 'caution' : 'positive',
    })
  }

  const hasOpenPosition = trade.captureResult === 'open' || trade.partialExitHasOpenRemainder === true
  if (hasMeaningfulText(detail?.executionLabel) || trade.netPnL !== null && trade.netPnL !== undefined) {
    items.push({
      id: 'execution-result',
      title: hasOpenPosition ? text('Zwischenstand berechnet', 'Interim result') : text('Ergebnis bilanziert', 'Result recorded'),
      description: detail?.executionLabel ?? text('Gespeichertes Nettoergebnis ohne vollständige Ausführungsdetails.', 'Net result recorded. Execution details are incomplete.'),
      meta: hasOpenPosition ? undefined : trade.completedAt ?? undefined,
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
      title: text('Kosten berücksichtigt', 'Costs included'),
      description: detail?.costLabel ?? text('Kostenfelder gespeichert.', 'Cost fields saved.'),
      evidence: 'derived',
      tone: 'neutral',
    })
  }

  const screenshotCount = trade.screenshotCount ?? detail?.screenshotCount ?? 0
  if (screenshotCount > 0) {
    items.push({
      id: 'evidence',
      title: text('Bild zum Trade verknüpft', 'Trade image attached'),
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
      title: text('Review dokumentiert', 'Review recorded'),
      description: reviewDescription,
      evidence: 'manual',
      tone: 'evidence',
    })
  }

  return items
}
