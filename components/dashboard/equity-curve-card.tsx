import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import type { Trade } from '@/lib/types/trade'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { buildEquitySeries, chartFrame } from '@/lib/utils/chart-series'
import { formatMoney, getMonetaryScopeMessage, type MonetaryScope } from '@/lib/utils/currency'

export function EquityCurveCard({ trades, locale = 'de', monetaryScope }: {
  trades: Trade[]
  locale?: JournalLocale
  monetaryScope?: MonetaryScope
}) {
  const text = journalText(locale)
  const series = buildEquitySeries(trades)
  const scope = monetaryScope ?? series.monetaryScope
  const lastPoint = scope.isComparable ? series.points.at(-1) : undefined
  const tone = series.latestValue > 0 ? 'text-emerald-300' : series.latestValue < 0 ? 'text-red-300' : 'text-white'

  return (
    <FuturisticCard className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-lg font-semibold text-white">{text('Ergebnisverlauf', 'P&L over time')}</h2>
          <p className="mt-1 text-xs text-white/65">{text('Kumuliertes Netto-P&L', 'Cumulative net P&L')}</p>
        </div>
        {lastPoint && (
          <p className={`break-words text-2xl font-semibold tracking-tight tabular-nums ${tone}`}>
            {formatMoney(series.latestValue, scope.currency, 0, locale)}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-[#0c0a09] px-2 py-3 sm:px-3">
        {lastPoint ? (
          <>
            <svg viewBox={`0 0 ${chartFrame.width} ${chartFrame.height}`} preserveAspectRatio="none"
              className="h-[190px] w-full sm:h-[238px]" role="img"
              aria-label={text(`Netto-P&L über ${series.totalPoints} abgeschlossene Trades`, `Net P&L across ${series.totalPoints} closed trades`)}>
              {[40, 90, 140, 190].map((y) => (
                <line key={y} x1="0" y1={y} x2={chartFrame.width} y2={y} stroke="rgba(255,255,255,0.08)" />
              ))}
              <line x1="0" y1={series.zeroLineY} x2={chartFrame.width} y2={series.zeroLineY}
                stroke="rgba(255,255,255,0.28)" strokeDasharray="4 5" />
              <path d={series.areaPath} fill="rgba(240,168,85,0.13)" />
              <path d={series.linePath} fill="none" stroke="#f0a855" strokeWidth="2.5"
                vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={lastPoint.x} cy={lastPoint.y} r="4" fill="#ffc57d" />
            </svg>
            <div className="flex justify-between gap-2 px-1 text-xs text-white/65">
              <span>{text('Beginn', 'Start')}</span>
              <span>{series.totalPoints} {series.totalPoints === 1 ? 'Trade' : 'Trades'}</span>
            </div>
          </>
        ) : (
          <p className="grid min-h-[190px] place-items-center px-3 text-center text-sm text-white/65 sm:min-h-[238px]">
            {getMonetaryScopeMessage(scope, locale)}
          </p>
        )}
      </div>
    </FuturisticCard>
  )
}
