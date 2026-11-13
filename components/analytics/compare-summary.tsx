import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatRMultiple } from '@/lib/utils/calculations'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { CompareResult } from '@/lib/utils/compare'
import { formatMoney } from '@/lib/utils/currency'

function formatPnL(row: CompareResult, locale: JournalLocale) {
  return row.currency ? formatMoney(row.netPnL, row.currency, 0, locale) : '—'
}

export function CompareSummary({ rows, locale = 'de' }: { rows: CompareResult[]; locale?: JournalLocale }) {
  const text = journalText(locale)
  const best = rows[0]
  const worst = rows.length > 1 ? rows[rows.length - 1] : undefined

  if (!best) {
    return (
      <FuturisticCard glow="orange" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{text('Vergleich', 'Comparison')}</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">{text('Noch keine Gegenüberstellung', 'No comparison yet')}</h3>
        <p className="mt-4 text-sm leading-7 text-white/62">
          {text('Sobald genug Kategorien mit belastbaren Trades vorhanden sind, zeigt Equora hier einen klaren Gewinner und ein echtes Reibungsmuster.', 'Add trades with usable results in at least two categories to compare them.')}
        </p>
      </FuturisticCard>
    )
  }

  if (!worst) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <FuturisticCard glow="emerald" className="p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{text('Erster lesbarer Anker', 'First category')}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-300">{best.label}</h3>
          <div className="mt-4 space-y-2 text-sm text-white/62">
            <p>Trades: {best.totalTrades}</p>
            <p>{text('Trefferquote:', 'Win rate:')} {best.winRate.toFixed(1)}%</p>
            <p>Ø R: {formatRMultiple(best.avgR, 2, locale)}</p>
            <p>P&amp;L: {formatPnL(best, locale)}</p>
          </div>
        </FuturisticCard>

        <FuturisticCard glow="orange" className="p-5">
          <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{text('Noch kein Gegenpol', 'One category so far')}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">{text('Mehr Material nötig', 'More trades needed')}</h3>
          <p className="mt-4 text-sm leading-7 text-white/62">
            {text('Mit nur einer belastbaren Kategorie wäre „schwächster Performer“ nur ein Etikettenspiel. Erst mehr Vergleich, dann klare Gegenspieler.', 'At least two categories need usable results before they can be compared.')}
          </p>
        </FuturisticCard>
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FuturisticCard glow="emerald" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{text('Stärkster Bereich', 'Highest P&L')}</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-emerald-300">{best.label}</h3>
        <div className="mt-4 space-y-2 text-sm text-white/62">
          <p>Trades: {best.totalTrades}</p>
          <p>{text('Trefferquote:', 'Win rate:')} {best.winRate.toFixed(1)}%</p>
          <p>Ø R: {formatRMultiple(best.avgR, 2, locale)}</p>
          <p>P&amp;L: {formatPnL(best, locale)}</p>
        </div>
      </FuturisticCard>

      <FuturisticCard glow="red" className="p-5">
        <p className="text-[10px] uppercase tracking-[0.28em] text-white/36">{text('Schwächster Bereich', 'Lowest P&L')}</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-red-300">{worst.label}</h3>
        <div className="mt-4 space-y-2 text-sm text-white/62">
          <p>Trades: {worst.totalTrades}</p>
          <p>{text('Trefferquote:', 'Win rate:')} {worst.winRate.toFixed(1)}%</p>
          <p>Ø R: {formatRMultiple(worst.avgR, 2, locale)}</p>
          <p>P&amp;L: {formatPnL(worst, locale)}</p>
        </div>
      </FuturisticCard>
    </div>
  )
}
