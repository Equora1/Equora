import { AppIcon } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import type { CalendarDaySummary } from '@/lib/utils/calendar'

export function CalendarDayCard({
  day,
  summary,
  isCurrentMonth = true,
  isSelected = false,
  onSelect,
}: {
  day: number | null
  summary?: CalendarDaySummary
  isCurrentMonth?: boolean
  isSelected?: boolean
  onSelect?: () => void
}) {
  if (!day) return <div className="rounded-2xl border border-white/5 bg-black/10 p-3 opacity-30" />

  const glow = summary ? (summary.netPnL > 0 ? 'emerald' : summary.netPnL < 0 ? 'red' : 'none') : 'none'

  return (
    <FuturisticCard
      glow={glow}
      className={`min-h-[136px] p-0 ${!isCurrentMonth ? 'opacity-50' : ''} ${isSelected ? 'ring-1 ring-orange-300/50' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-h-[136px] w-full p-3 text-left transition hover:bg-white/[0.03]"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-white">{day}</span>
          {summary ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                summary.netPnL > 0
                  ? 'bg-emerald-400/10 text-emerald-300'
                  : summary.netPnL < 0
                    ? 'bg-red-400/10 text-red-300'
                    : 'bg-white/10 text-white/50'
              }`}
            >
              {summary.netPnL >= 0 ? '+' : ''}
              {summary.netPnL.toFixed(0)} €
            </span>
          ) : null}
        </div>

        {summary ? (
          <div className="mt-4 space-y-2 text-xs text-white/58">
            <p className="font-medium text-white/74">{summary.tradeCount} Trades</p>
            <p className="truncate">{summary.markets[0] ?? summary.setups[0] ?? '—'}</p>
            <p className="truncate text-[11px] text-white/42">{summary.riskTradeCount ? `${summary.riskTradeCount} Risk-Trade${summary.riskTradeCount === 1 ? '' : 's'} · ${summary.maxActualRiskPercent ? `max ${summary.maxActualRiskPercent.toFixed(2)}% Konto` : 'Margin/Hebel da'}` : 'Noch kein Risk-Kontext'}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {summary.openTradeCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
                  <AppIcon name="spark" className="h-3 w-3" />
                  {summary.openTradeCount} offen
                </span>
              ) : null}
              {summary.screenshotTradeCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/20 bg-orange-400/10 px-2 py-0.5 text-[10px] text-orange-100/90">
                  <AppIcon name="scan" className="h-3 w-3" />
                  {summary.screenshotTradeCount} Bild
                </span>
              ) : null}
              {summary.riskTradeCount ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/75">
                  <AppIcon name="cost" className="h-3 w-3" />
                  {summary.maxActualRiskPercent ? `${summary.maxActualRiskPercent.toFixed(2)}% Konto` : `${summary.riskTradeCount} Risk`}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 text-xs text-white/24">Kein Eintrag</div>
        )}
      </button>
    </FuturisticCard>
  )
}
