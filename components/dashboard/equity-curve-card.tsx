import type { Trade } from '@/lib/types/trade'
import { buildEquitySeries, chartFrame } from '@/lib/utils/chart-series'
import { formatPlainNumber } from '@/lib/utils/calculations'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

export function EquityCurveCard({ trades }: { trades: Trade[] }) {
  const series = buildEquitySeries(trades)
  const trustSummary = getTradeTrustSummary(trades)

  return <div className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-semibold">Equity Kurve</h2><p className="text-sm text-white/50">Nur belastbare Trades fließen ein. Coverage: {trustSummary.trustedTrades}/{trustSummary.totalTrades} ({formatPlainNumber(trustSummary.trustedCoverage, 0)}%).</p></div><div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">{series.latestValue >= 0 ? '+' : ''}{series.latestValue.toFixed(0)} €</div></div><div className="relative h-64 overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-4"><div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_45%)]" />{series.totalPoints ? <svg viewBox={`0 0 ${chartFrame.width} ${chartFrame.height}`} className="relative h-full w-full">{[40, 90, 140, 190].map((y)=><line key={y} x1="0" y1={y} x2={chartFrame.width} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="6 8" />)}<path d={series.areaPath} fill="rgba(74,222,128,0.14)" /><path d={series.linePath} fill="none" stroke="rgb(74,222,128)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{series.points.map((point)=><circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="4" fill="rgb(74,222,128)" />)}</svg> : <div className="flex h-full items-center justify-center text-sm text-white/40">Noch keine belastbaren Trades für eine Equity-Kurve vorhanden.</div>}</div></div>
}
