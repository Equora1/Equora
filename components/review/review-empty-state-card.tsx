import Link from 'next/link'
import type { DailyNoteRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

export function ReviewEmptyStateCard({ trades, dailyNotes }: { trades: Trade[]; dailyNotes: DailyNoteRow[] }) {
  const trust = getTradeTrustSummary(trades)
  const hasReviewSeed = dailyNotes.length > 0 || trades.length >= 3

  if (hasReviewSeed && trust.trustedTrades > 0) return null

  const title = !trades.length
    ? 'Review braucht erst ein paar echte Spuren'
    : trust.trustedTrades === 0
      ? 'Review sieht schon Trades, aber noch keinen trusted Untergrund'
      : 'Noch etwas Material, dann wird Review wirklich nützlich'

  const copy = !trades.length
    ? 'Ein leeres Review ist kein Fehler, sondern ein ehrlicher Spiegel. Erst ein paar Trades oder eine Daily Note geben dem Modul etwas, das es wirklich lesen kann.'
    : trust.trustedTrades === 0
      ? 'Schnellerfassungen sind schon da, aber ohne einen vervollständigten Trade bleibt das Feedback noch zu vorsichtig. Ein belastbarer Trade reicht für den ersten brauchbaren Blick.'
      : 'Mit noch ein bis zwei zusätzlichen Trades oder einer Daily Note werden Muster, Warnsignale und Vergleiche deutlich stabiler.'

  return (
    <section className="mb-6 rounded-3xl border border-orange-400/15 bg-orange-400/[0.04] p-5 shadow-2xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-orange-200/70">Review Onboarding</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{copy}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
          <MetricTile label="Trades" value={String(trades.length)} />
          <MetricTile label="Belastbar" value={String(trust.trustedTrades)} />
          <MetricTile label="Daily Notes" value={String(dailyNotes.length)} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/trades"
          className="inline-flex items-center rounded-full border border-orange-400/25 bg-orange-400/10 px-4 py-2 text-sm font-medium text-orange-100 transition hover:border-orange-400/40 hover:bg-orange-400/14"
        >
          Zu Trades
        </Link>
        <Link
          href="/daily-note"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
        >
          Daily Note schreiben
        </Link>
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
