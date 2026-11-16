import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { formatRMultiple } from '@/lib/utils/calculations'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { TagStat } from '@/lib/types/tag'
import { formatMoney } from '@/lib/utils/currency'

export function TagInsights({ rows, locale = 'de' }: { rows: TagStat[]; locale?: JournalLocale }) {
  const text = journalText(locale)
  const hasComparison = rows.length > 1

  return (
    <FuturisticCard glow="orange" className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/36">{text('Behavior Tags', 'Behaviour tags')}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">{text('Tag-Wirkung', 'Results by tag')}</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/45">{rows.length} Tags</div>
      </div>

      {!rows.length ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-white/55">
          {text('Für diese Auswahl sind noch keine belastbaren Tag-Daten vorhanden.', 'This selection has no tags with usable trade results.')}
        </div>
      ) : !hasComparison ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{rows[0].tag}</p>
                <p className="mt-1 text-xs text-white/45">
                  {rows[0].totalTrades} Trades · {text('Trefferquote', 'Win rate')} {rows[0].winRate.toFixed(1)}% · Avg R {formatRMultiple(rows[0].avgR, 2, locale)}
                </p>
              </div>
              <span className={rows[0].netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                {rows[0].currency ? formatMoney(rows[0].netPnL, rows[0].currency, 0, locale) : '—'}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white/55">
            {text('Noch kein belastbarer Tag-Vergleich.', 'At least two tags need usable results for a comparison.')}
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
                    {row.totalTrades} Trades · {text('Trefferquote', 'Win rate')} {row.winRate.toFixed(1)}% · Avg R {formatRMultiple(row.avgR, 2, locale)}
                  </p>
                </div>
                <span className={row.netPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                  {row.currency ? formatMoney(row.netPnL, row.currency, 0, locale) : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </FuturisticCard>
  )
}
