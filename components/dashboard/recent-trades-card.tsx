import Link from 'next/link'
import type { Trade } from '@/lib/types/trade'
import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { formatRMultiple } from '@/lib/utils/calculations'
import { getDashboardRObservation } from '@/lib/utils/dashboard'
import { getTradeTrustMeta } from '@/lib/utils/trade-trust'

export function RecentTradesCard({ trades }: { trades: Trade[] }) {
  return (
    <FuturisticCard className="p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eq-eyebrow">Journal</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Letzte Trades</h2>
          <p className="mt-2 text-xs leading-5 text-white/60">Direkt zum Datensatz, Review oder fehlenden Abschluss.</p>
        </div>
        <Link
          href="/trades"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3.5 py-2 text-xs font-medium text-white/62 transition hover:border-[#c8823a]/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60"
        >
          Alle Trades
          <AppIcon name="arrow" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07]">
        {trades.length ? (
          <>
            <div className="hidden grid-cols-[0.85fr_1fr_1fr_0.8fr_0.7fr_0.7fr] gap-3 border-b border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[10px] uppercase tracking-[0.16em] text-white/60 lg:grid">
              <span>Datum</span>
              <span>Markt</span>
              <span>Setup</span>
              <span>Status</span>
              <span className="text-right">R-Status</span>
              <span className="text-right">Qualität</span>
            </div>

            <div className="divide-y divide-white/[0.06]">
              {trades.map((trade) => <RecentTradeRow key={trade.id} trade={trade} />)}
            </div>
          </>
        ) : (
          <div className="px-5 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-[#c8823a]/20 bg-[#c8823a]/[0.07] text-[#f0a855]">
              <AppIcon name="trades" className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-medium text-white">Noch keine Trades im Journal</p>
            <p className="mt-2 text-xs text-white/60">Erfasse einen Trade oder prüfe einen Dateiimport.</p>
          </div>
        )}
      </div>
    </FuturisticCard>
  )
}

function RecentTradeRow({ trade }: { trade: Trade }) {
  const trust = getTradeTrustMeta(trade)
  const badgeClass = trust.tone === 'red'
    ? 'border-red-400/20 bg-red-400/10 text-red-200'
    : trust.tone === 'orange'
      ? 'border-[#c8823a]/25 bg-[#c8823a]/10 text-[#f3bd7f]'
      : trust.tone === 'emerald'
        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
        : 'border-white/10 bg-white/[0.04] text-white/55'
  const resultClass = trade.netPnL === undefined || trade.netPnL === null
    ? 'text-white/60'
    : trade.netPnL >= 0
      ? 'text-emerald-300'
      : 'text-red-300'
  const rObservation = getDashboardRObservation(trade)
  const rLabel = rObservation.value === null
    ? '—'
    : rObservation.source === 'planned'
      ? `Plan ${formatRMultiple(rObservation.value)}`
      : rObservation.source === 'realized_partial'
        ? `Teil ${formatRMultiple(rObservation.value)}`
        : formatRMultiple(rObservation.value)
  const rClass = rObservation.value === null
    ? 'text-white/60'
    : rObservation.source === 'planned'
      ? 'text-[#e8b978]'
      : rObservation.value > 0
        ? 'text-emerald-300'
        : rObservation.value < 0
          ? 'text-red-300'
          : 'text-white/70'

  return (
    <Link
      href={`/trades?tradeId=${encodeURIComponent(trade.id)}`}
      className="group block bg-black/[0.08] px-4 py-4 transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f0a855]/60 lg:grid lg:grid-cols-[0.85fr_1fr_1fr_0.8fr_0.7fr_0.7fr] lg:items-center lg:gap-3"
    >
      <div className="flex items-start justify-between gap-3 lg:contents">
        <span className="text-xs tabular-nums text-white/52 lg:text-sm">{trade.date}</span>
        <span className="font-medium text-white lg:text-sm">{trade.market || 'Markt offen'}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0 lg:block">
        <span className="text-xs text-white/62 lg:text-sm">{trade.setup || 'Setup offen'}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] lg:hidden ${badgeClass}`}>{trust.shortLabel}</span>
      </div>
      <span className={`mt-3 block text-sm font-medium tabular-nums lg:mt-0 ${resultClass}`}>{trade.result || 'Offen'}</span>
      <span className={`mt-1 block text-xs tabular-nums lg:mt-0 lg:text-right lg:text-sm ${rClass}`}>
        {rLabel}
      </span>
      <span className={`hidden w-fit justify-self-end rounded-full border px-2 py-1 text-[9px] uppercase tracking-[0.14em] lg:inline-flex ${badgeClass}`}>{trust.shortLabel}</span>
    </Link>
  )
}
