import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import { normalizeTradeCurrency, resolveTradeMonetaryScope } from '@/lib/utils/currency'
import { inferTradeCaptureResultFromPnL, normalizeTradeCaptureStatus } from '@/lib/utils/trade-capture'

export type TradeTrustState = 'trusted' | 'incomplete' | 'missing-pnl' | 'missing-currency' | 'open' | 'conflict'

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

  if (trade.captureResult === 'open' || trade.partialExitHasOpenRemainder) {
    return 'open'
  }

  if (captureStatus === 'incomplete') {
    return 'incomplete'
  }

  if (trade.netPnL !== undefined && trade.netPnL !== null && !normalizeTradeCurrency(trade.accountCurrency)) {
    return 'missing-currency'
  }

  return trade.netPnL !== undefined && trade.netPnL !== null ? 'trusted' : 'missing-pnl'
}

export function getTradeTrustMeta(trade: Trade, locale: JournalLocale = 'de'): TradeTrustMeta {
  const text = journalText(locale)
  const state = getTradeTrustState(trade)

  if (state === 'conflict') {
    return {
      state,
      label: text('Status passt nicht zur P&L', 'Status conflicts with P&L'),
      shortLabel: text('Konflikt', 'Conflict'),
      description: text('Status und P&L zeigen in unterschiedliche Richtungen. Bitte diesen Trade prüfen.', 'The status and P&L do not match. Please check this trade.'),
      tone: 'red',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'open') {
    return {
      state,
      label: text('Offener Trade', 'Open trade'),
      shortLabel: text('Offen', 'Open'),
      description: text('Der Trade ist bewusst noch offen. Für belastbare P&L und Kalender-/Statistik-Summen erst später schließen.', 'This trade is still open. It counts towards P&L, calendar and statistics totals once closed.'),
      tone: 'emerald',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'incomplete') {
    const screenshotOnly = (trade.screenshotCount ?? 0) > 0 && (!trade.market || trade.market === 'Screenshot Capture') && (!trade.setup || trade.setup === 'Später ergänzen')
    return {
      state,
      label: screenshotOnly ? text('Screenshot zuerst gesichert', 'Screenshot saved') : text('Schnellerfassung gespeichert', 'Quick entry saved'),
      shortLabel: screenshotOnly ? 'Screenshot' : text('Quick', 'Quick entry'),
      description: screenshotOnly
        ? text('Der Screenshot ist sicher gespeichert. Zahlen und Struktur können später ergänzt werden.', 'The screenshot is saved. You can add trade details later.')
        : text('Der Trade ist angelegt, aber noch nicht vollständig genug für belastbare Auswertungen.', 'This trade is saved. It needs more details before it can count towards the metrics.'),
      tone: 'orange',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'missing-pnl') {
    return {
      state,
      label: text('Geschlossen, aber ohne P&L', 'Closed trade without P&L'),
      shortLabel: text('Ohne P&L', 'No P&L'),
      description: text('Der Trade ist als vollständig markiert, aber noch ohne belastbare P&L-Grundlage.', 'This trade is marked complete but has no reliable P&L yet.'),
      tone: 'neutral',
      reliable: false,
      needsAttention: true,
    }
  }

  if (state === 'missing-currency') {
    return {
      state,
      label: text('P&L ohne bestätigte Währung', 'P&L currency unconfirmed'),
      shortLabel: text('Währung fehlt', 'Currency missing'),
      description: text('Eine Zahl ohne verlässliche Geldeinheit darf nicht in P&L-, Equity- oder Kosten-Auswertungen einfließen.', 'P&L, equity and cost totals require a confirmed currency.'),
      tone: 'red',
      reliable: false,
      needsAttention: true,
    }
  }

  return {
    state,
    label: trade.pnlSource === 'manual' || trade.pnlSource === 'override' ? text('Belastbar, aber manuell gepflegt', 'Reliable, with manual P&L') : text('Belastbare Trade-Mathe', 'Reliable trade data'),
    shortLabel: trade.pnlSource === 'manual' || trade.pnlSource === 'override' ? text('Manuell', 'Manual') : text('Belastbar', 'Reliable'),
    description:
      trade.pnlSource === 'derived'
        ? text('P&L wird aus Entry, Exit und Kosten berechnet und fließt belastbar in Statistiken ein.', 'P&L is calculated from the entry, exit and costs and included in statistics.')
        : trade.pnlSource === 'manual' || trade.pnlSource === 'override'
          ? text('Der Trade ist belastbar genug für Auswertungen, basiert aber auf manuell gesetzter P&L.', 'This trade is included in the metrics with manually entered P&L.')
          : text('Dieser Trade trägt belastbar zu P&L, Equity und Review-Auswertungen bei.', 'This trade is included in P&L, equity and review metrics.'),
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
    items.push('P&L fehlt noch')
  } else if (trade.pnlSource === 'derived') {
    items.push('P&L wird aus Entry/Exit/Kosten berechnet')
  } else if (trade.pnlSource === 'manual') {
    items.push('P&L wurde manuell gesetzt')
  } else if (trade.pnlSource === 'override') {
    items.push('P&L überschreibt die Auto-Rechnung')
  }

  if (hasPnLConflict(trade)) {
    items.push('Status und P&L widersprechen sich')
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

/** Final result eligibility is independent of currency; monetary aggregation applies its own currency gate. */
export function getFinalizedTrades(trades: Trade[]) {
  return trades.filter((trade) => trade.captureResult !== 'open'
    && normalizeTradeCaptureStatus(trade.captureStatus) !== 'incomplete'
    && !trade.partialExitHasOpenRemainder && !hasPnLConflict(trade))
}

export function getTrustedTrades(trades: Trade[]) {
  return trades.filter(isTradePnLTrusted)
}

export function getTradeTrustSummary(trades: Trade[]) {
  const trustedTrades = trades.filter((trade) => getTradeTrustState(trade) === 'trusted')
  const incompleteTrades = trades.filter((trade) => getTradeTrustState(trade) === 'incomplete')
  const completeWithoutPnL = trades.filter((trade) => getTradeTrustState(trade) === 'missing-pnl')
  const missingCurrencyTrades = trades.filter((trade) => getTradeTrustState(trade) === 'missing-currency')
  const openTrades = trades.filter((trade) => getTradeTrustState(trade) === 'open')
  const conflictingTrades = trades.filter((trade) => getTradeTrustState(trade) === 'conflict')
  const totalTrades = trades.length

  return {
    totalTrades,
    trustedTrades: trustedTrades.length,
    incompleteTrades: incompleteTrades.length,
    completeWithoutPnL: completeWithoutPnL.length,
    missingCurrencyTrades: missingCurrencyTrades.length,
    openTrades: openTrades.length,
    conflictingTrades: conflictingTrades.length,
    trustedCoverage: totalTrades ? (trustedTrades.length / totalTrades) * 100 : 0,
    trustedPnLNet: trustedTrades.reduce((sum, trade) => sum + (trade.netPnL ?? 0), 0),
    monetaryScope: resolveTradeMonetaryScope(trustedTrades),
    needsAttention: incompleteTrades.length + completeWithoutPnL.length + missingCurrencyTrades.length + openTrades.length + conflictingTrades.length,
  }
}
