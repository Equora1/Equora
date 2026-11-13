import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'

type SetupMetricInput = Pick<SetupPerformanceRow,
  'trades' | 'resolvedTrades' | 'netPnL' | 'winRate' | 'profitFactor' |
  'grossProfit' | 'grossLoss' | 'averageR' | 'riskCoverage' | 'currency' | 'monetaryScopeKind'>

// Availability belongs to the presentation: zero-valued metric defaults are not
// evidence that a result or a quotient exists. Core calculations stay unchanged.
export function getSetupPerformanceDisplay(row?: SetupMetricInput, locale: JournalLocale = 'de') {
  const text = journalText(locale)
  const hasTrades = Boolean(row && row.trades > 0)
  const hasResults = Boolean(hasTrades && row && row.resolvedTrades > 0)
  const moneyComparable = Boolean(hasResults && row?.monetaryScopeKind === 'single' && row.currency)
  const moneyNote = !row
    ? text('Noch keine Auswertung verfügbar.', 'No analysis available yet.')
    : !hasTrades
    ? text('Noch keine Trades für dieses Setup.', 'No trades for this setup yet.')
    : !hasResults
      ? text('Noch keine auswertbaren Ergebnisse.', 'No results available to analyse yet.')
      : row?.monetaryScopeKind === 'mixed'
        ? text('Geld-Auswertung gesperrt: mehrere Währungen ohne Umrechnung.', 'P&L unavailable because this selection contains multiple currencies.')
        : !moneyComparable
          ? text('Geld-Auswertung gesperrt: Währung fehlt oder wird nicht unterstützt.', 'P&L unavailable because the currency is missing or unsupported.')
          : text('Ergebnis der berücksichtigten Trades.', 'Result of the trades included in the analysis.')
  const pnl = moneyComparable && row ? formatCurrency(row.netPnL, 0, row.currency, locale) : hasResults ? text('Gesperrt', 'Unavailable') : '—'
  const winRate = hasResults && row ? `${row.winRate.toFixed(0)}%` : '—'
  // A loss-only sample has a defined PF of zero. With only break-even results
  // both sides are zero; with profits but no losses the existing ∞ convention applies.
  const profitFactor = moneyComparable && row && (row.grossLoss < 0 || row.grossProfit > 0)
    ? row.profitFactor === Infinity ? '∞' : Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : '—'
    : '—'
  const averageR = hasTrades && row ? formatRMultiple(row.averageR, 2, locale) : '—'
  const riskCoverage = hasTrades && row ? `${row.riskCoverage}%` : '—'
  const summary = !hasResults
    ? moneyNote
    : text(`${pnl} · ${winRate} Trefferquote · ${averageR}${moneyComparable ? '' : ` · ${moneyNote}`}`, `${pnl} · ${winRate} win rate · ${averageR}${moneyComparable ? '' : ` · ${moneyNote}`}`)

  return { hasTrades, hasResults, moneyComparable, pnl, winRate, profitFactor, averageR, riskCoverage, moneyNote, summary }
}

const englishSetupStatus: Readonly<Record<string, readonly [label: string, hint: string]>> = {
  'Ohne Daten': ['No data', 'Review this setup once you have trades.'],
  Beobachten: ['Watch', 'Too few trades to draw a conclusion.'],
  Pausieren: ['Pause', 'Review the rules before trading this setup again.'],
  Prüfen: ['Review', 'Review the cause of the losses before the next entry.'],
  'Risiko offen': ['Risk missing', 'Record stops and risk on more trades.'],
  Aktiv: ['Active', 'Keep following your plan.'],
}

export function getSetupPerformanceStatus(row: Pick<SetupPerformanceRow, 'statusLabel' | 'statusHint'>, locale: JournalLocale) {
  const labels = locale === 'en' && Object.hasOwn(englishSetupStatus, row.statusLabel)
    ? englishSetupStatus[row.statusLabel]
    : undefined
  return { label: labels?.[0] ?? row.statusLabel, hint: labels?.[1] ?? row.statusHint }
}
