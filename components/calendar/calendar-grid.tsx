import type { JournalLocale } from '@/lib/i18n/journal'
import { CalendarDayCard } from '@/components/calendar/calendar-day-card'
import type { CalendarDaySummary } from '@/lib/utils/calendar'
import { buildMonthGrid, calendarDateKey } from '@/lib/utils/calendar'

const weekdayLabels = {
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

export function CalendarGrid({
  locale,
  todayDateKey,
  year,
  month,
  summaries,
  selectedDateKey,
  onSelectDay,
}: {
  locale: JournalLocale
  todayDateKey: string
  year: number
  month: number
  summaries: CalendarDaySummary[]
  selectedDateKey?: string | null
  onSelectDay?: (dateKey: string | null) => void
}) {
  const cells = buildMonthGrid(year, month)
  const getDateKey = (day: number) => calendarDateKey(year, month, day)
  const getSummary = (day: number | null) =>
    day ? summaries.find((item) => item.year === year && item.month === month && item.day === day) : undefined

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-3">
        {weekdayLabels[locale].map((label) => (
          <div key={label} className="px-2 text-[10px] uppercase tracking-[0.25em] text-white/35">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {cells.map((cell, index) => {
          const summary = getSummary(cell.day)
          const dateKey = cell.day ? getDateKey(cell.day) : null
          return (
            <CalendarDayCard
              locale={locale}
              key={`${cell.day ?? 'empty'}-${index}`}
              day={cell.day}
              summary={summary}
              isToday={Boolean(dateKey && dateKey === todayDateKey)}
              isSelected={Boolean(dateKey && dateKey === selectedDateKey)}
              onSelect={dateKey ? () => onSelectDay?.(dateKey) : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
