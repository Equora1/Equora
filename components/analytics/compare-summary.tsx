import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { CompareResult } from '@/lib/utils/compare'

function formatPnL(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)} €`
}

function formatR(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`
}

export function CompareSummary({ rows }: { rows: CompareResult[] }) {
  const best = rows[0]
  const worst = rows.length > 1 ? rows[rows.length - 1] : undefined

  if (!best) {
    return (
      <FuturisticCard glow="orange" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Vergleich</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">Noch keine Gegenüberstellung</h3>
        <p className="mt-4 text-sm leading-7 text-white/62">
          Sobald genug Kategorien mit belastbaren Trades vorhanden sind, zeigt Equora hier einen klaren Gewinner und ein echtes Reibungsmuster.
        </p>
      </FuturisticCard>
    )
  }

  if (!worst) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <FuturisticCard glow="emerald" className="p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Erster lesbarer Anker</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-300">{best.label}</h3>
          <div className="mt-4 space-y-2 text-sm text-white/62">
            <p>Trades: {best.totalTrades}</p>
            <p>Winrate: {best.winRate.toFixed(1)}%</p>
            <p>Ø R: {formatR(best.avgR)}</p>
            <p>P&amp;L: {formatPnL(best.netPnL)}</p>
          </div>
        </FuturisticCard>

        <FuturisticCard glow="orange" className="p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Noch kein Gegenpol</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">Mehr Material nötig</h3>
          <p className="mt-4 text-sm leading-7 text-white/62">
            Mit nur einer belastbaren Kategorie wäre „schwächster Performer“ nur ein Etikettenspiel. Erst mehr Vergleich, dann klare Gegenspieler.
          </p>
        </FuturisticCard>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FuturisticCard glow="emerald" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Stärkster Bereich</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-300">{best.label}</h3>
        <div className="mt-4 space-y-2 text-sm text-white/62">
          <p>Trades: {best.totalTrades}</p>
          <p>Winrate: {best.winRate.toFixed(1)}%</p>
          <p>Ø R: {formatR(best.avgR)}</p>
          <p>P&amp;L: {formatPnL(best.netPnL)}</p>
        </div>
      </FuturisticCard>

      <FuturisticCard glow="red" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">Schwächster Bereich</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-red-300">{worst.label}</h3>
        <div className="mt-4 space-y-2 text-sm text-white/62">
          <p>Trades: {worst.totalTrades}</p>
          <p>Winrate: {worst.winRate.toFixed(1)}%</p>
          <p>Ø R: {formatR(worst.avgR)}</p>
          <p>P&amp;L: {formatPnL(worst.netPnL)}</p>
        </div>
      </FuturisticCard>
    </div>
  )
}
