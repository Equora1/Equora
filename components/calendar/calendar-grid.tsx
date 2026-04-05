import { CalendarDayCard } from '@/components/calendar/calendar-day-card'
import type { CalendarDaySummary } from '@/lib/utils/calendar'
import { buildMonthGrid } from '@/lib/utils/calendar'

const weekdayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export function CalendarGrid({
  year,
  month,
  summaries,
  selectedDateKey,
  onSelectDay,
}: {
  year: number
  month: number
  summaries: CalendarDaySummary[]
  selectedDateKey?: string | null
  onSelectDay?: (dateKey: string | null) => void
}) {
  const cells = buildMonthGrid(year, month)
  const getSummary = (day: number | null) =>
    day ? summaries.find((item) => item.year === year && item.month === month && item.day === day) : undefined

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-3">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-2 text-[10px] uppercase tracking-[0.25em] text-white/35">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {cells.map((cell, index) => {
          const summary = getSummary(cell.day)
          return (
            <CalendarDayCard
              key={`${cell.day ?? 'empty'}-${index}`}
              day={cell.day}
              summary={summary}
              isSelected={Boolean(summary && summary.dateKey === selectedDateKey)}
              onSelect={summary ? () => onSelectDay?.(summary.dateKey) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
