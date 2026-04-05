import type { Trade } from '@/lib/types/trade'
import { inferTradeCaptureResultFromPnL, normalizeTradeCaptureStatus } from '@/lib/utils/trade-capture'

export type TradeTrustState = 'trusted' | 'incomplete' | 'missing-pnl' | 'open' | 'conflict'

export type TradeTrustMeta = {
  state: TradeTrustState
  label: string
  shortLabel: string
  description: string
  tone: 'emerald' | 'orange' | 'neutral' | 'red'
  reliable: boolean
  needsAttention: boolean
}

function hasPnLConflict(trade: Trade) {
  if (trade.netPnL === undefined || trade.netPnL === null) return false
  if (!trade.captureResult || trade.captureResult === 'open') return false

  const inferredResult = inferTradeCaptureResultFromPnL(trade.netPnL)
  return Boolean(inferredResult && inferredResult !== trade.captureResult)
}

export function getTradeTrustState(trade: Trade): TradeTrustState {
  const captureStatus = normalizeTradeCaptureStatus(trade.captureStatus)

  if (hasPnLConflict(trade)) {
    return 'conflict'
  }

  if (trade.captureResult === 'open') {
    return 'open'
  }

  if (captureStatus === 'incomplete') {
    return 'incomplete'
  }

  return trade.netPnL !== undefined && trade.netPnL !== null ? 'trusted' : 'missing-pnl'
}

export function getTradeTrustMeta(trade: Trade): TradeTrustMeta {
  const state = getTradeTrustState(trade)

  if (state === 'conflict') {
    return {
      state,
      label: 'Ergebnis passt nicht zur Netto-P&L',
      shortLabel: 'Konflikt',
      description: 'Capture-Ergebnis und Netto-P&L zeigen in unterschiedliche Richtungen. Bitte diesen Trade einmal prüfen.',
      tone: 'red',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'open') {
    return {
      state,
      label: 'Offener Trade',
      shortLabel: 'Offen',
      description: 'Der Trade ist bewusst noch offen. Für belastbare P&L und Kalender-/Statistik-Summen erst später schließen.',
      tone: 'emerald',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'incomplete') {
    const screenshotOnly = (trade.screenshotCount ?? 0) > 0 && (!trade.market || trade.market === 'Screenshot Capture') && (!trade.setup || trade.setup === 'Später ergänzen')
    return {
      state,
      label: screenshotOnly ? 'Screenshot zuerst gesichert' : 'Schnellerfassung gespeichert',
      shortLabel: screenshotOnly ? 'Screenshot' : 'Quick',
      description: screenshotOnly
        ? 'Der Screenshot ist sicher gespeichert. Zahlen und Struktur können später ergänzt werden.'
        : 'Der Trade ist angelegt, aber noch nicht vollständig genug für belastbare Auswertungen.',
      tone: 'orange',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'missing-pnl') {
    return {
      state,
      label: 'Geschlossen, aber ohne Netto-P&L',
      shortLabel: 'Ohne P&L',
      description: 'Der Trade ist als vollständig markiert, aber noch ohne belastbare Netto-P&L-Grundlage.',
      tone: 'neutral',
      reliable: false,
      needsAttention: true,
    }
  }

  return {
    state,
    label: trade.pnlSource === 'manual' || trade.pnlSource === 'override' ? 'Belastbar, aber manuell gepflegt' : 'Belastbare Trade-Mathe',
    shortLabel: trade.pnlSource === 'manual' || trade.pnlSource === 'override' ? 'Manuell' : 'Belastbar',
    description:
      trade.pnlSource === 'derived'
        ? 'Netto-P&L wird aus Entry, Exit und Kosten berechnet und fließt belastbar in Statistiken ein.'
        : trade.pnlSource === 'manual' || trade.pnlSource === 'override'
          ? 'Der Trade ist belastbar genug für Auswertungen, basiert aber auf manuell gesetzter Netto-P&L.'
          : 'Dieser Trade trägt belastbar zu P&L, Equity und Review-Auswertungen bei.',
    tone: 'emerald',
    reliable: true,
    needsAttention: false,
  }
}

export function getTradeTrustChecklist(trade: Trade) {
  const meta = getTradeTrustMeta(trade)
  const items: string[] = []

  if ((trade.screenshotCount ?? 0) > 0) {
    items.push(`Screenshot${(trade.screenshotCount ?? 0) > 1 ? 's' : ''} vorhanden`)
  }

  if (trade.captureResult === 'open') {
    items.push('Trade ist noch offen und zählt nicht als final abgeschlossen')
  }

  if (trade.captureStatus === 'incomplete') {
    items.push('Erfassung ist noch unvollständig')
  }

  if (trade.netPnL === undefined || trade.netPnL === null) {
    items.push('Netto-P&L fehlt noch')
  } else if (trade.pnlSource === 'derived') {
    items.push('Netto-P&L wird aus Entry/Exit/Kosten berechnet')
  } else if (trade.pnlSource === 'manual') {
    items.push('Netto-P&L wurde manuell gesetzt')
  } else if (trade.pnlSource === 'override') {
    items.push('Netto-P&L überschreibt die Auto-Rechnung')
  }

  if (hasPnLConflict(trade)) {
    items.push('Ergebnis und Netto-P&L widersprechen sich')
  }

  if (trade.captureStatus === 'complete' && trade.captureResult !== 'open' && !trade.completedAt) {
    items.push('Abschlusszeit fehlt noch')
  }

  return {
    ...meta,
    items,
  }
}

export function isTradePnLTrusted(trade: Trade) {
  return getTradeTrustMeta(trade).reliable
}

export function getTrustedTrades(trades: Trade[]) {
  return trades.filter(isTradePnLTrusted)
}

export function getTradeTrustSummary(trades: Trade[]) {
  const trustedTrades = trades.filter((trade) => getTradeTrustState(trade) === 'trusted')
  const incompleteTrades = trades.filter((trade) => getTradeTrustState(trade) === 'incomplete')
  const completeWithoutPnL = trades.filter((trade) => getTradeTrustState(trade) === 'missing-pnl')
  const openTrades = trades.filter((trade) => getTradeTrustState(trade) === 'open')
  const conflictingTrades = trades.filter((trade) => getTradeTrustState(trade) === 'conflict')
  const totalTrades = trades.length

  return {
    totalTrades,
    trustedTrades: trustedTrades.length,
    incompleteTrades: incompleteTrades.length,
    completeWithoutPnL: completeWithoutPnL.length,
    openTrades: openTrades.length,
    conflictingTrades: conflictingTrades.length,
    trustedCoverage: totalTrades ? (trustedTrades.length / totalTrades) * 100 : 0,
    trustedPnLNet: trustedTrades.reduce((sum, trade) => sum + (trade.netPnL ?? 0), 0),
    needsAttention: incompleteTrades.length + completeWithoutPnL.length + openTrades.length + conflictingTrades.length,
  }
}
