import Link from 'next/link'
import type { Trade } from '@/lib/types/trade'
import { getTradeTrustMeta } from '@/lib/utils/trade-trust'

export function RecentTradesCard({ trades }: { trades: Trade[] }) {
  return (
    <div className="rounded-3xl border border-orange-400/15 bg-white/5 p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Letzte Trades</h2>
          <p className="text-sm text-white/50">Schneller Blick auf Ausführung, Ergebnis und Datenstatus</p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
          {trades.length} Einträge
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        {trades.length ? (
          <>
            <div className="grid grid-cols-7 gap-2 border-b border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.2em] text-white/45">
              <span>Datum</span>
              <span>Markt</span>
              <span>Setup</span>
              <span>Ergebnis</span>
              <span>R</span>
              <span>Emotion</span>
              <span>Qualität</span>
            </div>

            {trades.map((trade, index) => (
              <Link
                key={trade.id}
                href={`/trades?tradeId=${encodeURIComponent(trade.id)}`}
                className={`grid w-full grid-cols-7 gap-2 px-4 py-4 text-left text-sm transition hover:bg-white/5 ${
                  index !== trades.length - 1 ? 'border-b border-white/10' : ''
                }`}
              >
                <span className="text-white/75">{trade.date}</span>
                <span className="text-white">{trade.market}</span>
                <span className="flex flex-wrap items-center gap-2 text-white/70">
                  <span>{trade.setup}</span>
                  {(() => {
                    const trust = getTradeTrustMeta(trade)
                    const badgeClass = trust.tone === 'red'
                      ? 'border-red-400/20 bg-red-400/10 text-red-100'
                      : trust.tone === 'orange'
                        ? 'border-orange-400/20 bg-orange-400/10 text-orange-100/85'
                        : trust.tone === 'emerald'
                          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                          : 'border-white/10 bg-white/5 text-white/55'
                    return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeClass}`}>{trust.shortLabel}</span>
                  })()}
                </span>
                <span className={trade.netPnL === undefined || trade.netPnL === null ? 'text-white/45' : trade.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {trade.result}
                </span>
                <span className={(trade.rValue ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}>{trade.r}</span>
                <span className="text-orange-200/80">{trade.emotion}</span>
                <span className="text-white/60">{trade.quality}</span>
              </Link>
            ))}
          </>
        ) : (
          <div className="px-5 py-10 text-center">
            <p className="text-lg font-medium text-white">Noch keine Trades im Journal</p>
            <p className="mt-2 text-sm leading-6 text-white/55">Sobald die erste Schnellerfassung gespeichert ist, taucht sie hier wieder auf und bildet den roten Faden durchs ganze Produkt.</p>
          </div>
        )}
      </div>
    </div>
  )
}
