import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { CompareResult } from '@/lib/utils/compare'

export function CompareTable({ title, rows }: { title: string; rows: CompareResult[] }) {
  return (
    <FuturisticCard glow="orange" className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/36">Compare &amp; Conquer</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">{title}</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/45">{rows.length} Kategorien</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-6 gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-white/40">
          <span>Kategorie</span>
          <span>Trades</span>
          <span>Winrate</span>
          <span>Avg R</span>
          <span>Net P&amp;L</span>
          <span>PF</span>
        </div>

        {rows.length ? (
          rows.map((row, index) => (
            <div key={row.label} className={`grid grid-cols-6 gap-2 px-4 py-4 text-sm ${index !== rows.length - 1 ? 'border-b border-white/10' : ''}`}>
              <span className="font-medium text-white">{row.label}</span>
              <span className="text-white/65">{row.totalTrades}</span>
              <span className={row.winRate >= 50 ? 'text-emerald-300' : 'text-red-300'}>{row.winRate.toFixed(1)}%</span>
              <span className={row.avgR >= 0 ? 'text-emerald-300' : 'text-red-300'}>{row.avgR >= 0 ? '+' : ''}{row.avgR.toFixed(2)}R</span>
              <span className={row.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>{row.netPnL >= 0 ? '+' : ''}{row.netPnL.toFixed(0)} €</span>
              <span className="text-white/65">{row.profitFactor === Infinity ? '∞' : row.profitFactor.toFixed(2)}</span>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-sm text-white/45">
            Für diese Auswahl sind noch keine Vergleichsdaten vorhanden.
          </div>
        )}
      </div>
    </FuturisticCard>
  )
}
