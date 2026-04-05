import Link from 'next/link'
import type { Trade } from '@/lib/types/trade'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

export function TradesFirstRunCard({
  trades,
  firstIncompleteTradeId,
}: {
  trades: Trade[]
  firstIncompleteTradeId?: string
}) {
  const trust = getTradeTrustSummary(trades)

  if (trust.totalTrades > 0 && trust.trustedTrades > 0) return null

  const hasTrades = trust.totalTrades > 0
  const title = hasTrades ? 'Jetzt aus Schnellerfassung einen belastbaren Trade machen' : 'Hier startet der erste Journal-Kreislauf'
  const copy = hasTrades
    ? trust.incompleteTrades > 0
      ? `${trust.incompleteTrades} Schnellerfassungen warten noch auf den nächsten Schritt. Ein sauber vervollständigter Trade macht Dashboard und Feedback sofort nützlicher.`
      : 'Es gibt schon Trades, aber noch keine belastbare P&L-Basis. Ein vollständiger Eintrag reicht, damit die Kennzahlen echten Boden bekommen.'
    : 'Starte mit Markt, Setup, Ergebnis und 1 bis 2 Tags. Mehr braucht der erste Trade nicht.'

  return (
    <section className="rounded-3xl border border-[#c8823a]/16 bg-[#c8823a]/[0.045] p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#f0a855]/78">Erster Trade</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{copy}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
          <MetricTile label="Trades" value={String(trust.totalTrades)} />
          <MetricTile label="Kurz erfasst" value={String(trust.incompleteTrades)} />
          <MetricTile label="Belastbar" value={String(trust.trustedTrades)} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {firstIncompleteTradeId ? (
          <Link
            href={`/trades?editTradeId=${encodeURIComponent(firstIncompleteTradeId)}#trade-editor`}
            className="inline-flex items-center rounded-full eq-button-secondary px-4 py-2 text-sm font-medium transition hover:opacity-95"
          >
            Erste Schnellerfassung vervollständigen
          </Link>
        ) : null}
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full eq-button-ghost px-4 py-2 text-sm transition hover:text-white"
        >
          Datenbasis im Dashboard ansehen
        </Link>
      </div>
    </section>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="eq-card-soft rounded-2xl px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}
