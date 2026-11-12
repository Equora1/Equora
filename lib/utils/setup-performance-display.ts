import type { SetupPerformanceRow } from '@/lib/utils/setup-analytics'
import { formatCurrency, formatRMultiple } from '@/lib/utils/calculations'

type SetupMetricInput = Pick<SetupPerformanceRow,
  'trades' | 'resolvedTrades' | 'netPnL' | 'winRate' | 'profitFactor' |
  'grossProfit' | 'grossLoss' | 'averageR' | 'riskCoverage' | 'currency' | 'monetaryScopeKind'>

// Availability belongs to the presentation: zero-valued metric defaults are not
// evidence that a result or a quotient exists. Core calculations stay unchanged.
export function getSetupPerformanceDisplay(row?: SetupMetricInput) {
  const hasTrades = Boolean(row && row.trades > 0)
  const hasResults = Boolean(hasTrades && row && row.resolvedTrades > 0)
  const moneyComparable = Boolean(hasResults && row?.monetaryScopeKind === 'single' && row.currency)
  const moneyNote = !row
    ? 'Noch keine Auswertung verfügbar.'
    : !hasTrades
    ? 'Noch keine Trades für dieses Setup.'
    : !hasResults
      ? 'Noch keine auswertbaren Ergebnisse.'
      : row?.monetaryScopeKind === 'mixed'
        ? 'Geld-Auswertung gesperrt: mehrere Währungen ohne Umrechnung.'
        : !moneyComparable
          ? 'Geld-Auswertung gesperrt: Währung fehlt oder wird nicht unterstützt.'
          : 'Ergebnis der berücksichtigten Trades.'
  const pnl = moneyComparable && row ? formatCurrency(row.netPnL, 0, row.currency) : hasResults ? 'Gesperrt' : '—'
  const winRate = hasResults && row ? `${row.winRate.toFixed(0)}%` : '—'
  // A loss-only sample has a defined PF of zero. With only break-even results
  // both sides are zero; with profits but no losses the existing ∞ convention applies.
  const profitFactor = moneyComparable && row && (row.grossLoss < 0 || row.grossProfit > 0)
    ? row.profitFactor === Infinity ? '∞' : Number.isFinite(row.profitFactor) ? row.profitFactor.toFixed(2) : '—'
    : '—'
  const averageR = hasTrades && row ? formatRMultiple(row.averageR) : '—'
  const riskCoverage = hasTrades && row ? `${row.riskCoverage}%` : '—'
  const summary = !hasResults
    ? moneyNote
    : `${pnl} · ${winRate} Trefferquote · ${averageR}${moneyComparable ? '' : ` · ${moneyNote}`}`

  return { hasTrades, hasResults, moneyComparable, pnl, winRate, profitFactor, averageR, riskCoverage, moneyNote, summary }
}
