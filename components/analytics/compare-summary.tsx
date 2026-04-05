import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { CompareResult } from '@/lib/utils/compare'

export function CompareSummary({ rows }: { rows: CompareResult[] }) {
  const best = rows[0]
  const worst = rows[rows.length - 1]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FuturisticCard glow="emerald" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Best Performer</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-300">{best?.label ?? '—'}</h3>
        <div className="mt-4 space-y-2 text-sm text-white/62">
          <p>Trades: {best?.totalTrades ?? 0}</p>
          <p>Winrate: {best ? `${best.winRate.toFixed(1)}%` : '—'}</p>
          <p>Avg R: {best ? `${best.avgR >= 0 ? '+' : ''}${best.avgR.toFixed(2)}R` : '—'}</p>
          <p>Net P&amp;L: {best ? `${best.netPnL >= 0 ? '+' : ''}${best.netPnL.toFixed(0)} €` : '—'}</p>
        </div>
      </FuturisticCard>

      <FuturisticCard glow="red" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Weakest Performer</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-red-300">{worst?.label ?? '—'}</h3>
        <div className="mt-4 space-y-2 text-sm text-white/62">
          <p>Trades: {worst?.totalTrades ?? 0}</p>
          <p>Winrate: {worst ? `${worst.winRate.toFixed(1)}%` : '—'}</p>
          <p>Avg R: {worst ? `${worst.avgR >= 0 ? '+' : ''}${worst.avgR.toFixed(2)}R` : '—'}</p>
          <p>Net P&amp;L: {worst ? `${worst.netPnL >= 0 ? '+' : ''}${worst.netPnL.toFixed(0)} €` : '—'}</p>
        </div>
      </FuturisticCard>
    </div>
  )
}
