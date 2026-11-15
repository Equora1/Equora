import { journalText, type JournalLocale } from '@/lib/i18n/journal'
import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { CalendarDaySummary } from '@/lib/utils/calendar'
import { formatMoney } from '@/lib/utils/currency'

export function CalendarDayCard({
  day,
  locale = 'de',
  summary,
  isCurrentMonth = true,
  isSelected = false,
  isToday = false,
  onSelect,
}: {
  day: number | null
  locale?: JournalLocale
  summary?: CalendarDaySummary
  isCurrentMonth?: boolean
  isSelected?: boolean
  isToday?: boolean
  onSelect?: () => void
}) {
  const text = journalText(locale)
  if (!day) return <div className="rounded-2xl border border-white/5 bg-black/10 p-3 opacity-30" />

  const glow = summary?.monetaryScope.isComparable ? (summary.netPnL > 0 ? 'emerald' : summary.netPnL < 0 ? 'red' : 'none') : 'none'
  const todayRing = isToday && !summary ? 'border-orange-400/55 outline outline-1 outline-offset-0 outline-orange-400/75 shadow-[0_0_24px_rgba(240,168,85,0.18)]' : ''
  const selectedRing = isSelected ? 'ring-1 ring-orange-300/55' : ''

  return (
    <FuturisticCard
      glow={glow}
      className={`min-h-[136px] p-0 ${!isCurrentMonth ? 'opacity-50' : ''} ${todayRing} ${selectedRing}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-h-[136px] w-full p-3 text-left transition hover:bg-white/[0.03]"
      >
        <div className="flex items-start justify-between gap-2">
          <span className={`text-sm font-semibold ${isToday && !summary ? 'text-orange-100' : 'text-white'}`}>{day}</span>
          {isToday && !summary ? (
            <span className="rounded-full border border-orange-400/25 bg-orange-400/10 px-2 py-0.5 text-[10px] text-orange-100">{text('Heute', 'Today')}</span>
          ) : summary ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                !summary.monetaryScope.isComparable
                  ? 'bg-orange-400/10 text-orange-100'
                  : summary.netPnL > 0
                  ? 'bg-emerald-400/10 text-emerald-300'
                  : summary.netPnL < 0
                    ? 'bg-red-400/10 text-red-300'
                    : 'bg-white/10 text-white/50'
              }`}
            >
              {summary.monetaryScope.isComparable ? formatMoney(summary.netPnL, summary.monetaryScope.currency, 0, locale) : text('Gesperrt', 'Unavailable')}
            </span>
          ) : null}
        </div>

        {summary ? (
          <div className="mt-4 space-y-2 text-xs text-white/58">
            <p className="font-medium text-white/74">{summary.tradeCount} {summary.tradeCount === 1 ? 'Trade' : 'Trades'}</p>
            <p className="truncate">{summary.markets[0] ?? summary.setups[0] ?? '—'}</p>
            <p className="truncate text-[11px] text-white/42">{summary.riskTradeCount ? `${summary.riskTradeCount} Risk-Trade${summary.riskTradeCount === 1 ? '' : 's'} · ${summary.maxActualRiskPercent ? text(`max ${summary.maxActualRiskPercent.toFixed(2)}% Konto`, `max ${summary.maxActualRiskPercent.toFixed(2)}% of account`) : text('Margin/Hebel da', 'Margin or leverage recorded')}` : text('Noch kein Risk-Kontext', 'No risk data')}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {summary.openTradeCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
                  <AppIcon name="spark" className="h-3 w-3" />
                  {text(`${summary.openTradeCount} offen`, `${summary.openTradeCount} open`)}
                </span>
              ) : null}
              {summary.screenshotTradeCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-0.5 text-[10px] text-orange-100/90">
                  <AppIcon name="scan" className="h-3 w-3" />
                  {text(`${summary.screenshotTradeCount} ${summary.screenshotTradeCount === 1 ? 'Bild' : 'Bilder'}`, `${summary.screenshotTradeCount} ${summary.screenshotTradeCount === 1 ? 'image' : 'images'}`)}
                </span>
              ) : null}
              {summary.riskTradeCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/75">
                  <AppIcon name="cost" className="h-3 w-3" />
                  {summary.maxActualRiskPercent ? text(`${summary.maxActualRiskPercent.toFixed(2)}% Konto`, `${summary.maxActualRiskPercent.toFixed(2)}% of account`) : text(`${summary.riskTradeCount} Risk`, `${summary.riskTradeCount} with risk`)}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 text-xs text-white/24">{text('Kein Eintrag', 'No entries')}</div>
        )}
      </button>
    </FuturisticCard>
  )
}
