import Link from 'next/link'
import type { Trade } from '@/lib/types/trade'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'
import { brokerFileImportCapability } from '@/lib/utils/broker-file-import-capability'

export function ReviewEmptyStateCard({ trades }: { trades: Trade[] }) {
  const trust = getTradeTrustSummary(trades)
  const hasReviewSeed = trades.length >= 3

  if (hasReviewSeed && trust.trustedTrades > 0) return null

  const title = !trades.length
    ? 'Noch keine Trades'
    : trust.trustedTrades === 0
      ? 'Noch keine belastbaren Trades'
      : 'Noch zu wenig Daten'

  const copy = !trades.length
    ? 'Erfasse einen Trade oder prüfe eine Importdatei. Danach wird Review sinnvoll.'
    : trust.trustedTrades === 0
      ? 'Mindestens ein Trade braucht P&L oder Abschlussdaten.'
      : 'Mit mehr sauberen Trades wird Review belastbarer.'

  return (
    <section className="mb-6 rounded-3xl border border-orange-400/15 bg-orange-400/[0.04] p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
                  </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
          <MetricTile label="Trades" value={String(trades.length)} />
          <MetricTile label="Belastbar" value={String(trust.trustedTrades)} />
          <MetricTile label="Fehlen noch" value={String(Math.max(0, 3 - trades.length))} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/trades"
          className="inline-flex items-center rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition hover:border-orange-400/40 hover:bg-orange-400/14"
        >
          Trade erfassen
        </Link>
        {brokerFileImportCapability.previewEnabled ? (
          <Link
            href={brokerFileImportCapability.previewHref}
            title={brokerFileImportCapability.blockedReason}
            className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/65 transition hover:border-white/20 hover:text-white"
          >
            {brokerFileImportCapability.previewActionLabel}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center rounded-full border border-white/8 bg-black/20 px-4 py-2 text-sm font-medium text-white/40"
          >
            {brokerFileImportCapability.blockedActionLabel}
          </span>
        )}
      </div>
    </section>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  )
}
