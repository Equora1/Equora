import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { TradeCaptureResult, TradeCaptureStatus } from '@/lib/types/trade'
import { parseTradingNumber } from '@/lib/utils/calculations'

export function normalizeTradeCaptureStatus(value: string | TradeCaptureStatus | null | undefined): TradeCaptureStatus {
  return value === 'incomplete' ? 'incomplete' : 'complete'
}

export function normalizeTradeCaptureResult(value: string | TradeCaptureResult | null | undefined): TradeCaptureResult | null {
  if (value === 'winner' || value === 'loser' || value === 'breakeven' || value === 'open') return value
  return null
}

export function getTradeCaptureStatusLabel(status: string | TradeCaptureStatus | null | undefined, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  return normalizeTradeCaptureStatus(status) === 'incomplete' ? text('Unvollständig', 'Incomplete') : text('Vollständig', 'Complete')
}

export function getTradeCaptureResultLabel(result: string | TradeCaptureResult | null | undefined, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const normalized = normalizeTradeCaptureResult(result)
  switch (normalized) {
    case 'winner':
      return text('Gewinner', 'Win')
    case 'loser':
      return text('Verlierer', 'Loss')
    case 'breakeven':
      return 'Breakeven'
    case 'open':
      return text('Offen', 'Open')
    default:
      return '—'
  }
}

export function inferTradeCaptureResultFromPnL(value: string | number | null | undefined): TradeCaptureResult | null {
  const numeric = parseTradingNumber(value)
  if (numeric === null) return null
  if (numeric > 0) return 'winner'
  if (numeric < 0) return 'loser'
  return 'breakeven'
}

export function getTradeCaptureTrustLabel(
  status: string | TradeCaptureStatus | null | undefined,
  hasReliablePnL: boolean,
  locale: JournalLocale = 'de',
) {
  const text = journalText(locale)
  const normalizedStatus = normalizeTradeCaptureStatus(status)
  if (normalizedStatus === 'incomplete') {
    return text('Schnellerfassung gespeichert. Für Equity-Kurve, belastbare P&L und tiefe Analyse bitte später vervollständigen.', 'Quick entry saved. Add the missing details to include this trade in P&L and other metrics.')
  }

  return hasReliablePnL
    ? text('Dieser Trade trägt belastbar zu Equity, P&L und Auswertungen bei.', 'This trade has P&L available for analysis.')
    : text('Trade vollständig markiert, aber noch ohne belastbare P&L-Grundlage.', 'This trade is marked complete but has no reliable P&L yet.')
}
