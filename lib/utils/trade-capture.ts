import type { TradeCaptureResult, TradeCaptureStatus } from '@/lib/types/trade'
import { parseTradingNumber } from '@/lib/utils/calculations'

export function normalizeTradeCaptureStatus(value: string | TradeCaptureStatus | null | undefined): TradeCaptureStatus {
  return value === 'incomplete' ? 'incomplete' : 'complete'
}

export function normalizeTradeCaptureResult(value: string | TradeCaptureResult | null | undefined): TradeCaptureResult | null {
  if (value === 'winner' || value === 'loser' || value === 'breakeven' || value === 'open') return value
  return null
}

export function getTradeCaptureStatusLabel(status: string | TradeCaptureStatus | null | undefined) {
  return normalizeTradeCaptureStatus(status) === 'incomplete' ? 'Unvollständig' : 'Vollständig'
}

export function getTradeCaptureResultLabel(result: string | TradeCaptureResult | null | undefined) {
  const normalized = normalizeTradeCaptureResult(result)
  switch (normalized) {
    case 'winner':
      return 'Gewinner'
    case 'loser':
      return 'Verlierer'
    case 'breakeven':
      return 'Breakeven'
    case 'open':
      return 'Offen'
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
) {
  const normalizedStatus = normalizeTradeCaptureStatus(status)
  if (normalizedStatus === 'incomplete') {
    return 'Schnellerfassung gespeichert. Für Equity-Kurve, belastbare P&L und tiefe Analyse bitte später vervollständigen.'
  }

  return hasReliablePnL
    ? 'Dieser Trade trägt belastbar zu Equity, P&L und Auswertungen bei.'
    : 'Trade vollständig markiert, aber noch ohne belastbare Netto-P&L-Grundlage.'
}
