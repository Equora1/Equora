import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { TagStat } from '@/lib/types/tag'

export function TagInsights({ rows }: { rows: TagStat[] }) {
  const hasComparison = rows.length > 1

  return (
    <FuturisticCard glow="orange" className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/36">Behavior Tags</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">Tag-Wirkung</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/45">{rows.length} Tags</div>
      </div>

      {!rows.length ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-white/55">
          Für diese Auswahl sind noch keine belastbaren Tag-Daten vorhanden.
        </div>
      ) : !hasComparison ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{rows[0].tag}</p>
                <p className="mt-1 text-xs text-white/45">
                  {rows[0].totalTrades} Trades · Winrate {rows[0].winRate.toFixed(1)}% · Avg R {rows[0].avgR >= 0 ? '+' : ''}
                  {rows[0].avgR.toFixed(2)}R
                </p>
              </div>
              <span className={rows[0].netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                {rows[0].netPnL >= 0 ? '+' : ''}{rows[0].netPnL.toFixed(0)} €
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/55">
            Noch kein belastbarer Tag-Vergleich.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.tag} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{row.tag}</p>
                  <p className="mt-1 text-xs text-white/45">
                    {row.totalTrades} Trades · Winrate {row.winRate.toFixed(1)}% · Avg R {row.avgR >= 0 ? '+' : ''}
                    {row.avgR.toFixed(2)}R
                  </p>
                </div>
                <span className={row.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {row.netPnL >= 0 ? '+' : ''}{row.netPnL.toFixed(0)} €
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </FuturisticCard>
  )
}
