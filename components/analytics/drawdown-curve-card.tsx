import type { Trade } from '@/lib/types/trade'
import { buildDrawdownSeries, chartFrame } from '@/lib/utils/chart-series'
import { formatPlainNumber } from '@/lib/utils/calculations'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'
import { formatMoney, getMonetaryScopeMessage } from '@/lib/utils/currency'

export function DrawdownCurveCard({ trades }: { trades: Trade[] }) {
  const series = buildDrawdownSeries(trades)
  const trustSummary = getTradeTrustSummary(trades)

  return (
    <div className="rounded-3xl border border-sky-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Drawdown Kurve</h2>
          <p className="text-sm text-white/50">
            Unterwasser-Linie nur aus belastbaren Trades. Coverage: {trustSummary.trustedTrades}/{trustSummary.totalTrades} ({formatPlainNumber(trustSummary.trustedCoverage, 0)}%).
          </p>
        </div>
        <div className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1 text-xs text-red-200">
          {series.monetaryScope.isComparable ? `tiefste Delle ${formatMoney(-series.deepestValue, series.monetaryScope.currency)}` : 'Geld-Auswertung gesperrt'}
        </div>
      </div>

      <div className="relative h-64 overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.14),transparent_38%)]" />
        {series.totalPoints ? (
          <svg viewBox={`0 0 ${chartFrame.width} ${chartFrame.height}`} className="relative h-full w-full">
            {[40, 90, 140, 190].map((y) => (
              <line key={y} x1="0" y1={y} x2={chartFrame.width} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="6 8" />
            ))}
            <line x1="0" y1={series.zeroLineY} x2={chartFrame.width} y2={series.zeroLineY} stroke="rgba(255,255,255,0.16)" strokeDasharray="8 10" />
            <path d={series.areaPath} fill="rgba(248,113,113,0.14)" />
            <path d={series.linePath} fill="none" stroke="rgb(125,211,252)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {series.points.map((point) => (
              <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="4" fill={point.value < 0 ? 'rgb(248,113,113)' : 'rgb(125,211,252)'} />
            ))}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/50">{getMonetaryScopeMessage(series.monetaryScope)}</div>
        )}
      </div>
    </div>
  )
}
