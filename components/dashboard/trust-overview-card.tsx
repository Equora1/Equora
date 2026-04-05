import type { Trade } from '@/lib/types/trade'
import { formatCurrency, formatPlainNumber } from '@/lib/utils/calculations'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

export function TrustOverviewCard({ trades }: { trades: Trade[] }) {
  const summary = getTradeTrustSummary(trades)

  return (
    <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-5 shadow-2xl">
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-300/70">Belastbare P&amp;L</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Welche Trades wirklich zählen</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Kennzahlen laufen nur auf belastbaren Trades. Schnellerfassungen bleiben sichtbar, zählen aber noch nicht mit. So bleibt die Auswertung ehrlich.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{summary.trustedTrades} belastbar</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{summary.openTrades + summary.incompleteTrades} offen / quick</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">{summary.completeWithoutPnL} ohne P&amp;L-Basis</span>
            {summary.conflictingTrades > 0 ? <span className="rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-red-100">{summary.conflictingTrades} Konflikt</span> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Belastbare Abdeckung</p>
          <p className="mt-3 text-3xl font-semibold text-emerald-200">{formatPlainNumber(summary.trustedCoverage, 0)}%</p>
          <p className="mt-2 text-sm text-white/50">{summary.trustedTrades} von {summary.totalTrades} Trades fließen aktuell in Equity und Net P&amp;L ein.</p>
          <p className={`mt-4 text-xl font-semibold ${summary.trustedPnLNet >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{formatCurrency(summary.trustedPnLNet)}</p>
          <p className="mt-1 text-xs text-white/45">{summary.needsAttention > 0 ? `${summary.needsAttention} Trades brauchen Nacharbeit` : 'Keine offenen Datenlücken'}</p>
        </div>
      </div>
    </div>
  )
}
