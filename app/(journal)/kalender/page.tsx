import { calendarDateKey, isCalendarDateKey } from '@/lib/utils/calendar'
import { startOfJournalDay } from '@/lib/utils/journal-day'
import { getBerlinTodayDateKey } from '@/lib/utils/daily-notes'
import { AppShell } from '@/components/layout/app-shell'
import { CalendarOverview } from '@/components/calendar/calendar-overview'
import { getJournalAccess } from '@/lib/server/auth'
import { getCalendarSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'

export const dynamic = 'force-dynamic'

type KalenderPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function resolveMonthParam(value: string | string[] | undefined, today: string) {
  const raw = Array.isArray(value) ? value[0] : value
  const match = raw?.match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  const [year, month] = today.split('-').map(Number)
  if (!match || Number(match[1]) < 1000 || Number(match[1]) > 9998) return { year, month: month - 1 }

  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
  }
}

function buildMonthRange(year: number, month: number) {
  const nextYear = month === 11 ? year + 1 : year
  const nextMonth = (month + 1) % 12
  const from = startOfJournalDay(calendarDateKey(year, month, 1)).toISOString()
  const to = startOfJournalDay(calendarDateKey(nextYear, nextMonth, 1)).toISOString()
  return { from, to }
}

export default async function KalenderPage({ searchParams }: KalenderPageProps) {
  const params = (await searchParams) ?? {}
  const today = getBerlinTodayDateKey()
  const { year, month } = resolveMonthParam(params.month, today)
  const dayParam = Array.isArray(params.day) ? params.day[0] : params.day
  const monthKey = calendarDateKey(year, month, 1).slice(0, 7)
  const initialDateKey = isCalendarDateKey(dayParam) && dayParam.startsWith(monthKey) ? dayParam : null
  const access = await getJournalAccess()
  const snapshot = await getCalendarSnapshotServer(access.user?.id, buildMonthRange(year, month))
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))

  return (
    <AppShell>
      <CalendarOverview
        key={`${year}-${month}-${initialDateKey ?? ''}`}
        trades={trades}
        initialYear={year}
        initialMonth={month}
        todayDateKey={today}
        initialDateKey={initialDateKey}
      />
    </AppShell>
  )
}
