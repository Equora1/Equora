import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { buildEquitySeries, chartFrame } from '@/lib/utils/chart-series'
import { formatPlainNumber } from '@/lib/utils/calculations'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'
import { formatMoney, getMonetaryScopeMessage } from '@/lib/utils/currency'
import { DASHBOARD_TRADE_WINDOW_LIMIT } from '@/lib/utils/dashboard'

export function EquityCurveCard({ trades, locale = 'de' }: { trades: Trade[]; locale?: JournalLocale }) {
  const text = journalText(locale)
  const series = buildEquitySeries(trades)
  const trust = getTradeTrustSummary(trades)
  const positive = series.latestValue >= 0
  const valueTone = !series.monetaryScope.isComparable
    ? 'text-[#f3bd7f]'
    : positive
      ? 'text-emerald-300'
      : 'text-red-300'

  return (
    <FuturisticCard className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eq-eyebrow">Performance</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{text('Kumuliertes Netto-P&L', 'Cumulative net P&L')}</h2>
          <p className="mt-2 text-xs leading-5 text-white/60">
            {text(
              `Maximal ${DASHBOARD_TRADE_WINDOW_LIMIT} zuletzt geladene Trades · ${trust.trustedTrades} belastbar · ${formatPlainNumber(trust.trustedCoverage, 0, locale)}% berücksichtigt`,
              `Up to ${DASHBOARD_TRADE_WINDOW_LIMIT} recent trades · ${trust.trustedTrades} reliable · ${formatPlainNumber(trust.trustedCoverage, 0, locale)}% included`,
            )}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">{text('Fenster-Summe', 'Total for this period')}</p>
          <p className={`mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums ${valueTone}`}>
            {series.monetaryScope.isComparable
              ? formatMoney(series.latestValue, series.monetaryScope.currency, 0, locale)
              : text('Gesperrt', 'Unavailable')}
          </p>
        </div>
      </div>

      <div className="relative mt-6 h-[290px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#080808] px-2 py-4 sm:px-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_0%,rgba(200,130,58,0.13),transparent_45%)]" />
        {series.totalPoints ? (
          <svg
            viewBox={`0 0 ${chartFrame.width} ${chartFrame.height}`}
            className="relative h-full w-full"
            role="img"
            aria-label={text(
              `Kumuliertes realisiertes Netto-P&L im geladenen Fenster aus ${series.totalPoints} belastbaren Trades`,
              `Cumulative realised net P&L from ${series.totalPoints} reliable ${series.totalPoints === 1 ? 'trade' : 'trades'}`,
            )}
          >
            <defs>
              <linearGradient id="dashboard-equity-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f0a855" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#f0a855" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dashboard-equity-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#9f6428" />
                <stop offset="100%" stopColor="#f0a855" />
              </linearGradient>
            </defs>
            {[40, 90, 140, 190].map((y) => (
              <line key={y} x1="0" y1={y} x2={chartFrame.width} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 9" />
            ))}
            <path d={series.areaPath} fill="url(#dashboard-equity-area)" />
            <path d={series.linePath} fill="none" stroke="url(#dashboard-equity-line)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {series.points.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r={index === series.points.length - 1 ? 5 : 2.5}
                fill={index === series.points.length - 1 ? '#f0a855' : '#c8823a'}
              />
            ))}
          </svg>
        ) : (
          <div className="relative flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-white/60">
            {getMonetaryScopeMessage(series.monetaryScope, locale)}
          </div>
        )}
      </div>
    </FuturisticCard>
  )
}
