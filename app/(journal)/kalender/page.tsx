import { AppShell } from '@/components/layout/app-shell'
import { CalendarOverview } from '@/components/calendar/calendar-overview'
import { getJournalAccess } from '@/lib/server/auth'
import { getCalendarSnapshotServer } from '@/lib/server/journal'
import { mapTradeRowToTrade } from '@/lib/server/transformers'

export const dynamic = 'force-dynamic'

type KalenderPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function resolveMonthParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value
  const match = raw?.match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  const now = new Date()

  if (!match) return { year: now.getFullYear(), month: now.getMonth() }

  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
  }
}

function buildMonthRange(year: number, month: number) {
  const from = new Date(Date.UTC(year, month, 1)).toISOString()
  const to = new Date(Date.UTC(year, month + 1, 1)).toISOString()
  return { from, to }
}

export default async function KalenderPage({ searchParams }: KalenderPageProps) {
  const params = (await searchParams) ?? {}
  const { year, month } = resolveMonthParam(params.month)
  const access = await getJournalAccess()
  const snapshot = await getCalendarSnapshotServer(access.user?.id, buildMonthRange(year, month))
  const trades = snapshot.tradeRows.map((row) => mapTradeRowToTrade(row))

  return (
    <AppShell>
      <CalendarOverview
        key={`${year}-${month}`}
        trades={trades}
        initialYear={year}
        initialMonth={month}
      />
    </AppShell>
  )
}
